import { describe, expect, it } from 'vitest';
import type { Call, Event, MciState, Staff } from '@/app/types';
import { normalizeLiteDraftToEvent, toLiteDraftFromEvent } from './liteEventAdapters';
import type { LiteEventDraft } from './liteEventStore';
import {
  addMciArea,
  addMciZone,
  appendMciEntries,
  clearZonePatch,
  declareMci,
  deriveMci,
  hasMci,
  isMciActive,
  mciAssignmentPatch,
  mciAvailability,
  mciSeries,
  mciStatusOptions,
  mciUnitsAt,
  movePatch,
  regularClinicCount,
  reopenZonePatch,
  setTaggedTotalPatch,
  standDownMci,
  tagPatch,
  undoPatch,
} from './mci';

let seq = 0;
const ctx = (now = 1000) => ({ now, newId: () => `id${++seq}` });

const unit = (over: Partial<Staff> = {}): Staff => ({ team: 'T1', location: 'Gate A', status: 'Available', members: [], ...over });

function baseEvent(over: Partial<Event> = {}): Event {
  return {
    id: 'e1',
    name: 'Drill',
    date: '2026-12-01',
    venue: { id: 'v', name: 'Venue', equipment: [], userId: 'u' },
    postingTimes: [],
    staff: [],
    supervisor: [],
    userId: 'u',
    calls: [],
    eventPosts: [],
    eventEquipment: [],
    ...over,
  } as Event;
}

/** An event with an active MCI: zones A and B, a clinic area and an MCI-only area. */
function activeEvent(over: Partial<Event> = {}): Event {
  const event = baseEvent({ clinics: [{ id: 'c1', name: 'Clinic' }], ...over });
  return {
    ...event,
    ...declareMci(
      event,
      {
        zones: [{ id: 'za', name: 'Zone A' }, { id: 'zb', name: 'Zone B' }],
        areas: [{ id: 'c1', name: 'Clinic', clinicId: 'c1' }, { id: 'ar1', name: 'Overflow' }],
      },
      500
    ),
  } as Event;
}

/** Applies a write's patch to the event, failing the test on an error. */
function apply(event: Event, write: { patch: Partial<Event>; error?: string }): Event {
  expect(write.error).toBeUndefined();
  return { ...event, ...write.patch } as Event;
}

const zone = (event: Event, id: string) => deriveMci(event).zones.find((z) => z.zone.id === id)!;
const area = (event: Event, id: string) => deriveMci(event).areas.find((a) => a.area.id === id)!;

describe('empty and inactive events', () => {
  it('derives to empty without errors when there is no mci', () => {
    const derived = deriveMci(baseEvent());
    expect(derived.zones).toEqual([]);
    expect(derived.areas).toEqual([]);
    expect(derived.totals).toMatchObject({ taggedTotal: 0, inZonesTotal: 0, inTreatmentTotal: 0, regularTotal: 0 });
    expect(isMciActive(baseEvent())).toBe(false);
    expect(hasMci(baseEvent())).toBe(false);
    expect(mciSeries(undefined)).toEqual([]);
  });

  it('refuses writes when no MCI is active', () => {
    expect(tagPatch(baseEvent(), 'za', 'red', 1, ctx()).error).toBe('inactive');
    const stood = { ...activeEvent(), ...standDownMci(activeEvent(), 2000) } as Event;
    expect(tagPatch(stood, 'za', 'red', 1, ctx()).error).toBe('inactive');
    expect(hasMci(stood)).toBe(true);
  });
});

