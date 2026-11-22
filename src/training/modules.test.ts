import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeLiteDraftToEvent } from '@/lib/liteEventAdapters';
import { addCall } from './actions';
import { allowedText, checkWrite } from './gate';
import { allModules, allTracks, sectionsOf, unlockIndex } from './registry';
import { boardAtStep, gateVerdict, stepKind } from './replay';
import { parseStepText } from './text';
import { extensions } from '@/extensions';
import { baseStaff, POSTS } from './fixtures';
import { alongRoute, parsePracticeMap, PRACTICE_MAP } from './practiceMap';
import { travelRoute } from './trackingFeed';
import type { TrainingModule } from './types';

/**
 * Every training module, checked without a browser. Runs in CI with the
 * rest of the unit tests, so a change to the board's data, a test id or a
 * module that breaks a lesson fails here (docs/TRAINING.md). The Playwright
 * walk-through (tests/e2e/training.spec.ts) checks the real UI path.
 */

const SRC = join(__dirname, '..');

/** Every data-testid in src: literal ids, and the fixed prefix of template ones (`team-card-${x}`). */
function testIdsInSource() {
  const literal = new Set<string>();
  const prefixes = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== 'training' && name !== 'node_modules') walk(path);
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        const text = readFileSync(path, 'utf8');
        for (const m of text.matchAll(/data-testid=["']([^"']+)["']/g)) literal.add(m[1]);
        for (const m of text.matchAll(/data-testid=\{`([^`$]*)(\$\{)?/g)) (m[2] ? prefixes : literal).add(m[1]);
        for (const m of text.matchAll(/data-testid=\{["']([^"']+)["']\}/g)) literal.add(m[1]);
        // Components that forward a `testId` prop to data-testid (modals, Pick, ...).
        // Also props that forward to one (formTestId, bodyTestId, ...).
        for (const m of text.matchAll(/[tT]estId=["']([^"']+)["']/g)) literal.add(m[1]);
        // Objects that carry a test id for something rendered elsewhere (an extension pack's tab).
        for (const m of text.matchAll(/testId:\s*["']([^"']+)["']/g)) literal.add(m[1]);
        for (const m of text.matchAll(/testId=\{`([^`$]*)(\$\{)?/g)) (m[2] ? prefixes : literal).add(m[1]);
        // Lists that add each item's key to a prefix (UnitPickerItems: `call-add-team-${unit}`).
        for (const m of text.matchAll(/testIdPrefix=["']([^"']+)["']/g)) prefixes.add(`${m[1]}-`);
      }
    }
  };
  walk(SRC);
  // The training player's own ids.
  walk(join(SRC, 'components', 'training'));
  return { literal, prefixes };
}

const ids = testIdsInSource();
const idExists = (id: string) => ids.literal.has(id) || [...ids.prefixes].some((p) => p && id.startsWith(p));

/** Whether some test id in src starts with `prefix` (a `[data-testid^="..."]` selector). */
const idPrefixExists = (prefix: string) =>
  [...ids.literal].some((id) => id.startsWith(prefix)) || [...ids.prefixes].some((p) => p.startsWith(prefix) || prefix.startsWith(p));

/** Whether every test id an anchor refers to exists. */
function anchorResolves(anchor: string): { ok: boolean; missing: string[] } {
  if (!anchor.startsWith('css:')) return idExists(anchor) ? { ok: true, missing: [] } : { ok: false, missing: [anchor] };
  const missing = [
    ...[...anchor.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]).filter((id) => !idExists(id)),
    ...[...anchor.matchAll(/data-testid\^="([^"]+)"/g)].map((m) => m[1]).filter((p) => !idPrefixExists(p)),
  ];
  return { ok: missing.length === 0, missing };
}

function anchorsOf(module: TrainingModule): string[] {
  return module.steps.flatMap((s) => [...(s.anchors ?? []), ...(s.anchor ? [s.anchor] : []), ...(s.doneWhenVisible ? [s.doneWhenVisible] : []), ...(s.doClicks ?? [])]);
}

describe("extension packs' panel steps", () => {
  it('point only at test ids that exist', () => {
    const anchors = extensions.flatMap((x) => x.training?.panelSteps ?? []).flatMap((s) => [...(s.anchors ?? []), ...(s.anchor ? [s.anchor] : []), ...(s.doneWhenVisible ? [s.doneWhenVisible] : []), ...(s.doClicks ?? [])]);
    for (const anchor of anchors) expect(anchorResolves(anchor).missing, `anchor ${anchor}`).toEqual([]);
  });
});

