import { describe, expect, it } from 'vitest';
import type { Event, MciState } from '@/app/types';
import {
  arrivePatch,
  currentLog,
  declareMci,
  deriveMci,
  mciCsvLines,
  mciQuickMoveArea,
  mciRecords,
  mciRouteArea,
  mciSeries,
  movePatch,
  movePatientInOrderPatch,
  reassignPatientPatch,
  routedMovePatch,
  standDownMci,
  tagPatch,
} from './mci';

/**
 * Color-locked treatment zones (a tarp takes only its own color), re-declaring
 * after a stand-down (keep the earlier MCI, or archive it and start a new one)
 * and the Treatment Lead's transport order.
 */

let seq = 0;
const ctx = (now = 1000) => ({ now, newId: () => `id${++seq}` });

function base(over: Partial<Event> = {}): Event {
  return { id: 'e1', name: 'Drill', staff: [], supervisor: [], calls: [], clinics: [{ id: 'c1', name: 'Clinic' }], ...over } as unknown as Event;
}

/** Zone A, a red and a yellow tarp, and the clinic. */
function declared(): Event {
  const e = base();
  return {
    ...e,
    ...declareMci(
      e,
      {
        zones: [{ id: 'za', name: 'Zone A' }],
        areas: [
          { id: 'red', name: 'Red treatment', color: 'red' },
          { id: 'yellow', name: 'Yellow treatment', color: 'yellow' },
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

describe('color treatment zones', () => {
  it('routes each color to its tarp, a preferred location that takes it, or anywhere that takes any color', () => {
    const mci = declared().mci!;
    expect(mciRouteArea(mci, 'red')?.id).toBe('red');
    expect(mciRouteArea(mci, 'yellow', 'red')?.id).toBe('yellow');
    expect(mciRouteArea(mci, 'red', 'c1')?.id).toBe('c1');
    // No green tarp: the clinic takes green.
    expect(mciRouteArea(mci, 'green')?.id).toBe('c1');
    expect(mciRouteArea({ areas: [{ id: 'red', color: 'red' as const }] }, 'green')).toBeUndefined();
  });

  it('refuses a move or walk-in of the wrong color into a tarp', () => {
    let e = declared();
    e = apply(e, tagPatch(e, 'za', 'yellow', 1, ctx()));
    expect(movePatch(e, 'za', 'red', { yellow: 1 }, ctx()).error).toBe('wrong-color');
    expect(arrivePatch(e, 'red', 'yellow', 1, ctx()).error).toBe('wrong-color');
    expect(movePatch(e, 'za', 'c1', { yellow: 1 }, ctx()).error).toBeUndefined();
  });

  it('moves a mixed submission to each color tarp in one batch', () => {
    let e = declared();
    e = apply(e, tagPatch(e, 'za', 'red', 2, ctx()));
    e = apply(e, tagPatch(e, 'za', 'yellow', 1, ctx()));
    e = apply(e, routedMovePatch(e, 'za', { red: 2, yellow: 1 }, undefined, ctx(2000)));
    expect(areaStats(e, 'red').inTreatment.red).toBe(2);
    expect(areaStats(e, 'yellow').inTreatment.yellow).toBe(1);
    const moved = e.mci!.log.filter((x) => x.kind === 'moved');
    expect(new Set(moved.map((x) => x.batch)).size).toBe(1);
  });

  it('quick moves prefer each color tarp until a location that takes any color is used', () => {
    let e = declared();
    expect(mciQuickMoveArea(e.mci, 'za')).toBeUndefined();
    e = apply(e, tagPatch(e, 'za', 'green', 1, ctx()));
    e = apply(e, movePatch(e, 'za', 'c1', { green: 1 }, ctx()));
    expect(mciQuickMoveArea(e.mci, 'za')).toBe('c1');
  });

  it('moves a re-tagged patient to the tarp of their new color, or flags them when there is none', () => {
    let e = declared();
    e = apply(e, arrivePatch(e, 'yellow', 'yellow', 2, ctx()));
    const [first, second] = deriveMci(e).patients;
    e = apply(e, reassignPatientPatch(e, first.id, { color: 'red' }, undefined, ctx()));
    expect(deriveMci(e).patients.find((p) => p.id === first.id)).toMatchObject({ areaId: 'red', color: 'red' });
    e = apply(e, reassignPatientPatch(e, second.id, { color: 'green' }, undefined, ctx()));
    const flagged = areaStats(e, 'yellow').patients.find((p) => p.id === second.id)!;
    expect(flagged).toMatchObject({ color: 'green', misplaced: true });
    // Moving them by hand to a tarp of another color is refused.
    expect(reassignPatientPatch(e, second.id, { areaId: 'red' }, undefined, ctx()).error).toBe('wrong-color');
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
