import { describe, expect, it } from 'vitest';
import type { Layer, Staff } from '@/app/types';
import { applyChanges } from '../data/autoLocationStore';
import {
  DWELL_AT_MS,
  DWELL_MS,
  EMPTY_TRACK,
  formatDistance,
  parsePlacement,
  place,
  postPoints,
  step,
  type NamedPoint,
  type Placement,
  type TrackState,
} from './autoLocation';

const base = { lat: 45.0012, lon: -100.0021 };
const M = 1 / 111_195; // degrees of latitude per meter
const north = (m: number) => ({ lat: base.lat + m * M, lon: base.lon });
const posts: NamedPoint[] = [
  { name: 'Gate A', ...north(0) },
  { name: 'Gate B', ...north(60) },
];
// Two posts far enough apart to be "near" neither for a stretch between them.
const spread: NamedPoint[] = [
  { name: 'Gate A', ...north(0) },
  { name: 'Gate C', ...north(150) },
];
const T0 = Date.parse('2026-10-09T10:00:00Z');
const at = (post: string): Placement => ({ post, band: 'at', shownM: 0, label: post });
const near = (post: string): Placement => ({ post, band: 'near', shownM: 0, label: `Near ${post}` });

/** Feeds positions (meters north) a few seconds apart and returns the final state. */
function run(meters: number[], gapMs = 5_000, from: TrackState = EMPTY_TRACK, t0 = T0): TrackState {
  let s = from;
  meters.forEach((m, i) => (s = step(s, north(m), posts, t0 + i * gapMs)));
  return s;
}

describe('place', () => {
  it('words the distance from the nearest post', () => {
    expect(place(north(10), posts, null)!.label).toBe('Gate A');
    expect(place(north(-70), posts, null)!.label).toBe('Near Gate A');
    expect(place(north(-260), posts, null)!.label).toBe('250 m from Gate A');
    expect(place(north(-1190), posts, null)!.label).toBe('1.2 km from Gate A');
  });

  it('never reverse geocodes: no posts, no label', () => {
    expect(place(north(0), [], null)).toBeNull();
  });

  it('stays at a post until past its capture radius plus a margin', () => {
    // 32 m from A, 28 m from B: B is closer, but the team was at A and hasn't left it.
    expect(place(north(32), posts, at('Gate A'))!.label).toBe('Gate A');
    // Left A, not yet inside B's radius: anchored to A.
    expect(place(north(34), posts, at('Gate A'))!.label).toBe('Near Gate A');
    // Inside B's radius: at B.
    expect(place(north(36), posts, at('Gate A'))!.label).toBe('Gate B');
  });

  it('stays anchored to the last post between posts until another is clearly closer', () => {
    expect(place(north(80), spread, near('Gate A'))!.label).toBe('Near Gate A'); // 80 m from A, 70 m from C
    expect(place(north(80), spread, null)!.label).toBe('Near Gate C'); // no history: nearest
    expect(place(north(90), spread, near('Gate A'))!.label).toBe('Near Gate C'); // C is 30 m closer
  });

  it('keeps a far distance until the team has really moved', () => {
    const far = place(north(-260), posts, null)!;
    expect(place(north(-285), posts, far)!.shownM).toBe(250);
    expect(place(north(-330), posts, far)!.shownM).toBe(350);
  });
});

describe('parsePlacement', () => {
  it('reads back every label this module writes, for known posts only', () => {
    for (const label of ['Gate A', 'Near Gate A', '250 m from Gate A', '1.2 km from Gate B']) {
      expect(parsePlacement(label, posts)?.label).toBe(label);
    }
    expect(parsePlacement('1.2 km from Gate B', posts)).toMatchObject({ post: 'Gate B', band: 'away', shownM: 1200 });
    expect(parsePlacement('Near Stage', posts)).toBeNull();
    expect(parsePlacement('Roaming', posts)).toBeNull();
    expect(parsePlacement(undefined, posts)).toBeNull();
  });
});

describe('formatDistance', () => {
  it('uses km from 1000 m', () => {
    expect(formatDistance(950)).toBe('950 m');
    expect(formatDistance(2000)).toBe('2 km');
  });
});

