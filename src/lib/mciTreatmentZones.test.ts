import { describe, expect, it } from 'vitest';
import type { Event, MciState } from '@/app/types';
import {
  arrivePatch,
  currentLog,
  declareMci,
  deriveMci,
  mciCsvLines,
  mciPointOf,
  mciQuickMoveArea,
  mciRecords,
  mciRouteArea,
  mciSeries,
  movePatch,
  movePatientInOrderPatch,
  mciShapePatch,
  reassignPatientPatch,
  routedMovePatch,
  standDownMci,
  tagPatch,
} from './mci';

/**
 * Treatment locations (every one takes every color), re-declaring after a
 * stand-down (keep the earlier MCI, or archive it and start a new one) and the
 * Treatment Lead's transport order.
 */

let seq = 0;
const ctx = (now = 1000) => ({ now, newId: () => `id${++seq}` });

function base(over: Partial<Event> = {}): Event {
  return { id: 'e1', name: 'Drill', staff: [], supervisor: [], calls: [], clinics: [{ id: 'c1', name: 'Clinic' }], ...over } as unknown as Event;
}

/** Zone A, two named treatment locations, and the clinic. */
function declared(): Event {
  const e = base();
  return {
    ...e,
    ...declareMci(
      e,
      {
        zones: [{ id: 'za', name: 'Zone A' }],
        areas: [
          { id: 'red', name: 'Red treatment' },
          { id: 'yellow', name: 'Yellow treatment' },
          { id: 'c1', name: 'Clinic', clinicId: 'c1' },
        ],
      },
      500
    ),
  } as Event;
}

function apply(event: Event, write: { patch: Partial<Event>; error?: string }): Event {
  expect(write.error).toBeUndefined();
  return { ...event, ...write.patch } as Event;
}

const areaStats = (e: Event, id: string) => deriveMci(e).areas.find((a) => a.area.id === id)!;

describe('treatment locations', () => {
  it('routes to the preferred location while it exists, else the first', () => {
    const mci = declared().mci!;
    expect(mciRouteArea(mci)?.id).toBe('red');
    expect(mciRouteArea(mci, 'c1')?.id).toBe('c1');
    expect(mciRouteArea(mci, 'gone')?.id).toBe('red');
    expect(mciRouteArea({ areas: [] })).toBeUndefined();
  });

  it('takes any color anywhere, by move or walk-in', () => {
    let e = declared();
    e = apply(e, tagPatch(e, 'za', 'yellow', 1, ctx()));
    e = apply(e, movePatch(e, 'za', 'red', { yellow: 1 }, ctx()));
    e = apply(e, arrivePatch(e, 'red', 'black', 1, ctx()));
    expect(areaStats(e, 'red').inTreatment).toMatchObject({ yellow: 1, black: 1 });
  });

  it('moves a mixed submission to one location in one batch', () => {
    let e = declared();
    e = apply(e, tagPatch(e, 'za', 'red', 2, ctx()));
    e = apply(e, tagPatch(e, 'za', 'yellow', 1, ctx()));
    e = apply(e, routedMovePatch(e, 'za', { red: 2, yellow: 1 }, 'c1', ctx(2000)));
    expect(areaStats(e, 'c1').inTreatment).toMatchObject({ red: 2, yellow: 1 });
    const moved = e.mci!.log.filter((x) => x.kind === 'moved');
    expect(new Set(moved.map((x) => x.batch)).size).toBe(1);
  });

  it('quick moves go where the zone last sent patients, else the first location', () => {
    let e = declared();
    expect(mciQuickMoveArea(e.mci, 'za')).toBe('red');
    e = apply(e, tagPatch(e, 'za', 'green', 1, ctx()));
    e = apply(e, movePatch(e, 'za', 'c1', { green: 1 }, ctx()));
    expect(mciQuickMoveArea(e.mci, 'za')).toBe('c1');
  });

  it('retriages a patient in place, and moves them anywhere on request', () => {
    let e = declared();
    e = apply(e, arrivePatch(e, 'yellow', 'yellow', 1, ctx()));
    const [first] = deriveMci(e).patients;
    e = apply(e, reassignPatientPatch(e, first.id, { color: 'red' }, undefined, ctx()));
    expect(deriveMci(e).patients.find((p) => p.id === first.id)).toMatchObject({ areaId: 'yellow', color: 'red' });
    e = apply(e, reassignPatientPatch(e, first.id, { areaId: 'c1' }, undefined, ctx()));
    expect(deriveMci(e).patients.find((p) => p.id === first.id)).toMatchObject({ areaId: 'c1', color: 'red' });
  });
});