describe('counts', () => {
  it('counts tagged, moved and in-zone per color', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 3, ctx()));
    e = apply(e, tagPatch(e, 'za', 'green', 5, ctx()));
    e = apply(e, movePatch(e, 'za', 'c1', { red: 2, green: 1 }, ctx()));
    const z = zone(e, 'za');
    expect(z.tagged).toEqual({ red: 3, yellow: 0, green: 5, black: 0 });
    expect(z.moved).toEqual({ red: 2, yellow: 0, green: 1, black: 0 });
    expect(z.inZone).toEqual({ red: 1, yellow: 0, green: 4, black: 0 });
    expect(z.inZoneTotal).toBe(5);
    expect(area(e, 'c1').received).toEqual({ red: 2, yellow: 0, green: 1, black: 0 });
    expect(deriveMci(e).totals).toMatchObject({ taggedTotal: 8, inZonesTotal: 5, inTreatmentTotal: 3 });
    expect(zone(e, 'zb').taggedTotal).toBe(0);
  });

  it('writes a typed Tagged total as one delta entry', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'yellow', 2, ctx()));
    const before = e.mci!.log.length;
    e = apply(e, setTaggedTotalPatch(e, 'za', 'yellow', 7, ctx()));
    expect(e.mci!.log).toHaveLength(before + 1);
    expect(e.mci!.log.at(-1)).toMatchObject({ kind: 'tagged', n: 5, color: 'yellow' });
    expect(zone(e, 'za').tagged.yellow).toBe(7);
  });

  it('does not let Tagged drop below what was moved', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 4, ctx()));
    e = apply(e, movePatch(e, 'za', 'c1', { red: 3 }, ctx()));
    const lowered = setTaggedTotalPatch(e, 'za', 'red', 0, ctx());
    expect(lowered.clamped).toBe(true);
    e = apply(e, lowered);
    expect(zone(e, 'za').tagged.red).toBe(3);
    expect(zone(e, 'za').inZone.red).toBe(0);
    expect(tagPatch(e, 'za', 'red', -1, ctx())).toMatchObject({ error: 'invalid', clamped: true });
  });

  it('clamps a move to what is in the zone', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 2, ctx()));
    const move = movePatch(e, 'za', 'ar1', { red: 5, yellow: 1 }, ctx());
    expect(move.clamped).toBe(true);
    e = apply(e, move);
    expect(zone(e, 'za').moved).toEqual({ red: 2, yellow: 0, green: 0, black: 0 });
    expect(area(e, 'ar1').receivedTotal).toBe(2);
    expect(movePatch(e, 'za', 'ar1', { red: 1 }, ctx())).toMatchObject({ error: 'invalid', clamped: true });
  });

  it('rejects an unknown zone or area', () => {
    const e = activeEvent();
    expect(tagPatch(e, 'nope', 'red', 1, ctx()).error).toBe('unknown-zone');
    expect(movePatch(e, 'za', 'nope', { red: 1 }, ctx()).error).toBe('unknown-area');
  });
});

describe('zone clear', () => {
  it('suggests clear only when in-zone is 0, tagged is above 0 and the zone is not cleared', () => {
    let e = activeEvent();
    expect(zone(e, 'za').suggestClear).toBe(false);
    e = apply(e, tagPatch(e, 'za', 'red', 2, ctx()));
    expect(zone(e, 'za').suggestClear).toBe(false);
    e = apply(e, movePatch(e, 'za', 'c1', { red: 2 }, ctx()));
    expect(zone(e, 'za').suggestClear).toBe(true);
    // Suggesting changes nothing.
    expect(zone(e, 'za').cleared).toBe(false);
    e = apply(e, clearZonePatch(e, 'za', ctx(3000)));
    expect(zone(e, 'za')).toMatchObject({ cleared: true, suggestClear: false, clearedTimes: [3000] });
    expect(e.mci!.zones.find((z) => z.id === 'za')!.clearedAt).toBe(3000);
  });

  it('reopens a zone and records each clear time', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 1, ctx()));
    e = apply(e, movePatch(e, 'za', 'c1', { red: 1 }, ctx()));
    e = apply(e, clearZonePatch(e, 'za', ctx(2000)));
    e = apply(e, reopenZonePatch(e, 'za', ctx(2500)));
    expect(zone(e, 'za').cleared).toBe(false);
    expect(e.mci!.zones.find((z) => z.id === 'za')!.clearedAt).toBeUndefined();
    e = apply(e, clearZonePatch(e, 'za', ctx(4000)));
    expect(zone(e, 'za').clearedTimes).toEqual([2000, 4000]);
  });

  it('reopens a cleared zone when patients are added to it', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 1, ctx()));
    e = apply(e, movePatch(e, 'za', 'c1', { red: 1 }, ctx()));
    e = apply(e, clearZonePatch(e, 'za', ctx()));
    e = apply(e, tagPatch(e, 'za', 'green', 2, ctx()));
    expect(zone(e, 'za')).toMatchObject({ cleared: false, inZoneTotal: 2 });
    expect(e.mci!.log.map((l) => l.kind).slice(-2)).toEqual(['zone_reopened', 'tagged']);
  });

  it('does nothing when clearing a cleared zone or reopening an open one', () => {
    let e = activeEvent();
    expect(reopenZonePatch(e, 'za', ctx()).patch).toEqual({});
    e = apply(e, clearZonePatch(e, 'za', ctx()));
    expect(clearZonePatch(e, 'za', ctx()).patch).toEqual({});
  });
});

