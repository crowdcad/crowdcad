import { describe, expect, it } from 'vitest';
import type { Event, MciState, Staff } from '@/app/types';
import { mciUnitsFor, splitMciWrite, withMciDoc } from './mciDoc';

const mci = (over: Partial<MciState> = {}): MciState => ({ active: true, periods: [{ startedAt: 1 }], zones: [], areas: [], log: [], ...over });
const team = (over: Partial<Staff> = {}): Staff => ({ id: 't1', team: 'Alpha', location: 'Gate A', status: 'Available', members: [], ...over });
const event = (over: Partial<Event> = {}) => ({ staff: [team()], supervisor: [], eventEquipment: [], ...over }) as unknown as Event;

describe('withMciDoc', () => {
  it('prefers the state document and falls back to inline mci', () => {
    const doc = mci({ trackPatients: true });
    expect(withMciDoc(event({ mci: mci() }), doc).mci).toBe(doc);
    const inline = mci();
    expect(withMciDoc(event({ mci: inline }), null).mci).toBe(inline);
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
    expect(out.mci).toBe(next);
    expect(out.units).toEqual(mciUnitsFor(event()));
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
