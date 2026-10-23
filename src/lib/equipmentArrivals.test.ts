import { describe, expect, it } from 'vitest';
import type { Event, EventEquipment } from '@/app/types';
import { arrivalKey, equipmentArrivals } from './equipmentArrivals';

const event = (eq: Partial<EventEquipment>) =>
  ({
    staff: [{ team: 'Team 1', location: 'Gate A', status: 'Retrieving Eq', members: [] }],
    supervisor: [],
    eventEquipment: [{ id: 'e', name: 'Wheelchair 1', status: 'In Use', defaultLocation: 'Staging', ...eq }],
  }) as unknown as Event;

describe('equipmentArrivals', () => {
  const retrieving = event({ phase: 'retrieving', holder: { kind: 'post', name: 'Staging' }, assignedTeam: 'Team 1', location: 'Staging' });
  const returning = event({ phase: 'returning', holder: { kind: 'team', name: 'Team 1' }, assignedTeam: 'Team 1', location: 'Team 1' });

  it('suggests a pickup when the fetching unit is at the equipment', () => {
    const out = equipmentArrivals(retrieving, { 'Team 1': 'Staging' });
    expect(out).toEqual([{ kind: 'picked_up', equipmentName: 'Wheelchair 1', unit: 'Team 1', post: 'Staging' }]);
    expect(arrivalKey(out[0])).toBe('picked_up:Wheelchair 1:Team 1:Staging');
  });

  it('suggests a return when the returning unit is at the staging location', () => {
    expect(equipmentArrivals(returning, { 'Team 1': 'Staging' })).toEqual([
      { kind: 'returned', equipmentName: 'Wheelchair 1', unit: 'Team 1', post: 'Staging' },
    ]);
  });

  it('suggests nothing elsewhere, or without tracking', () => {
    expect(equipmentArrivals(retrieving, { 'Team 1': 'Gate A' })).toEqual([]);
    expect(equipmentArrivals(returning, {})).toEqual([]);
    expect(equipmentArrivals(returning, undefined)).toEqual([]);
  });
});