describe('training registry', () => {
  it('has unique module ids, each on a known track', () => {
    const seen = new Set<string>();
    for (const m of allModules()) {
      expect(seen.has(m.id), `duplicate module id ${m.id}`).toBe(false);
      seen.add(m.id);
      expect(allTracks().some((t) => t.id === m.track), `${m.id}: unknown track ${m.track}`).toBe(true);
    }
  });
});

describe.each(allModules().map((m) => [m.id, m] as const))('training module %s', (_id, module) => {
  it('has well-formed steps', () => {
    expect(module.steps.length).toBeGreaterThan(0);
    expect(module.practice.length).toBeGreaterThan(0);
    const stepIds = module.steps.map((s) => s.id);
    expect(new Set(stepIds).size, 'step ids must be unique').toBe(stepIds.length);
    const sections = sectionsOf(module).map((s) => s.name);
    expect(new Set(sections).size, 'a section must be one run of steps').toBe(sections.length);
    for (const step of module.steps) {
      expect(step.estSec, `${step.id}: estSec`).toBeGreaterThan(0);
      expect(step.title.length, `${step.id}: title`).toBeLessThanOrEqual(40);
      if (stepKind(step) === 'data') expect(step.apply, `${step.id}: a data step needs apply`).toBeTypeOf('function');
    }
    if (module.unlockAfter) expect(stepIds).toContain(module.unlockAfter);
    expect(unlockIndex(module)).toBeGreaterThanOrEqual(0);
  });

  it('lists every value to type as a chip in the step text', () => {
    for (const step of module.steps) {
      const chips = parseStepText(step.body, (k) => k).filter((p) => p.kind === 'value').map((p) => p.text);
      for (const value of step.values ?? []) expect(chips, `${step.id}: \`${value}\` missing from the text`).toContain(value);
    }
  });

  it('points only at test ids that exist', () => {
    for (const anchor of anchorsOf(module)) {
      expect(anchorResolves(anchor).missing, `${module.id}: anchor ${anchor} has no matching data-testid in src`).toEqual([]);
    }
  });

  it('replays: each data step is not done before it and done after its apply', () => {
    module.steps.forEach((step, i) => {
      if (stepKind(step) !== 'data') return;
      const before = normalizeLiteDraftToEvent(boardAtStep(module, i));
      expect(step.done!(before), `${step.id}: already done before the step`).toBe(false);
      expect(step.done!(step.apply!(before)), `${step.id}: not done after apply`).toBe(true);
    });
  });

  it("passes the write gate with the script's own values", () => {
    // A role module's view writes through its own practice sender, not the dispatch page's gated store.
    if (module.surface) return;
    module.steps.forEach((step, i) => {
      if (!step.apply || step.free || i > unlockIndex(module)) return;
      const before = normalizeLiteDraftToEvent(boardAtStep(module, i));
      const allowed = allowedText(module.steps.slice(0, i + 1).flatMap((s) => s.values ?? []));
      const verdict = checkWrite(before, step.apply(before), allowed);
      expect(verdict.rejected, `${step.id}: the gate would turn away its own script`).toEqual([]);
    });
  });
});

describe('write gate', () => {
  const lesson = allModules().find((m) => m.id === 'call-assignment')!;
  const board = normalizeLiteDraftToEvent(lesson.seed());

  it('turns away text the script did not ask for', () => {
    const next = addCall(board, { location: 'Jane Doe, 42 Elm St', chiefComplaint: 'Chest pain' });
    const verdict = checkWrite(board, next, allowedText(['Sather Gate', 'Dizzy']));
    expect(verdict.ok).toBe(false);
    expect(verdict.rejected).toEqual(expect.arrayContaining(['jane doe, 42 elm st', 'chest pain']));
  });

  it('accepts scripted values in any case and their Age/Sex parts', () => {
    const next = addCall(board, { location: 'sather gate', age: '34', gender: 'M', chiefComplaint: 'DIZZY' });
    expect(checkWrite(board, next, allowedText(['Sather Gate', '34M', 'Dizzy'])).ok).toBe(true);
  });

  it('accepts text that was already on the board', () => {
    const next = addCall(board, { location: 'Lower Sproul' });
    expect(checkWrite(board, next, allowedText([])).ok).toBe(true);
  });

  it('is off once the module unlocks, so free practice takes any text', () => {
    const next = addCall(board, { location: 'Riverbank Bench', chiefComplaint: 'Sprained ankle' });
    expect(gateVerdict(lesson, { index: 1, unlocked: false, complete: false }, board, next).ok).toBe(false);
    expect(gateVerdict(lesson, { index: 1, unlocked: true, complete: false }, board, next).ok).toBe(true);
    expect(gateVerdict(lesson, { index: lesson.steps.length - 1, unlocked: false, complete: true }, board, next).ok).toBe(true);
  });
});