describe('undo', () => {
  it('undoes a tagged entry', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 3, ctx()));
    const entry = e.mci!.log.at(-1)!;
    e = apply(e, undoPatch(e, entry.id, ctx()));
    expect(zone(e, 'za').taggedTotal).toBe(0);
    expect(e.mci!.log.map((l) => l.kind)).toEqual(['tagged', 'undo']);
    expect(e.mci!.log[1].undoes).toBe(entry.id);
  });

  it('undoes a move and puts patients back in the zone', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 3, ctx()));
    e = apply(e, movePatch(e, 'za', 'c1', { red: 3 }, ctx()));
    e = apply(e, undoPatch(e, e.mci!.log.at(-1)!.id, ctx()));
    expect(zone(e, 'za').inZone.red).toBe(3);
    expect(area(e, 'c1').receivedTotal).toBe(0);
  });

  it('undoes a zone clear and a reopen', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 1, ctx()));
    e = apply(e, movePatch(e, 'za', 'c1', { red: 1 }, ctx()));
    e = apply(e, clearZonePatch(e, 'za', ctx()));
    const cleared = e.mci!.log.at(-1)!;
    e = apply(e, undoPatch(e, cleared.id, ctx()));
    expect(zone(e, 'za')).toMatchObject({ cleared: false, clearedTimes: [] });
    expect(e.mci!.zones.find((z) => z.id === 'za')!.clearedAt).toBeUndefined();

    e = apply(e, clearZonePatch(e, 'za', ctx()));
    e = apply(e, reopenZonePatch(e, 'za', ctx()));
    const reopened = e.mci!.log.at(-1)!;
    e = apply(e, undoPatch(e, reopened.id, ctx()));
    expect(zone(e, 'za').cleared).toBe(true);
  });

  it('refuses to undo twice, to undo an undo, or to undo what would leave negative patients', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 3, ctx()));
    const tag = e.mci!.log.at(-1)!;
    e = apply(e, movePatch(e, 'za', 'c1', { red: 3 }, ctx()));
    // The tag cannot go while its patients are in treatment.
    expect(undoPatch(e, tag.id, ctx()).error).toBe('cannot-undo');
    e = apply(e, undoPatch(e, e.mci!.log.at(-1)!.id, ctx()));
    const undoEntry = e.mci!.log.at(-1)!;
    expect(undoPatch(e, undoEntry.id, ctx()).error).toBe('cannot-undo');
    const move = e.mci!.log.find((l) => l.kind === 'moved')!;
    expect(undoPatch(e, move.id, ctx()).error).toBe('cannot-undo');
    expect(undoPatch(e, 'missing', ctx()).error).toBe('cannot-undo');
  });

  it('never edits or removes earlier entries', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 3, ctx()));
    const before = JSON.stringify(e.mci!.log);
    e = apply(e, undoPatch(e, e.mci!.log[0].id, ctx()));
    expect(JSON.stringify(e.mci!.log.slice(0, 1))).toBe(JSON.stringify(JSON.parse(before)));
  });
});

