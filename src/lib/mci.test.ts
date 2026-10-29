import { describe, expect, it } from 'vitest';
import type { Call, Event, MciState, Staff } from '@/app/types';
import { normalizeLiteDraftToEvent, toLiteDraftFromEvent } from './liteEventAdapters';
import type { LiteEventDraft } from './liteEventStore';
import {
  addMciArea,
  addMciZone,
  appendMciEntries,
  arrivePatch,
  clearZonePatch,
  declareMci,
  deriveMci,
  hasMci,
  isMciActive,
  mciAssignmentPatch,
  mciAvailability,
  mciCsvLines,
  mciMapLayers,
  mciPatientId,
  mciPatientLabel,
  mciQuickMoveArea,
  normalizePatientField,
  reassignPatientPatch,
  setPatientDetailsPatch,
  setPatientPriorityPatch,
  setTrackPatientsPatch,
  transportPatientPatch,
  mciShapeOf,
  mciShapePatch,
  mciTransportTrips,
  mciTransportUnits,
  transportPatch,
  mciStatusPatch,
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
      { t: 100, inZones: 0, inTreatment: 0, transported: 0 },
      { t: 200, inZones: 4, inTreatment: 0, transported: 0 },
      { t: 400, inZones: 1, inTreatment: 3, transported: 0 },
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

  it('ends an open surge and keeps its period in the surge log', () => {
    const base = baseEvent({
      manualSurgeActive: true,
      manualSurgeStartedAt: 100,
      surgeLog: [{ startedAt: 50, endedAt: 80 }, { startedAt: 100 }],
    });
    const patch = declareMci(base, { zones: [], areas: [] }, 700);
    expect(patch.manualSurgeActive).toBe(false);
    expect(patch.manualSurgeStartedAt).toBeUndefined();
    expect(patch.surgeLog).toEqual([{ startedAt: 50, endedAt: 80 }, { startedAt: 100, endedAt: 700 }]);
    // No surge running: the patch leaves the surge fields alone.
    expect('manualSurgeActive' in declareMci(baseEvent(), { zones: [], areas: [] }, 700)).toBe(false);
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

  it('applies the picked assignment with Triage and Treatment, and clears it with Available and Unavailable', () => {
    const e = activeEvent();
    const zoneA = { kind: 'zone', id: 'za' } as const;
    expect(mciStatusPatch(e, {}, 'Triage', zoneA).patch).toEqual({ mciAssignment: zoneA, location: 'Zone A' });
    // A zone cannot be picked for Treatment, and a missing pick keeps a matching assignment.
    expect(mciStatusPatch(e, {}, 'Treatment', zoneA).patch).toEqual({});
    expect(mciStatusPatch(e, { mciAssignment: zoneA }, 'Triage').patch).toEqual({ mciAssignment: zoneA, location: 'Zone A' });
    expect(mciStatusPatch(e, { mciAssignment: zoneA }, 'Available').patch).toEqual({ mciAssignment: undefined });
    expect(mciStatusPatch(e, { mciAssignment: zoneA }, 'Unavailable').patch).toEqual({ mciAssignment: undefined });
    // A call's status leaves the assignment alone.
    expect(mciStatusPatch(e, { mciAssignment: zoneA }, 'En Route').patch).toEqual({});
    expect('location' in mciStatusPatch({ ...e, mapMode: 'tak' }, {}, 'Triage', zoneA).patch).toBe(false);
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

describe('CSV rows', () => {
  it('lists period rows and every log entry in time order', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 3, ctx(1000)));
    e = apply(e, movePatch(e, 'za', 'c1', { red: 2 }, ctx(2000)));
    e = apply(e, undoPatch(e, e.mci!.log.at(-1)!.id, ctx(3000)));
    e = apply(e, clearZonePatch({ ...e, mci: appendMciEntries(e.mci, []) }, 'zb', ctx(3500)));
    e = { ...e, ...standDownMci(e, 60500 + 500) } as Event;
    const lines = mciCsvLines(e, (ms) => `T${ms}`);
    expect(lines).toEqual([
      'MCI,-,T500,"MCI declared"',
      'MCI,Zone A,T1000,"tagged red 3"',
      'MCI,Zone A,T2000,"moved red 2 to Clinic"',
      'MCI,Zone A,T3000,"undo moved red 2 to Clinic"',
      'MCI,Zone B,T3500,"zone_cleared"',
      'MCI,-,T61000,"MCI stood down (active for 1 min)"',
    ]);
  });

  it('is empty without an mci', () => {
    expect(mciCsvLines(baseEvent(), String)).toEqual([]);
  });

  it('holds the chart series to the end of a finished MCI', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 2, ctx(1000)));
    e = { ...e, ...standDownMci(e, 5000) } as Event;
    expect(mciSeries(e.mci).at(-1)).toEqual({ t: 5000, inZones: 2, inTreatment: 0, transported: 0 });
  });
});