describe('training map (src/training/maps/practice-map.json)', () => {
  const places = new Set([...PRACTICE_MAP.posts, ...PRACTICE_MAP.clinics].map((p) => p.name));

  it('has every feature in a form the loader knows', () => {
    expect(PRACTICE_MAP.unknown, 'features with no Location, Clinic, Zone, Area or TAKPath property').toEqual([]);
  });

  it('has every place the module scripts name (rename a place on the map and in fixtures.ts POSTS together)', () => {
    for (const [key, name] of Object.entries(POSTS)) expect(places.has(name), `POSTS.${key} "${name}" is not on the map`).toBe(true);
    expect(PRACTICE_MAP.clinics.some((c) => c.name === POSTS.clinic), `the main clinic "${POSTS.clinic}" must be a Clinic point`).toBe(true);
  });

  it('has the zone the MCI module uses', () => {
    expect(PRACTICE_MAP.zones.map((z) => z.name)).toContain('South Zone');
  });

  it('names an existing team on every TAK path', () => {
    const teams = new Set(baseStaff().map((t) => t.team));
    for (const team of Object.keys(PRACTICE_MAP.paths)) expect(teams.has(team), `TAKPath "${team}" matches no team`).toBe(true);
  });

  it('reads Location, Clinic, Zone and TAKPath features, any case', () => {
    const map = parsePracticeMap({
      features: [
        { type: 'Feature', properties: { location: 'A' }, geometry: { type: 'Point', coordinates: [-122, 37] } },
        { type: 'Feature', properties: { Clinic: 'Tent' }, geometry: { type: 'Point', coordinates: [-122.001, 37] } },
        { type: 'Feature', properties: { Zone: 'Z', fill: '#123456' }, geometry: { type: 'Polygon', coordinates: [[[-122, 37], [-122.001, 37], [-122.001, 37.001], [-122, 37]]] } },
        { type: 'Feature', properties: { TAKPath: 'MRC1' }, geometry: { type: 'LineString', coordinates: [[-122, 37], [-122.001, 37.001]] } },
        { type: 'Feature', properties: { note: 'x' }, geometry: { type: 'Point', coordinates: [-122, 37] } },
      ],
    });
    expect(map.posts).toEqual([{ name: 'A', lat: 37, lng: -122 }]);
    expect(map.clinics[0].name).toBe('Tent');
    expect(map.zones[0]).toMatchObject({ name: 'Z', color: '#123456' });
    expect(map.zones[0].coords).toHaveLength(3); // GeoJSON's closing point dropped
    expect(map.paths.MRC1).toHaveLength(2);
    expect(map.unknown).toHaveLength(1);
    expect(map.area).toHaveLength(4); // the box around everything
  });

  it('sends a team along its path when the path ends near where it is going', () => {
    const home = { lat: 37, lng: -122 };
    const path = [{ lat: 37, lng: -122.001 }, { lat: 37.001, lng: -122.001 }];
    expect(travelRoute(home, { lat: 37.001, lng: -122.001 }, path)).toHaveLength(3);
    expect(travelRoute(home, { lat: 36.99, lng: -122 }, path)).toHaveLength(2); // the path leads elsewhere: straight there
    // Legs of about 89 m then 111 m: halfway by distance is just past the corner, on the second leg.
    const half = alongRoute([home, ...path], 0.5);
    expect(half.lng).toBeCloseTo(-122.001, 6);
    expect(half.lat).toBeGreaterThan(37);
    expect(alongRoute([home, ...path], 1)).toEqual(path[1]);
  });
});