describe('regular clinic count', () => {
  const clinicCall = (over: Partial<Call>): Call => ({ id: 'c', order: 1, status: 'Delivered', location: '', assignedTeam: [], chiefComplaint: '', clinic: true, ...over });

  it('counts unresolved clinic calls at a clinic', () => {
    const calls = [
      clinicCall({ id: '1', clinicId: 'c1' }),
      clinicCall({ id: '2', clinicId: 'c1', outcome: 'Pending Transport' }),
      clinicCall({ id: '3', clinicId: 'c1', outcome: 'Discharged' }),
      clinicCall({ id: '4', clinicId: 'c2' }),
      clinicCall({ id: '5', clinicId: 'c1', clinic: false, status: 'On Scene' }),
    ];
    const clinics = [{ id: 'c1', name: 'North' }, { id: 'c2', name: 'South' }];
    expect(regularClinicCount({ calls, clinics }, { clinicId: 'c1' })).toBe(2);
    expect(regularClinicCount({ calls, clinics }, { clinicId: 'c2' })).toBe(1);
    expect(regularClinicCount({ calls, clinics }, {})).toBe(0);
  });

  it('gives calls with no clinicId to a single clinic and to the default clinic', () => {
    const calls = [clinicCall({ id: '1' }), clinicCall({ id: '2' }), clinicCall({ id: '3', outcome: 'AMA' })];
    // No clinics on the event: the default clinic.
    expect(regularClinicCount({ calls, clinics: undefined }, { clinicId: 'clinic' })).toBe(2);
    // One clinic.
    expect(regularClinicCount({ calls, clinics: [{ id: 'only', name: 'Only' }] }, { clinicId: 'only' })).toBe(2);
    // Several: the first is the default.
    const several = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    expect(regularClinicCount({ calls, clinics: several }, { clinicId: 'a' })).toBe(2);
    expect(regularClinicCount({ calls, clinics: several }, { clinicId: 'b' })).toBe(0);
  });

  it('shows up in the derived area and totals', () => {
    let e = activeEvent({ calls: [clinicCall({ id: '1', clinicId: 'c1' })] });
    e = apply(e, tagPatch(e, 'za', 'red', 8, ctx()));
    e = apply(e, movePatch(e, 'za', 'c1', { red: 8 }, ctx()));
    expect(area(e, 'c1')).toMatchObject({ regular: 1, receivedTotal: 8, isClinic: true });
    expect(area(e, 'ar1')).toMatchObject({ regular: 0, isClinic: false });
    expect(deriveMci(e).totals.regularTotal).toBe(1);
  });
});

describe('series', () => {
  it('builds a step series from a known log, leaving out undone entries', () => {
    const mci: MciState = {
      active: true,
      periods: [{ startedAt: 100 }],
      zones: [{ id: 'za', name: 'Zone A' }],
      areas: [{ id: 'ar1', name: 'Overflow' }],
      log: [
        { id: '1', t: 200, kind: 'tagged', zoneId: 'za', color: 'red', n: 4 },
        { id: '2', t: 300, kind: 'tagged', zoneId: 'za', color: 'green', n: 2 },
        { id: '3', t: 400, kind: 'moved', zoneId: 'za', areaId: 'ar1', color: 'red', n: 3 },
        { id: '4', t: 450, kind: 'zone_cleared', zoneId: 'za' },
        { id: '5', t: 500, kind: 'undo', undoes: '2' },
      ],
    };
    expect(mciSeries(mci)).toEqual([
      { t: 100, inZones: 0, inTreatment: 0 },
      { t: 200, inZones: 4, inTreatment: 0 },
      { t: 400, inZones: 1, inTreatment: 3 },
    ]);
  });
});