describe('transport', () => {
  /** Zone A with 3 red and 2 yellow, all moved to the clinic. */
  function withPatientsInClinic(): Event {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 3, ctx(1000)));
    e = apply(e, tagPatch(e, 'za', 'yellow', 2, ctx(1100)));
    return apply(e, movePatch(e, 'za', 'c1', { red: 3, yellow: 2 }, ctx(2000)));
  }

  it('takes patients out of treatment and records the ambulance', () => {
    let e = withPatientsInClinic();
    const out = transportPatch(e, 'c1', { red: 2, yellow: 1 }, { unit: '  Ambulance   14 ', destination: ' General ' }, ctx(3000));
    expect(out.error).toBeUndefined();
    e = apply(e, out);
    const area = deriveMci(e).areas.find((a) => a.area.id === 'c1')!;
    expect(area.received).toMatchObject({ red: 3, yellow: 2 });
    expect(area.transported).toMatchObject({ red: 2, yellow: 1 });
    expect(area.inTreatment).toMatchObject({ red: 1, yellow: 1 });
    expect(area.inTreatmentTotal).toBe(2);
    expect(deriveMci(e).totals).toMatchObject({ transportedTotal: 3, inTreatmentTotal: 2, inZonesTotal: 0 });
    expect(e.mci!.log.filter((x) => x.kind === 'transported').map((x) => [x.color, x.n, x.unit, x.destination])).toEqual([
      ['red', 2, 'Ambulance 14', 'General'],
      ['yellow', 1, 'Ambulance 14', 'General'],
    ]);
  });

  it('clamps to what is in the location and needs an ambulance number', () => {
    const e = withPatientsInClinic();
    const clamped = transportPatch(e, 'c1', { red: 9 }, { unit: 'A1' }, ctx(3000));
    expect(clamped.clamped).toBe(true);
    expect(apply(e, clamped).mci!.log.at(-1)).toMatchObject({ kind: 'transported', color: 'red', n: 3 });
    expect(transportPatch(e, 'c1', { red: 1 }, { unit: '   ' }, ctx(3000)).error).toBe('invalid');
    expect(transportPatch(e, 'c1', { black: 1 }, { unit: 'A1' }, ctx(3000)).error).toBe('invalid');
    expect(transportPatch(e, 'nope', { red: 1 }, { unit: 'A1' }, ctx(3000)).error).toBe('unknown-area');
  });

  it('undoes a transport, and refuses to undo a move whose patients have left', () => {
    let e = withPatientsInClinic();
    const move = e.mci!.log.find((x) => x.kind === 'moved' && x.color === 'red')!;
    e = apply(e, transportPatch(e, 'c1', { red: 3 }, { unit: 'A1' }, ctx(3000)));
    expect(undoPatch(e, move.id, ctx(3500)).error).toBe('cannot-undo');
    const trip = e.mci!.log.find((x) => x.kind === 'transported')!;
    e = apply(e, undoPatch(e, trip.id, ctx(4000)));
    expect(deriveMci(e).areas.find((a) => a.area.id === 'c1')!.inTreatment.red).toBe(3);
    expect(deriveMci(e).totals.transportedTotal).toBe(0);
  });

  it('lists ambulance numbers once and drops undone trips', () => {
    let e = withPatientsInClinic();
    e = apply(e, transportPatch(e, 'c1', { red: 1 }, { unit: 'A1' }, ctx(3000)));
    e = apply(e, transportPatch(e, 'c1', { red: 1 }, { unit: 'A1' }, ctx(3100)));
    e = apply(e, transportPatch(e, 'c1', { yellow: 1 }, { unit: 'A2' }, ctx(3200)));
    expect(mciTransportUnits(e.mci)).toEqual(['A1', 'A2']);
    e = apply(e, undoPatch(e, e.mci!.log.at(-1)!.id, ctx(3300)));
    expect(mciTransportUnits(e.mci)).toEqual(['A1']);
  });

  it('adds transported patients to the series and the CSV', () => {
    let e = withPatientsInClinic();
    e = apply(e, transportPatch(e, 'c1', { red: 2 }, { unit: 'A1', destination: 'General' }, ctx(3000)));
    expect(mciSeries(e.mci).at(-1)).toEqual({ t: 3000, inZones: 0, inTreatment: 3, transported: 2 });
    expect(mciCsvLines(e, (ms) => `T${ms}`)).toContain('MCI,Clinic,T3000,"transported red 2 from Clinic by A1 to General"');
  });
});