describe('transport order', () => {
  it('swaps a patient with the one above or below, writing the order shown', () => {
    let e = declared();
    e = apply(e, arrivePatch(e, 'red', 'red', 3, ctx()));
    const ids = areaStats(e, 'red').patients.map((p) => p.id);
    e = apply(e, movePatientInOrderPatch(e, ids[2], 'up'));
    expect(areaStats(e, 'red').patients.map((p) => p.id)).toEqual([ids[0], ids[2], ids[1]]);
    expect(areaStats(e, 'red').patients.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(movePatientInOrderPatch(e, ids[0], 'up').patch).toEqual({});
  });

  it('moves past the next patient of the same color where a location takes several (a column per color)', () => {
    let e = declared();
    e = apply(e, arrivePatch(e, 'c1', 'red', 1, ctx(100)));
    e = apply(e, arrivePatch(e, 'c1', 'yellow', 1, ctx(200)));
    e = apply(e, arrivePatch(e, 'c1', 'red', 1, ctx(300)));
    const [redA, yellow, redB] = areaStats(e, 'c1').patients.map((p) => p.id);
    e = apply(e, movePatientInOrderPatch(e, redB!, 'up'));
    expect(areaStats(e, 'c1').patients.map((p) => p.id)).toEqual([redB, yellow, redA]);
    // The yellow column has one patient: nothing to move past.
    expect(movePatientInOrderPatch(e, yellow!, 'down').patch).toEqual({});
  });
});

describe('re-declaring after a stand-down', () => {
  function stoodDown(): Event {
    let e = declared();
    e = apply(e, tagPatch(e, 'za', 'red', 3, ctx(600)));
    e = apply(e, movePatch(e, 'za', 'red', { red: 1 }, ctx(700)));
    return { ...e, ...standDownMci(e, 900) } as Event;
  }

  it('keep: carries the counts on, retires unticked empty locations and holds those with patients', () => {
    let e = stoodDown();
    const mci = e.mci!;
    // Only the zone is ticked: the yellow tarp and clinic are empty and retire; the red tarp holds a patient.
    e = { ...e, ...declareMci(e, { zones: mci.zones, areas: [], mode: 'keep' }, 1000) } as Event;
    expect(e.mci!.areas.map((a) => a.id)).toEqual(['red']);
    expect(e.mci!.retiredAreas!.map((a) => a.id)).toEqual(['yellow', 'c1']);
    expect(e.mci!.periods).toHaveLength(2);
    expect(deriveMci(e).zones[0].inZone.red).toBe(2);
    // Ticking a retired one again brings it back as it was.
    e = { ...e, ...standDownMci(e, 1100) } as Event;
    e = { ...e, ...declareMci(e, { zones: e.mci!.zones, areas: [{ id: 'c1', name: 'Clinic', clinicId: 'c1' }], mode: 'keep' }, 1200) } as Event;
    expect(e.mci!.areas.map((a) => a.id)).toEqual(['red', 'c1']);
    expect(e.mci!.retiredAreas!.map((a) => a.id)).toEqual(['yellow']);
  });

  it('new: archives the earlier MCI and starts from zero; records and CSV keep both', () => {
    let e = stoodDown();
    const mci = e.mci!;
    e = { ...e, ...declareMci(e, { zones: mci.zones, areas: mci.areas, mode: 'new' }, 1000) } as Event;
    expect(e.mci!.periods).toEqual([{ startedAt: 1000 }]);
    expect(e.mci!.earlier).toHaveLength(1);
    expect(deriveMci(e).totals.taggedTotal).toBe(0);
    expect(deriveMci(e).totals.inTreatmentTotal).toBe(0);
    expect(currentLog(e.mci!)).toHaveLength(0);
    e = apply(e, tagPatch(e, 'za', 'green', 1, ctx(1100)));

    const records = mciRecords(e.mci);
    expect(records).toHaveLength(2);
    expect(deriveMci({ ...e, mci: records[0] }).totals.taggedTotal).toBe(3);
    expect(deriveMci({ ...e, mci: records[1] }).totals.taggedTotal).toBe(1);
    const csv = mciCsvLines(e, (ms) => String(ms));
    expect(csv.filter((l) => l.includes('declared'))).toEqual(['MCI,-,500,"MCI 1 declared"', 'MCI,-,1000,"MCI 2 declared"']);
    // Each MCI's chart starts from zero.
    const series = mciSeries(e.mci);
    expect(series.find((p) => p.t === 1000)).toMatchObject({ inZones: 0, inTreatment: 0 });
  });

  it('without an earlier MCI ignores the mode and adds to what is there', () => {
    const patch = declareMci(base(), { zones: [{ id: 'za', name: 'Zone A' }], areas: [], mode: 'new' }, 500);
    expect((patch.mci as MciState).earlier).toBeUndefined();
  });
});

describe('treatment location points', () => {
  it('places a location as a marked post, and placing it again moves it to the new layer', () => {
    const layers = [
      { id: 'l1', name: 'Ground', mapUrl: 'x.png', posts: ['Gate'] },
      { id: 'l2', name: 'Upper', mapUrl: 'y.png', posts: [] },
    ];
    let e = { ...declared(), venue: { id: 'v', name: 'V', equipment: [], userId: 'u', layers } } as unknown as Event;
    e = apply(e, mciShapePatch(e, { kind: 'area', id: 'red' }, { layerId: 'l1', points: [{ x: 10, y: 20 }] }));
    expect(mciPointOf(e.venue, 'red')).toMatchObject({ layer: { id: 'l1' }, post: { name: 'Red treatment', x: 10, y: 20, mciAreaId: 'red' } });
    expect(e.venue!.layers![0]!.posts).toContain('Gate');
    e = apply(e, mciShapePatch(e, { kind: 'area', id: 'red' }, { layerId: 'l2', points: [{ x: 50, y: 50 }] }));
    expect(mciPointOf(e.venue, 'red')?.layer.id).toBe('l2');
    expect(e.venue!.layers![0]!.posts).toEqual(['Gate']);
    // Never a clinic.
    expect(mciPointOf(e.venue, 'red')?.post.isClinic).toBeUndefined();
  });
});
