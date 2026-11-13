import { describe, expect, it } from 'vitest';
import type { Event, MciState, Staff } from '@/app/types';
import { deriveMci } from './mci';
import { applyRoleAction, type RoleActor } from './mciRoleActions';

const mci = (over: Partial<MciState> = {}): MciState => ({
  active: true,
  periods: [{ startedAt: 1 }],
  zones: [{ id: 'za', name: 'Zone A' }],
  areas: [{ id: 'red', name: 'Red treatment', color: 'red' }],
  log: [],
  ...over,
});
const team = (over: Partial<Staff> = {}): Staff => ({ id: 't1', team: 'Alpha', location: 'Gate A', status: 'Available', members: [], ...over });
const event = (over: Partial<Event> = {}) => ({ staff: [team()], supervisor: [], calls: [], clinics: [], mci: mci(), ...over }) as unknown as Event;
const alpha: RoleActor = { uid: 'u1', role: 'responder', unitName: 'Alpha', unitId: 't1' };
let n = 0;
const ids = () => `id${++n}`;
const apply = (e: Event, patch: Partial<Event>) => ({ ...e, ...patch }) as Event;

describe('applyRoleAction', () => {
  it('stamps every entry of a counts submission with the unit, role and one batch', () => {
    const out = applyRoleAction(event(), { type: 'counts', zoneId: 'za', deltas: { red: 2, green: 1 } }, alpha, 100, ids);
    expect(out.error).toBeUndefined();
    const log = out.patch.mci!.log;
    expect(log).toHaveLength(2);
    expect(log.every((e) => e.byUnit === 'Alpha' && e.byRole === 'responder' && e.by === 'u1')).toBe(true);
    expect(new Set(log.map((e) => e.batch)).size).toBe(1);
  });

  it('sets the unit\'s own assignment on the board and logs it', () => {
    const out = applyRoleAction(event(), { type: 'assign', assignment: { kind: 'area', id: 'red' } }, alpha, 100, ids);
    expect(out.patch.staff![0]).toMatchObject({ status: 'Treatment', mciAssignment: { kind: 'area', id: 'red' }, location: 'Red treatment' });
    expect(out.patch.mci!.log.at(-1)).toMatchObject({ kind: 'noted', note: 'Alpha: Treatment, Red treatment', byUnit: 'Alpha' });
  });

  it('adds a patient with details, then records care under the unit', () => {
    let e = event();
    const added = applyRoleAction(e, { type: 'addPatient', areaId: 'red', color: 'red', fields: { age: '34', sex: 'm', complaint: 'Chest pain', team: 'Bravo' } }, alpha, 100, ids);
    e = apply(e, added.patch);
    const patient = deriveMci(e).patients[0]!;
    expect(patient.details).toMatchObject({ age: '34', sex: 'M', complaint: 'Chest pain', team: 'Bravo' });
    const care = applyRoleAction(e, { type: 'patientCare', patientId: patient.id, intervention: 'Oxygen', notes: 'Sats 89%' }, alpha, 200, ids);
    e = apply(e, care.patch);
    expect(e.mci!.patients![patient.id]).toMatchObject({ notes: 'Sats 89%', interventions: [{ t: 200, name: 'Oxygen', byUnit: 'Alpha' }] });
    expect(e.mci!.log.at(-1)).toMatchObject({ kind: 'noted', byUnit: 'Alpha' });
  });

  it('refuses what the role may not do, and logins without a unit', () => {
    expect(applyRoleAction(event(), { type: 'transport', patientId: 'x' }, alpha, 1).error).toMatch(/cannot/);
    expect(applyRoleAction(event(), { type: 'counts', zoneId: 'za', deltas: { red: 1 } }, { ...alpha, role: 'incident_command' }, 1).error).toMatch(/cannot/);
    expect(applyRoleAction(event(), { type: 'counts', zoneId: 'za', deltas: { red: 1 } }, { ...alpha, unitName: '' }, 1).error).toMatch(/not assigned/);
  });

  it('lets Logistics report an arrival for the dispatcher to confirm, and request equipment', () => {
    const sup: RoleActor = { uid: 'u2', role: 'logistics', unitName: 'Sup 2' };
    let e = event();
    e = apply(e, applyRoleAction(e, { type: 'incomingAdd', name: 'Medic 12' }, sup, 100, ids).patch);
    const id = e.mci!.logistics!.incoming[0]!.id;
    e = apply(e, applyRoleAction(e, { type: 'incomingArrived', id }, sup, 200, ids).patch);
    expect(e.mci!.logistics!.incoming[0]).toMatchObject({ state: 'reported', reportedBy: 'Sup 2' });
    expect(e.staff).toHaveLength(1); // the dispatcher adds the team
    e = apply(e, applyRoleAction(e, { type: 'equipmentRequest', item: 'Trauma bag', unit: 'Alpha' }, sup, 300, ids).patch);
    expect(e.mci!.logistics!.requests![0]).toMatchObject({ item: 'Trauma bag', unit: 'Alpha', state: 'open', byUnit: 'Sup 2' });
    e = apply(e, applyRoleAction(e, { type: 'hospitalAdd', name: 'General' }, sup, 400, ids).patch);
    const hospital = e.mci!.logistics!.hospitals![0]!;
    e = apply(e, applyRoleAction(e, { type: 'hospitalUpdate', id: hospital.id, capacity: 6 }, sup, 500, ids).patch);
    expect(e.mci!.logistics!.hospitals![0]).toMatchObject({ name: 'General', capacity: 6 });
    expect(e.mci!.log.at(-1)).toMatchObject({ kind: 'noted', note: 'General: capacity 6', byUnit: 'Sup 2' });
  });

  it('leaves the transport order to the Treatment Lead', () => {
    const lead: RoleActor = { uid: 'u3', role: 'treatment_lead', unitName: 'Alpha', unitId: 't1' };
    let e = event();
    for (let i = 0; i < 2; i++) e = apply(e, applyRoleAction(e, { type: 'addPatient', areaId: 'red', color: 'red', fields: {} }, alpha, 100 + i, ids).patch);
    const [first, second] = deriveMci(e).areas[0]!.patients;
    expect(applyRoleAction(e, { type: 'priority', patientId: second!.id, direction: 'up' }, alpha, 200, ids).error).toMatch(/cannot/);
    e = apply(e, applyRoleAction(e, { type: 'priority', patientId: second!.id, direction: 'up' }, lead, 200, ids).patch);
    expect(deriveMci(e).areas[0]!.patients.map((p) => p.id)).toEqual([second!.id, first!.id]);
    expect(e.mci!.log.at(-1)).toMatchObject({ byUnit: 'Alpha', byRole: 'treatment_lead' });
    // The lead can't count or move patients out of zones.
    expect(applyRoleAction(e, { type: 'counts', zoneId: 'za', deltas: { red: 1 } }, lead, 300).error).toMatch(/cannot/);
  });

  it('moves each color to its own treatment zone when no location is given', () => {
    let e = event({ mci: mci({ areas: [{ id: 'red', name: 'Red treatment', color: 'red' }, { id: 'green', name: 'Green treatment', color: 'green' }] }) });
    e = apply(e, applyRoleAction(e, { type: 'counts', zoneId: 'za', deltas: { red: 1, green: 2 } }, alpha, 100, ids).patch);
    e = apply(e, applyRoleAction(e, { type: 'move', zoneId: 'za', counts: { red: 1, green: 2 } }, alpha, 200, ids).patch);
    const areas = deriveMci(e).areas;
    expect(areas.map((a) => a.inTreatmentTotal)).toEqual([1, 2]);
    expect(applyRoleAction(e, { type: 'move', zoneId: 'za', areaId: 'red', counts: { green: 1 } }, alpha, 300, ids).error).toMatch(/own color/);
  });
});