describe('map shapes', () => {
  const triangle = [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 25, y: 40 }];
  const withMap = (): Event => {
    const e = activeEvent();
    return {
      ...e,
      venue: {
        ...e.venue,
        layers: [
          { id: 'l1', name: 'Main', mapUrl: 'map.png', posts: [], zones: [{ id: 'old', name: 'Old', color: '#111111', points: triangle }] },
          { id: 'l2', name: 'Plain', posts: [] },
        ],
      },
    } as Event;
  };

  it('offers only layers that have a map', () => {
    expect(mciMapLayers(withMap().venue).map((l) => l.id)).toEqual(['l1']);
    expect(mciMapLayers(undefined)).toEqual([]);
  });

  it('stores a drawn zone on the layer and links it to the MCI zone', () => {
    let e = withMap();
    expect(mciShapeOf(e.venue, e.mci!.zones[0])).toBeUndefined();
    e = apply(e, mciShapePatch(e, { kind: 'zone', id: 'za' }, { layerId: 'l1', points: triangle }));
    const found = mciShapeOf(e.venue, e.mci!.zones[0])!;
    expect(found.layer.id).toBe('l1');
    expect(found.zone).toMatchObject({ id: 'za', name: 'Zone A', color: '#ef4444', points: triangle });
    expect(found.zone.isDispatchZone).toBeUndefined();
    expect(e.mci!.zones[0].venueZoneId).toBe('za');
  });

  it('draws a treatment area in blue and a redraw replaces the first shape, even on another layer', () => {
    let e = withMap();
    e = apply(e, mciShapePatch(e, { kind: 'area', id: 'ar1' }, { layerId: 'l1', points: triangle }));
    expect(mciShapeOf(e.venue, e.mci!.areas[1])!.zone.color).toBe('#3b82f6');
    const square = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }];
    e = apply(e, mciShapePatch(e, { kind: 'area', id: 'ar1' }, { layerId: 'l2', points: square }));
    const zones = e.venue.layers!.flatMap((l) => (l.zones || []).map((z) => [l.id, z.id]));
    expect(zones.filter(([, id]) => id === 'ar1')).toEqual([['l2', 'ar1']]);
    expect(zones).toContainEqual(['l1', 'old']);
  });

  it('refuses a shape with too few points, an unknown layer or an unknown zone', () => {
    const e = withMap();
    expect(mciShapePatch(e, { kind: 'zone', id: 'za' }, { layerId: 'l1', points: triangle.slice(0, 2) }).error).toBe('invalid');
    expect(mciShapePatch(e, { kind: 'zone', id: 'za' }, { layerId: 'nope', points: triangle }).error).toBe('invalid');
    expect(mciShapePatch(e, { kind: 'zone', id: 'nope' }, { layerId: 'l1', points: triangle }).error).toBe('unknown-zone');
  });

  it('keeps a live-map shape as coordinates', () => {
    let e = withMap();
    const coords = [{ lat: 1, lng: 1 }, { lat: 1, lng: 2 }, { lat: 2, lng: 2 }];
    e = apply(e, mciShapePatch(e, { kind: 'zone', id: 'zb' }, { layerId: 'l1', points: [], coords }));
    expect(mciShapeOf(e.venue, e.mci!.zones[1])!.zone.coords).toEqual(coords);
  });
});

