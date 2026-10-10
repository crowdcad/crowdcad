import { describe, expect, it } from 'vitest';
import type { Layer, Staff } from '@/app/types';
import { applyChanges } from '../data/autoLocationStore';
import { bandFor, DWELL_MS, EMPTY_TRACK, formatDistance, place, postPoints, step, type NamedPoint, type TrackState } from './autoLocation';

const base = { lat: 45.0012, lon: -100.0021 };
const M = 1 / 111_195; // degrees of latitude per meter
const north = (m: number) => ({ lat: base.lat + m * M, lon: base.lon });
const posts: NamedPoint[] = [
  { name: 'Gate A', ...north(0) },
  { name: 'Gate B', ...north(60) },
];
const T0 = Date.parse('2026-10-09T10:00:00Z');

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

  it('keeps the current post until another is clearly closer', () => {
    const atA = place(north(0), posts, null)!;
    // 32 m from A, 28 m from B: B is closer, but not by the switch margin.
    expect(place(north(32), posts, atA)!.post).toBe('Gate A');
    expect(place(north(45), posts, atA)!.post).toBe('Gate B');
  });

  it('keeps a far distance until the team has really moved', () => {
    const far = place(north(-260), posts, null)!;
    expect(place(north(-285), posts, far)!.shownM).toBe(250);
    expect(place(north(-330), posts, far)!.shownM).toBe(350);
  });
});

describe('bandFor', () => {
  it('leaves a band only past its edge plus a margin', () => {
    expect(bandFor(27)).toBe('near');
    expect(bandFor(27, 'at')).toBe('at');
    expect(bandFor(40, 'at')).toBe('near');
    expect(bandFor(104, 'near')).toBe('near');
    expect(bandFor(104)).toBe('away');
  });
});

describe('formatDistance', () => {
  it('uses km from 1000 m', () => {
    expect(formatDistance(950)).toBe('950 m');
    expect(formatDistance(2000)).toBe('2 km');
  });
});

describe('step', () => {
  it('uses a label only after it has held for the dwell time', () => {
    expect(run([0, 0, 0]).current).toBeNull();
    const s = run([0, 0, 0, 0, 0]);
    expect(s.current?.label).toBe('Gate A');
  });

  it('ignores a brief excursion (no flicker)', () => {
    const settled = run([0, 0, 0, 0, 0]);
    const s = run([-50, -50, 0, 0], 5_000, settled, T0 + 60_000);
    expect(s.current?.label).toBe('Gate A');
    expect(s.pending).toBeNull();
  });

  it('switches once a new label holds', () => {
    const settled = run([0, 0, 0, 0, 0]);
    const s = run([-50, -50, -50, -50, -50], 5_000, settled, T0 + 60_000);
    expect(s.current?.label).toBe('Near Gate A');
  });

  it('lets a pending label take effect without a new position', () => {
    const pending = run([0]);
    expect(step(pending, null, posts, T0 + DWELL_MS).current?.label).toBe('Gate A');
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