describe('declare and stand down', () => {
  it('declaring again keeps zones, areas and log and appends a period', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 2, ctx()));
    e = { ...e, ...standDownMci(e, 1500) } as Event;
    expect(isMciActive(e)).toBe(false);
    expect(e.mci!.periods).toEqual([{ startedAt: 500, endedAt: 1500 }]);
    e = { ...e, ...declareMci(e, { zones: [{ id: 'zc', name: 'Zone C' }, { id: 'x', name: 'zone a' }], areas: [] }, 2500) } as Event;
    expect(e.mci!.periods).toHaveLength(2);
    expect(e.mci!.zones.map((z) => z.name)).toEqual(['Zone A', 'Zone B', 'Zone C']);
    expect(e.mci!.log).toHaveLength(1);
    expect(isMciActive(e)).toBe(true);
  });

  it('does not open a second period while one is open', () => {
    const e = activeEvent();
    const again = declareMci(e, { zones: [], areas: [] }, 900);
    expect(again.mci!.periods).toHaveLength(1);
  });

  it('adds zones and areas by name, unique ignoring case', () => {
    let e = activeEvent();
    e = apply(e, addMciZone(e, { name: ' Field 1 ' }, ctx()));
    expect(e.mci!.zones.at(-1)!.name).toBe('Field 1');
    expect(addMciZone(e, { name: 'zone a' }, ctx()).error).toBe('duplicate');
    expect(addMciZone(e, { name: '  ' }, ctx()).error).toBe('invalid');
    e = apply(e, addMciArea(e, { name: 'Tent' }, ctx()));
    expect(addMciArea(e, { name: 'TENT' }, ctx()).error).toBe('duplicate');
    expect(e.mci!.areas.map((a) => a.name)).toEqual(['Clinic', 'Overflow', 'Tent']);
  });

  it('returns MCI statuses to Available, clears assignments and keeps the data', () => {
    let e = activeEvent({
      staff: [
        unit({ team: 'T1', status: 'Triage', location: 'Zone A', originalPost: 'Gate A', mciAssignment: { kind: 'zone', id: 'za' } }),
        unit({ team: 'T2', status: 'Treatment', location: 'Clinic', mciAssignment: { kind: 'area', id: 'c1' } }),
        unit({ team: 'T3', status: 'Unavailable', location: 'Gate B' }),
        unit({ team: 'T4', status: 'En Route', location: 'Gate C' }),
        unit({ team: 'T5', status: 'On Break', location: 'Gate D' }),
      ],
      supervisor: [{ team: 'S1', member: 'M', status: 'Triage', location: 'Zone B', mciAssignment: { kind: 'zone', id: 'zb' } }],
    });
    e = apply(e, tagPatch(e, 'za', 'red', 2, ctx()));
    e = { ...e, ...standDownMci(e, 9000) } as Event;
    expect(e.staff.map((s) => s.status)).toEqual(['Available', 'Available', 'Available', 'En Route', 'On Break']);
    expect(e.staff.every((s) => s.mciAssignment === undefined)).toBe(true);
    expect(e.staff[0].location).toBe('Gate A');
    expect(e.staff[0].log?.at(-1)?.message).toContain('MCI stand down');
    expect(e.supervisor[0]).toMatchObject({ status: 'Available' });
    expect(e.supervisor[0].mciAssignment).toBeUndefined();
    expect(zone(e, 'za').taggedTotal).toBe(2);
  });

  it('leaves Location alone on stand down for a TAK event', () => {
    let e = activeEvent({
      mapMode: 'tak',
      staff: [unit({ status: 'Triage', location: 'Near Gate A', originalPost: 'Gate A', mciAssignment: { kind: 'zone', id: 'za' } })],
    });
    e = { ...e, ...standDownMci(e, 9000) } as Event;
    expect(e.staff[0]).toMatchObject({ status: 'Available', location: 'Near Gate A' });
  });
});