describe('transport trips', () => {
  it('groups one ambulance trip, skips undone trips and lists newest first', () => {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 4, ctx(1000)));
    e = apply(e, tagPatch(e, 'za', 'yellow', 2, ctx(1100)));
    e = apply(e, movePatch(e, 'za', 'c1', { red: 4, yellow: 2 }, ctx(2000)));
    e = apply(e, transportPatch(e, 'c1', { red: 2, yellow: 1 }, { unit: 'A1', destination: 'General' }, ctx(3000)));
    e = apply(e, transportPatch(e, 'c1', { red: 1 }, { unit: 'A2' }, ctx(4000)));
    e = apply(e, transportPatch(e, 'c1', { red: 1 }, { unit: 'A3' }, ctx(5000)));
    e = apply(e, undoPatch(e, e.mci!.log.at(-1)!.id, ctx(5500)));
    const trips = mciTransportTrips(e.mci, 'c1');
    expect(trips.map((t) => [t.t, t.unit, t.destination, t.total])).toEqual([
      [4000, 'A2', undefined, 1],
      [3000, 'A1', 'General', 3],
    ]);
    expect(trips[1].counts).toMatchObject({ red: 2, yellow: 1, green: 0, black: 0 });
    expect(mciTransportTrips(e.mci, 'ar1')).toEqual([]);
  });
});

