import { describe, expect, it } from 'vitest';
import type { Call, Event, Staff, Supervisor } from '@/app/types';
import { combinedCallStatus, teamStatusChange } from './teamStatusChange';

const team = (name: string, status = 'Available'): Staff => ({ team: name, status, location: 'Gate A', members: [] });
const sup = (name: string, status = 'Available'): Supervisor => ({ team: name, status, location: 'Gate A', member: 'Sam' });
const call = (over: Partial<Call>): Call => ({ id: 'c1', order: 1, status: 'En Route', location: 'Section 104', assignedTeam: ['Medic 1'], chiefComplaint: 'Fall', ...over });
const event = (over: Partial<Event> = {}) =>
  ({ staff: [team('Medic 1', 'En Route'), team('Medic 2', 'En Route')], supervisor: [sup('Sup 1')], calls: [call({ assignedTeam: ['Medic 1', 'Medic 2'] })], clinics: [{ id: 'main', name: 'Main Clinic' }, { id: 'south', name: 'South Clinic' }], ...over }) as unknown as Event;
const at = new Date(2026, 10, 22, 14, 5).getTime();

describe('teamStatusChange', () => {
  it('sets the unit, logs it with the call location, and moves the call to the furthest status', () => {
    const out = teamStatusChange(event(), 'Medic 1', 'On Scene', { now: at });
    expect(out.staff?.find((s) => s.team === 'Medic 1')).toMatchObject({ status: 'On Scene' });
    expect(out.staff?.find((s) => s.team === 'Medic 1')?.log?.at(-1)?.message).toBe('1405 - Medic 1 set to On Scene at Section 104');
    expect(out.calls?.[0]).toMatchObject({ status: 'On Scene' });
    expect(out.calls?.[0].log?.at(-1)?.message).toBe('1405 - Medic 1 set to On Scene at Section 104');
    expect(out.supervisor).toBeUndefined();
  });

  it('names the destination for Transporting and records it on the call', () => {
    const out = teamStatusChange(event(), 'Medic 1', 'Transporting', { now: at, detail: 'main', logSuffix: ' (from the unit)' });
    expect(out.calls?.[0]).toMatchObject({ status: 'Transporting', clinicId: 'main' });
    expect(out.calls?.[0].log?.at(-1)?.message).toBe('1405 - Medic 1 transporting to Main Clinic (from the unit)');
  });

  it('changes a supervisor too, and nothing for an unknown unit', () => {
    expect(teamStatusChange(event(), 'Sup 1', 'Unavailable', { now: at }).supervisor?.[0]).toMatchObject({ status: 'Unavailable' });
    expect(teamStatusChange(event(), 'Nobody', 'On Scene', { now: at })).toEqual({});
  });

  it('adds extension fields and lines', () => {
    const out = teamStatusChange(event(), 'Medic 1', 'On Scene', { now: at, extra: () => ({ patch: { originalPost: 'X' }, logMessages: ['zone set'] }) });
    const unit = out.staff?.find((s) => s.team === 'Medic 1');
    expect(unit?.originalPost).toBe('X');
    expect(unit?.log?.at(-1)?.message).toBe('1405 - zone set');
  });

  it('combines statuses', () => {
    expect(combinedCallStatus('En Route', ['En Route', 'Transporting'])).toBe('Transporting');
    expect(combinedCallStatus('Dispatched', ['Available'])).toBe('Dispatched');
  });
});
