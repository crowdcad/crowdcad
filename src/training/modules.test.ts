import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeLiteDraftToEvent } from '@/lib/liteEventAdapters';
import { addCall } from './actions';
import { allowedText, checkWrite } from './gate';
import { MODULES, TRACKS, sectionsOf, unlockIndex } from './registry';
import { boardAtStep, gateVerdict, stepKind } from './replay';
import { parseStepText } from './text';
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

/** The test ids an anchor refers to. */
function anchorIds(anchor: string): string[] {
  if (!anchor.startsWith('css:')) return [anchor];
  return [...anchor.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);
}

function anchorsOf(module: TrainingModule): string[] {
  return module.steps.flatMap((s) => [...(s.anchors ?? []), ...(s.anchor ? [s.anchor] : []), ...(s.doneWhenVisible ? [s.doneWhenVisible] : [])]);
}

describe('training registry', () => {
  it('has unique module ids, each on a known track', () => {
    const seen = new Set<string>();
    for (const m of MODULES) {
      expect(seen.has(m.id), `duplicate module id ${m.id}`).toBe(false);
      seen.add(m.id);
      expect(TRACKS.some((t) => t.id === m.track), `${m.id}: unknown track ${m.track}`).toBe(true);
    }
  });
});

describe.each(MODULES.map((m) => [m.id, m] as const))('training module %s', (_id, module) => {
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
      for (const id of anchorIds(anchor)) expect(idExists(id), `${module.id}: no data-testid "${id}" in src`).toBe(true);
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
  const module = MODULES[0];
  const board = normalizeLiteDraftToEvent(module.seed());

  it('turns away text the script did not ask for', () => {
    const next = addCall(board, { location: 'Jane Doe, 42 Elm St', chiefComplaint: 'Chest pain' });
    const verdict = checkWrite(board, next, allowedText(['Gate B', 'Dizzy']));
    expect(verdict.ok).toBe(false);
    expect(verdict.rejected).toEqual(expect.arrayContaining(['jane doe, 42 elm st', 'chest pain']));
  });

  it('accepts scripted values in any case and their Age/Sex parts', () => {
    const next = addCall(board, { location: 'gate b', age: '34', gender: 'M', chiefComplaint: 'DIZZY' });
    expect(checkWrite(board, next, allowedText(['Gate B', '34M', 'Dizzy'])).ok).toBe(true);
  });

  it('accepts text that was already on the board', () => {
    const next = addCall(board, { location: 'Main Stage' });
    expect(checkWrite(board, next, allowedText([])).ok).toBe(true);
  });

  it('is off once the module unlocks, so free practice takes any text', () => {
    const next = addCall(board, { location: 'Riverbank Bench', chiefComplaint: 'Sprained ankle' });
    expect(gateVerdict(module, { index: 1, unlocked: false, complete: false }, board, next).ok).toBe(false);
    expect(gateVerdict(module, { index: 1, unlocked: true, complete: false }, board, next).ok).toBe(true);
    expect(gateVerdict(module, { index: module.steps.length - 1, unlocked: false, complete: true }, board, next).ok).toBe(true);
  });
});
