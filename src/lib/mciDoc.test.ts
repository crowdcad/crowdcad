import { describe, expect, it } from 'vitest';
import type { Event, MciState, Staff } from '@/app/types';
import { mciUnitsFor, splitMciWrite, withMciDoc } from './mciDoc';

const mci = (over: Partial<MciState> = {}): MciState => ({ active: true, periods: [{ startedAt: 1 }], zones: [], areas: [], log: [], ...over });
const team = (over: Partial<Staff> = {}): Staff => ({ id: 't1', team: 'Alpha', location: 'Gate A', status: 'Available', members: [], ...over });
const event = (over: Partial<Event> = {}) => ({ staff: [team()], supervisor: [], eventEquipment: [], ...over }) as unknown as Event;

describe('withMciDoc', () => {
  it('prefers the state document and falls back to inline mci', () => {
    const doc = mci({ trackPatients: true });
    expect(withMciDoc(event({ mci: mci() }), doc).mci).toEqual(doc);
    const inline = mci();
    expect(withMciDoc(event({ mci: inline }), null).mci).toBe(inline);
  });

  it('takes patient details from the patients document, else from an older state document', () => {
    const details = { p1: { age: '34', complaint: 'ankle' } };
    expect(withMciDoc(event(), mci(), { patients: details, updatedAt: 1 }).mci?.patients).toEqual(details);
    // The patients document wins over details left inline.
    expect(withMciDoc(event(), mci({ patients: { old: { age: '9' } } }), { patients: details, updatedAt: 1 }).mci?.patients).toEqual(details);
    expect(withMciDoc(event(), mci({ patients: details }), null).mci?.patients).toEqual(details);
    expect(withMciDoc(event(), mci(), { patients: {}, updatedAt: 1 }).mci).not.toHaveProperty('patients');
  });
});

describe('mciUnitsFor', () => {
  it('lists teams and supervisors with status, assignment and equipment held', () => {
    const e = event({
      staff: [team({ status: 'Triage', mciAssignment: { kind: 'zone', id: 'za' } })],
      supervisor: [{ id: 's1', team: 'Sup 1', location: 'Roaming', status: 'Available', member: 'Sam' }],
      eventEquipment: [{ id: 'e1', name: 'Wheelchair 1', status: 'In Use', location: 'Alpha' }, { id: 'e2', name: 'Bag 2', status: 'Available', location: 'Staging' }],
    } as Partial<Event>);
    expect(mciUnitsFor(e)).toEqual([
      { id: 't1', name: 'Alpha', kind: 'team', status: 'Triage', mciAssignment: { kind: 'zone', id: 'za' }, equipment: ['Wheelchair 1'] },
      { id: 's1', name: 'Sup 1', kind: 'supervisor', status: 'Available', equipment: [] },
    ]);
  });
});

describe('splitMciWrite', () => {
  it('sends mci to the state document and the rest to the event', () => {
    const next = mci({ trackPatients: true });
    const out = splitMciWrite(event({ mci: mci() }), { mci: next, notes: 'x' } as Partial<Event>);
    expect(out.event).toEqual({ notes: 'x' });
    expect(out.mci).toEqual(next);
    expect(out.units).toEqual(mciUnitsFor(event()));
  });

  it('keeps patient details out of the state document and writes them only when they change', () => {
    const details = { p1: { age: '34' } };
    const current = event({ mci: mci({ patients: details }) });
    const same = splitMciWrite(current, { mci: mci({ patients: details, trackPatients: true }) });
    expect(same.mci).not.toHaveProperty('patients');
    expect(same.patients).toBeUndefined();
    const changed = splitMciWrite(current, { mci: mci({ patients: { p1: { age: '35' } } }) });
    expect(changed.patients).toEqual({ p1: { age: '35' } });
    // No patients document yet (a new MCI, or details still inline in an older state document): write it.
    expect(splitMciWrite(current, { mci: mci({ patients: details }) }, { patientsStored: false }).patients).toEqual(details);
    expect(splitMciWrite(event(), { mci: mci() }, { patientsStored: false }).patients).toEqual({});
    // No MCI write, no patients write.
    expect(splitMciWrite(current, { calls: [] } as Partial<Event>, { patientsStored: false }).patients).toBeUndefined();
  });

  it('writes the unit summary only when an MCI exists and the units changed', () => {
    const withMci = event({ mci: mci() });
    expect(splitMciWrite(withMci, { staff: [team({ status: 'Treatment' })] }).units?.[0]?.status).toBe('Treatment');
    // A change the summary doesn't show (a log line, a location).
    expect(splitMciWrite(withMci, { staff: [team({ location: 'Gate B' })] }).units).toBeUndefined();
    // No MCI: nothing but the event write.
    expect(splitMciWrite(event(), { staff: [team({ status: 'Treatment' })] })).toEqual({ event: { staff: [team({ status: 'Treatment' })] } });
    // Writes that don't touch units.
    expect(splitMciWrite(withMci, { calls: [] } as Partial<Event>).units).toBeUndefined();
  });
});
