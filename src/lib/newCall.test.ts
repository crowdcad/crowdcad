import { describe, expect, it } from 'vitest';
import type { Event } from '@/app/types';
import { newCall, nextCallOrder } from './newCall';

const at = new Date(2026, 10, 24, 14, 5).getTime();
const event = {
  calls: [{ id: '1', order: 4, status: 'Resolved', location: 'Gate', assignedTeam: [], chiefComplaint: '' }],
  staff: [{ team: 'Team 3', status: 'Available', location: 'Gate A', log: [] }],
  supervisor: [{ team: 'Sup 1', status: 'Available', location: 'HQ', log: [] }],
} as unknown as Pick<Event, 'calls' | 'staff' | 'supervisor'>;

describe('newCall', () => {
  it('numbers the next call after the highest order', () => {
    expect(nextCallOrder([])).toBe(1);
    expect(nextCallOrder(event.calls)).toBe(5);
  });

  it('builds a pending call like the Add Call form', () => {
    const { call, patch } = newCall(event, { location: ' Stage ', chiefComplaint: 'Dizzy', source: 'Radio', age: '34', gender: 'M' }, at);
    expect(call).toMatchObject({ id: String(at), order: 5, status: 'Pending', location: 'Stage', assignedTeam: [], chiefComplaint: 'Dizzy', source: 'Radio', age: '34', gender: 'M', priority: false });
    expect(call.log).toEqual([{ timestamp: at, message: '1405 - Call created from Radio, complaint: Dizzy, location: Stage' }]);
    expect(patch.calls).toHaveLength(2);
    expect(patch.staff).toBeUndefined();
  });

  it('sends a team En Route, or a supervisor', () => {
    const { call, patch } = newCall(event, { location: 'Stage', assignedTeam: 'Team 3' }, at);
    expect(call.status).toBe('Assigned');
    expect(call.log![0]!.message).toBe('1405 - Call created, location: Stage, assigned to Team 3');
    expect(patch.staff![0]).toMatchObject({ status: 'En Route', location: 'Stage', originalPost: 'Gate A', log: [{ timestamp: at, message: '1405 - responding to call #5' }] });
    const sup = newCall(event, { location: 'Stage', assignedTeam: 'Sup 1' }, at).patch;
    expect(sup.staff).toBeUndefined();
    expect(sup.supervisor![0]!.status).toBe('En Route');
  });

  it('starts a flag-down On Scene, with its pin and notes', () => {
    const { call, patch } = newCall(
      event,
      { location: 'Near Gate A', locationPoint: { lat: 1, lng: 2 }, notes: 'Bleeding', source: 'Flag down', assignedTeam: 'Team 3', unitStatus: 'On Scene', logSuffix: ' (Sam, from the unit)' },
      at,
    );
    expect(call).toMatchObject({ status: 'On Scene', locationPoint: { lat: 1, lng: 2 }, notes: 'Bleeding', source: 'Flag down' });
    expect(call.log![0]!.message).toBe('1405 - Call created from Flag down, location: Near Gate A, assigned to Team 3 (Sam, from the unit)');
    expect(patch.staff![0]).toMatchObject({ status: 'On Scene', location: 'Near Gate A' });
    expect(patch.staff![0]!.log![0]!.message).toBe('1405 - Team 3 set to On Scene at Near Gate A, call #5 (Sam, from the unit)');
  });
});