describe('teams', () => {
  it('offers the four MCI statuses, and keeps a leftover break status visible', () => {
    expect(mciStatusOptions(unit())).toEqual(['Available', 'Triage', 'Treatment', 'Unavailable']);
    expect(mciStatusOptions(unit({ status: 'On Break' }))).toEqual(['Available', 'Triage', 'Treatment', 'Unavailable', 'On Break']);
  });

  it('sets Location to the zone or area name on a standard event', () => {
    const e = activeEvent();
    expect(mciAssignmentPatch(e, { kind: 'zone', id: 'za' })).toEqual({
      patch: { mciAssignment: { kind: 'zone', id: 'za' }, location: 'Zone A' },
      logMessage: 'Post changed to Zone A (MCI)',
    });
    expect(mciAssignmentPatch({ ...e, mapMode: 'standard' }, { kind: 'area', id: 'ar1' }).patch.location).toBe('Overflow');
  });

  it('never changes Location when mapMode is tak', () => {
    const e = activeEvent({ mapMode: 'tak' });
    const out = mciAssignmentPatch(e, { kind: 'area', id: 'c1' });
    expect(out.patch).toEqual({ mciAssignment: { kind: 'area', id: 'c1' } });
    expect('location' in out.patch).toBe(false);
  });

  it('clears the assignment, and ignores one whose target is gone', () => {
    const e = activeEvent();
    expect(mciAssignmentPatch(e, null).patch).toEqual({ mciAssignment: undefined });
    expect(mciAssignmentPatch(e, { kind: 'zone', id: 'gone' }).patch).toEqual({ mciAssignment: undefined });
  });

  it('lists the units at a zone and buckets availability', () => {
    const zoneA = { kind: 'zone', id: 'za' } as const;
    const e = activeEvent({
      staff: [
        unit({ team: 'T1', status: 'Triage', mciAssignment: zoneA }),
        unit({ team: 'T2', status: 'Triage', mciAssignment: { kind: 'zone', id: 'zb' } }),
        unit({ team: 'T3', status: 'Treatment', mciAssignment: { kind: 'area', id: 'c1' } }),
        unit({ team: 'T4', status: 'Available' }),
        unit({ team: 'T5', status: 'Unavailable' }),
        // Stored as Triage but sent to a normal call: it is on the call.
        unit({ team: 'T6', status: 'Triage', mciAssignment: zoneA }),
      ],
      calls: [{ id: 'call1', order: 1, status: 'En Route', location: 'Gate', assignedTeam: ['T6'], chiefComplaint: '' }],
    });
    expect(mciUnitsAt(e, zoneA)).toEqual(['T1']);
    expect(mciUnitsAt(e, { kind: 'area', id: 'c1' })).toEqual(['T3']);
    expect(mciAvailability(e)).toEqual({ available: 1, triage: 2, treatment: 1, unavailable: 2 });
  });
});

describe('Lite round trip', () => {
  it('keeps mci and mciAssignment', () => {
    let e = activeEvent({ staff: [unit({ status: 'Triage', location: 'Zone A', mciAssignment: { kind: 'zone', id: 'za' } })] });
    e = apply(e, tagPatch(e, 'za', 'red', 2, ctx()));
    const draft = {
      id: 'e1', mode: 'lite', name: 'Drill', date: '2026-12-01', scheduleConfig: { from: '', to: '', by: '' },
      venue: { name: 'Venue' }, postingTimes: [], staff: [], supervisor: [], eventPosts: [], eventEquipment: [], calls: [],
      status: 'active', createdAt: '2026-12-01T00:00:00.000Z', updatedAt: '2026-12-01T00:00:00.000Z',
    } as unknown as LiteEventDraft;

    const saved = toLiteDraftFromEvent(e, draft);
    expect(saved.mci).toEqual(e.mci);
    const restored = normalizeLiteDraftToEvent(saved);
    expect(restored.mci).toEqual(e.mci);
    expect(restored.staff[0].mciAssignment).toEqual({ kind: 'zone', id: 'za' });
    expect(deriveMci(restored).totals.taggedTotal).toBe(2);
  });
});

describe('appendMciEntries', () => {
  it('starts from an empty state when there is none', () => {
    const next = appendMciEntries(undefined, []);
    expect(next).toEqual({ active: false, periods: [], zones: [], areas: [], log: [] });
  });
});