describe('step', () => {
  it('uses arriving at a post after a short dwell', () => {
    expect(run([0]).current).toBeNull();
    expect(run([0, 0], DWELL_AT_MS).current?.label).toBe('Gate A');
  });

  it('ignores a brief excursion (no flicker)', () => {
    const settled = run([0, 0, 0]);
    const s = run([-50, -50, 0, 0], 5_000, settled, T0 + 60_000);
    expect(s.current?.label).toBe('Gate A');
    expect(s.pending).toBeNull();
  });

  it('switches once a new label holds for its dwell time', () => {
    const settled = run([0, 0, 0]);
    const s = run([-50, -50, -50, -50], DWELL_MS / 3, settled, T0 + 60_000);
    expect(s.current?.label).toBe('Near Gate A');
  });

  it('lets a pending label take effect without a new position', () => {
    const pending = run([0]);
    expect(step(pending, null, posts, T0 + DWELL_AT_MS).current?.label).toBe('Gate A');
  });

  it('adopts the label stored on the unit, so another page\'s write is built on, not undone', () => {
    // This page thinks "Near Gate B"; another page already stored "Gate A". At 32 m from A the team is still at A.
    const mine: TrackState = { current: near('Gate B'), pending: null };
    const s = step(mine, north(32), posts, T0, at('Gate A'));
    expect(s.current?.label).toBe('Gate A');
    expect(s.pending).toBeNull();
  });

  it('two pages sharing the stored label never undo each other (walk A to B with GPS noise)', () => {
    // Correlated noise of up to about 8 m, deterministic.
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
    let drift = 0;
    const track: { t: number; m: number }[] = [];
    for (let i = 0; i < 240; i++) {
      drift = Math.max(-8, Math.min(8, drift + rand() * 3));
      const truth = i < 80 ? 0 : i < 160 ? ((i - 80) / 80) * 60 : 60;
      track.push({ t: T0 + i * 1_000, m: truth + drift });
    }
    let stored: Placement | null = null;
    const writes: { t: number; label: string }[] = [];
    const pages = [{ s: EMPTY_TRACK, every: 1, lag: 0 }, { s: EMPTY_TRACK, every: 2, lag: 1 }];
    for (let i = 0; i < track.length; i++) {
      for (const page of pages) {
        const sample = track[i - page.lag];
        const fresh = sample && i % page.every === 0;
        page.s = step(page.s, fresh ? north(sample.m) : null, posts, track[i]!.t, stored);
        const label = page.s.current?.label;
        if (label && label !== stored?.label) {
          stored = parsePlacement(label, posts);
          writes.push({ t: track[i]!.t, label });
        }
      }
    }
    expect(writes[0]!.label).toBe('Gate A');
    expect(writes.at(-1)!.label).toBe('Gate B');
    // No back-and-forth: a label never comes back within 30 s of being replaced.
    for (let i = 2; i < writes.length; i++) {
      if (writes[i]!.label === writes[i - 2]!.label) expect(writes[i]!.t - writes[i - 2]!.t).toBeGreaterThan(30_000);
    }
    expect(writes.length).toBeLessThanOrEqual(4);
  });
});

describe('postPoints', () => {
  it('takes posts with coordinates on a drawn-area layer and skips unplaced ones', () => {
    const layer = {
      id: 'l1',
      name: 'Main',
      posts: [{ name: 'Geo', lat: 1, lng: 2 }, { name: 'Loose' }, 'Legacy'],
      area: { polygon: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }] },
    } as unknown as Layer;
    expect(postPoints([layer], () => undefined)).toEqual([{ name: 'Geo', lat: 1, lon: 2 }]);
  });
});

describe('applyChanges', () => {
  const now = new Date(T0);
  const team = (over: Partial<Staff>): Staff => ({ id: 't1', team: 'Team 1', location: 'Gate A', status: 'Available', members: [], ...over });
  const change = (from: string, label: string) => [{ teamId: 't1', from, label }];

  it('writes the location, logs "Location changed to" and leaves status and timer alone', () => {
    const { units, applied } = applyChanges([team({ statusSince: 5 })], change('Gate A', 'Near Gate A'), now);
    expect(applied).toBe(1);
    expect(units[0]).toMatchObject({ location: 'Near Gate A', status: 'Available', statusSince: 5 });
    expect(units[0]!.log?.at(-1)?.message).toMatch(/ - Location changed to Near Gate A$/);
  });

  it('tracks teams on a call or in the clinic too, without touching their status', () => {
    expect(applyChanges([team({ status: 'En Route', location: 'Stage' })], change('Stage', 'Near Gate B'), now).units[0])
      .toMatchObject({ location: 'Near Gate B', status: 'En Route' });
    expect(applyChanges([team({ status: 'In Clinic', location: 'Clinic' })], change('Clinic', 'Gate A'), now).units[0])
      .toMatchObject({ location: 'Gate A', status: 'In Clinic' });
  });

  it('skips a unit whose Location changed since it was read', () => {
    expect(applyChanges([team({ location: 'Roaming' })], change('Gate A', 'Gate B'), now).applied).toBe(0);
  });
});