describe('patients in treatment locations', () => {
  /** Zone A with 2 red and 1 yellow, all moved to the clinic. */
  function withPatients(): Event {
    let e = activeEvent();
    e = apply(e, tagPatch(e, 'za', 'red', 2, ctx(1000)));
    e = apply(e, tagPatch(e, 'za', 'yellow', 1, ctx(1100)));
    return apply(e, movePatch(e, 'za', 'c1', { red: 2, yellow: 1 }, ctx(2000)));
  }
  const area = (e: Event, id: string) => deriveMci(e).areas.find((a) => a.area.id === id)!;
  const patientsOf = (e: Event, id: string) => area(e, id).patients;

  it('creates one patient per patient moved, with the zone they came from', () => {
    const e = withPatients();
    const move = e.mci!.log.find((x) => x.kind === 'moved' && x.color === 'red')!;
    const patients = patientsOf(e, 'c1');
    expect(patients.map((p) => [p.color, p.fromZoneId, p.arrivedAt])).toEqual([
      ['red', 'za', 2000],
      ['red', 'za', 2000],
      ['yellow', 'za', 2000],
    ]);
    expect(patients[0].id).toBe(mciPatientId(move.id, 0));
    expect(patients[1].id).toBe(mciPatientId(move.id, 1));
    expect(deriveMci(e).consistent).toBe(true);
  });

  it('adds walk-ins to the location and the totals without touching the zones', () => {
    let e = withPatients();
    e = apply(e, arrivePatch(e, 'ar1', 'green', 1, ctx(2500)));
    const p = patientsOf(e, 'ar1');
    expect(p).toHaveLength(1);
    expect(p[0].fromZoneId).toBeUndefined();
    expect(deriveMci(e).totals).toMatchObject({ arrivedTotal: 1, taggedTotal: 3, inTreatmentTotal: 4 });
    expect(mciSeries(e.mci).at(-1)).toMatchObject({ inZones: 0, inTreatment: 4 });
    expect(arrivePatch(e, 'nope', 'red', 1, ctx(2600)).error).toBe('unknown-area');
    expect(arrivePatch(e, 'ar1', 'red', 0, ctx(2600)).error).toBe('invalid');
  });

  it('saves typed details, normalized, and clears a field set to empty', () => {
    let e = withPatients();
    const id = patientsOf(e, 'c1')[0].id;
    e = apply(e, setPatientDetailsPatch(e, id, { age: ' 34 years ', sex: 'male', complaint: '  chest   pain ' }));
    expect(e.mci!.patients![id]).toEqual({ age: '34 ye', sex: 'M', complaint: 'chest pain' });
    expect(patientsOf(e, 'c1')[0].details).toMatchObject({ sex: 'M' });
    expect(mciPatientLabel(e.mci!.patients![id])).toBe('34 ye M chest pain');
    e = apply(e, setPatientDetailsPatch(e, id, { age: '' }));
    expect(e.mci!.patients![id]).toEqual({ sex: 'M', complaint: 'chest pain' });
    expect(setPatientDetailsPatch(e, id, { sex: 'm' })).toEqual({ patch: {} });
    expect(setPatientDetailsPatch(e, 'nope:0', { age: '3' }).error).toBe('unknown-patient');
    expect(normalizePatientField('sex', '  f')).toBe('F');
    expect(normalizePatientField('sex', '7')).toBe('');
  });

  it('retriages a patient to another color with a note, and the counts follow', () => {
    let e = withPatients();
    const id = patientsOf(e, 'c1').find((p) => p.color === 'yellow')!.id;
    e = apply(e, reassignPatientPatch(e, id, { color: 'red' }, '  worse breathing ', ctx(3000)));
    expect(e.mci!.log.at(-1)).toMatchObject({ kind: 'reassigned', areaId: 'c1', color: 'yellow', toColor: 'red', n: 1, patientId: id, note: 'worse breathing' });
    expect(area(e, 'c1').inTreatment).toMatchObject({ red: 3, yellow: 0 });
    expect(area(e, 'c1').received).toMatchObject({ red: 2, yellow: 1 });
    // The zone's tag counts are what was found there and do not change.
    expect(zone(e, 'za').tagged).toMatchObject({ red: 2, yellow: 1 });
    expect(reassignPatientPatch(e, id, { color: 'red' }, undefined, ctx(3100))).toEqual({ patch: {} });
  });

  it('moves a patient to another location, dropping their priority there', () => {
    let e = withPatients();
    const id = patientsOf(e, 'c1')[0].id;
    e = apply(e, setPatientPriorityPatch(e, id, 1));
    e = apply(e, setPatientDetailsPatch(e, id, { age: '50' }));
    e = apply(e, reassignPatientPatch(e, id, { areaId: 'ar1', color: 'yellow' }, undefined, ctx(3000)));
    expect(area(e, 'c1').inTreatment).toMatchObject({ red: 1, yellow: 1 });
    expect(area(e, 'c1').transferredOut).toMatchObject({ red: 1 });
    expect(area(e, 'ar1').received).toMatchObject({ yellow: 1 });
    expect(patientsOf(e, 'ar1').map((p) => [p.id, p.color, p.rank])).toEqual([[id, 'yellow', undefined]]);
    expect(e.mci!.patients![id]).toEqual({ age: '50' });
    expect(deriveMci(e).totals.inTreatmentTotal).toBe(3);
    expect(reassignPatientPatch(e, id, { areaId: 'nope' }, undefined, ctx(3100)).error).toBe('unknown-area');
  });

  it('ranks the transport order, inserting and shifting, and a transport moves everyone up', () => {
    let e = withPatients();
    const [a, b, c] = patientsOf(e, 'c1').map((p) => p.id);
    e = apply(e, setPatientPriorityPatch(e, a, 1));
    e = apply(e, setPatientPriorityPatch(e, b, 2));
    // Putting c at 1 moves a to 2 and b to 3.
    e = apply(e, setPatientPriorityPatch(e, c, 1));
    expect(patientsOf(e, 'c1').map((p) => [p.id, p.rank])).toEqual([[c, 1], [a, 2], [b, 3]]);
    // Beyond the end goes last.
    e = apply(e, setPatientPriorityPatch(e, c, 9));
    expect(patientsOf(e, 'c1').map((p) => [p.id, p.rank])).toEqual([[a, 1], [b, 2], [c, 3]]);
    e = apply(e, transportPatientPatch(e, a, {}, ctx(3000)));
    expect(patientsOf(e, 'c1').map((p) => [p.id, p.rank])).toEqual([[b, 1], [c, 2]]);
    e = apply(e, setPatientPriorityPatch(e, b, null));
    expect(patientsOf(e, 'c1').map((p) => [p.id, p.rank])).toEqual([[c, 1], [b, undefined]]);
    expect(e.mci!.patients![b]).toBeUndefined();
    expect(setPatientPriorityPatch(e, c, 0).error).toBe('invalid');
    expect(setPatientPriorityPatch(e, a, 1).error).toBe('unknown-patient');
  });

  it('transports one patient with or without an ambulance number', () => {
    let e = withPatients();
    const [a, b] = patientsOf(e, 'c1').map((p) => p.id);
    e = apply(e, transportPatientPatch(e, a, { unit: ' A 1 ', destination: 'General' }, ctx(3000)));
    e = apply(e, transportPatientPatch(e, b, { unit: '  ' }, ctx(3100)));
    expect(e.mci!.log.slice(-2).map((x) => [x.patientId, x.color, x.n, x.unit, x.destination])).toEqual([
      [a, 'red', 1, 'A 1', 'General'],
      [b, 'red', 1, undefined, undefined],
    ]);
    expect(area(e, 'c1').inTreatment).toMatchObject({ red: 0, yellow: 1 });
    expect(area(e, 'c1').transported).toMatchObject({ red: 2 });
    expect(deriveMci(e).patients.find((p) => p.id === a)).toMatchObject({ transportedAt: 3000, unit: 'A 1', destination: 'General' });
    expect(transportPatientPatch(e, a, {}, ctx(3200)).error).toBe('unknown-patient');
  });

  it('transports picked patients and counted ones in one trip', () => {
    let e = withPatients();
    e = apply(e, arrivePatch(e, 'c1', 'black', 2, ctx(2100)));
    const yellow = patientsOf(e, 'c1').find((p) => p.color === 'yellow')!.id;
    const out = transportPatch(e, 'c1', { black: 1 }, { unit: 'A1' }, ctx(3000), [yellow, yellow, 'nope:0']);
    expect(out.clamped).toBe(true);
    e = apply(e, out);
    expect(e.mci!.log.filter((x) => x.kind === 'transported').map((x) => [x.color, x.n, x.patientId])).toEqual([
      ['yellow', 1, yellow],
      ['black', 1, undefined],
    ]);
    expect(area(e, 'c1').inTreatment).toMatchObject({ red: 2, yellow: 0, black: 1 });
    // Counted patients cannot exceed those left after the picked ones.
    const red = patientsOf(e, 'c1').filter((p) => p.color === 'red').map((p) => p.id);
    const both = transportPatch(e, 'c1', { red: 1 }, { unit: 'A2' }, ctx(3100), red);
    expect(both.clamped).toBe(true);
    expect(apply(e, both).mci!.log.filter((x) => x.kind === 'transported' && x.unit === 'A2')).toHaveLength(2);
  });

  it('a counted transport takes the patients who arrived first', () => {
    let e = withPatients();
    e = apply(e, tagPatch(e, 'zb', 'red', 1, ctx(2100)));
    e = apply(e, movePatch(e, 'zb', 'c1', { red: 1 }, ctx(2200)));
    e = apply(e, transportPatch(e, 'c1', { red: 2 }, { unit: 'A1' }, ctx(3000)));
    expect(patientsOf(e, 'c1').map((p) => [p.color, p.fromZoneId])).toEqual([
      ['yellow', 'za'],
      ['red', 'zb'],
    ]);
  });

  it('undo: a patient change undoes, but an entry a later one depends on does not', () => {
    let e = withPatients();
    const move = e.mci!.log.find((x) => x.kind === 'moved' && x.color === 'yellow')!;
    const id = patientsOf(e, 'c1').find((p) => p.color === 'yellow')!.id;
    e = apply(e, reassignPatientPatch(e, id, { color: 'red' }, undefined, ctx(3000)));
    const retriage = e.mci!.log.at(-1)!;
    e = apply(e, transportPatientPatch(e, id, { unit: 'A1' }, ctx(3100)));
    const trip = e.mci!.log.at(-1)!;
    // The move made the patient and the retriage changed them before they left: both wait for the transport's undo.
    expect(undoPatch(e, move.id, ctx(3200)).error).toBe('cannot-undo');
    expect(undoPatch(e, retriage.id, ctx(3200)).error).toBe('cannot-undo');
    e = apply(e, undoPatch(e, trip.id, ctx(3300)));
    e = apply(e, undoPatch(e, retriage.id, ctx(3400)));
    expect(patientsOf(e, 'c1').find((p) => p.id === id)!.color).toBe('yellow');
    e = apply(e, undoPatch(e, move.id, ctx(3500)));
    expect(patientsOf(e, 'c1').some((p) => p.id === id)).toBe(false);
    expect(zone(e, 'za').inZone.yellow).toBe(1);
    expect(deriveMci(e).consistent).toBe(true);
  });

  it('refuses to undo a walk-in whose patient was moved on', () => {
    let e = activeEvent();
    e = apply(e, arrivePatch(e, 'c1', 'green', 1, ctx(1000)));
    const walkIn = e.mci!.log.at(-1)!;
    const id = patientsOf(e, 'c1')[0].id;
    e = apply(e, reassignPatientPatch(e, id, { areaId: 'ar1' }, 'overflow', ctx(1100)));
    expect(undoPatch(e, walkIn.id, ctx(1200)).error).toBe('cannot-undo');
  });

  it('picks the quick move destination from the last move out of the zone', () => {
    let e = activeEvent();
    expect(mciQuickMoveArea(e.mci, 'za')).toBe('c1');
    e = apply(e, tagPatch(e, 'za', 'red', 2, ctx(1000)));
    e = apply(e, movePatch(e, 'za', 'ar1', { red: 1 }, ctx(1100)));
    expect(mciQuickMoveArea(e.mci, 'za')).toBe('ar1');
    expect(mciQuickMoveArea(e.mci, 'zb')).toBe('c1');
    e = apply(e, undoPatch(e, e.mci!.log.at(-1)!.id, ctx(1200)));
    expect(mciQuickMoveArea(e.mci, 'za')).toBe('c1');
    expect(mciQuickMoveArea(undefined, 'za')).toBeUndefined();
  });

  it('turns patient boxes on at declare, keeps the choice on re-declare, and toggles', () => {
    const base = baseEvent();
    let e = { ...base, ...declareMci(base, { zones: [], areas: [], trackPatients: true }, 100) } as Event;
    expect(e.mci!.trackPatients).toBe(true);
    e = { ...e, ...standDownMci(e, 200) } as Event;
    e = { ...e, ...declareMci(e, { zones: [], areas: [] }, 300) } as Event;
    expect(e.mci!.trackPatients).toBe(true);
    e = apply(e, setTrackPatientsPatch(e, false));
    expect(e.mci!.trackPatients).toBe(false);
    expect(setTrackPatientsPatch(e, false)).toEqual({ patch: {} });
  });

  it('describes patient entries in the CSV', () => {
    let e = withPatients();
    const id = patientsOf(e, 'c1').find((p) => p.color === 'yellow')!.id;
    e = apply(e, setPatientDetailsPatch(e, id, { age: '34', sex: 'f', complaint: 'ankle' }));
    e = apply(e, reassignPatientPatch(e, id, { color: 'red', areaId: 'ar1' }, 'worse', ctx(3000)));
    e = apply(e, arrivePatch(e, 'c1', 'green', 1, ctx(3100)));
    const lines = mciCsvLines(e, (ms) => `T${ms}`);
    expect(lines).toContain('MCI,Clinic,T3000,"reassigned yellow 1 (34 F ankle) from Clinic as red to Overflow note: worse"');
    expect(lines).toContain('MCI,Clinic,T3100,"arrived green 1 to Clinic"');
  });
});
