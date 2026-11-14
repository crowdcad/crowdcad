import { describe, expect, it } from 'vitest';
import type { Event, Staff } from '@/app/types';
import { keepTrackedLocations } from './teamLocationGuard';

const team = (over: Partial<Staff> = {}): Staff => ({ team: 'T1', location: 'Near Gate A', status: 'Available', members: [], ...over });
const event = (mapMode: Event['mapMode'], staff: Staff[]) => ({ mapMode, staff, supervisor: [] }) as unknown as Event;
const T1 = new Set(['T1']);

describe('keepTrackedLocations', () => {
  it('keeps a tracked unit\'s Location when a call or schedule write moves it', () => {
    const out = keepTrackedLocations(event('tak', [team()]), { staff: [team({ location: 'Stage', status: 'En Route', originalPost: 'Gate A' })] }, T1);
    expect(out.staff![0]).toMatchObject({ location: 'Near Gate A', status: 'En Route', originalPost: 'Gate A' });
  });

  it('lets a manual edit through for the named unit', () => {
    const out = keepTrackedLocations(event('tak', [team()]), { staff: [team({ location: 'Roaming' })] }, T1, ['T1']);
    expect(out.staff![0]!.location).toBe('Roaming');
  });

  it('moves an untracked unit on a TAK event as on a standard event (posting refresh)', () => {
    const current = event('tak', [team(), team({ team: 'T2', location: 'Gate B' })]);
    const out = keepTrackedLocations(current, { staff: [team({ location: 'Gate C' }), team({ team: 'T2', location: 'Gate C' })] }, T1);
    expect(out.staff!.map((s) => s.location)).toEqual(['Near Gate A', 'Gate C']);
  });

  it('changes nothing when no unit is tracked or on a standard event, and keeps new units as given', () => {
    const updates = { staff: [team({ location: 'Stage' })] };
    expect(keepTrackedLocations(event('standard', [team()]), updates, T1)).toBe(updates);
    expect(keepTrackedLocations(event('tak', [team()]), updates, new Set())).toBe(updates);
    const added = keepTrackedLocations(event('tak', []), { staff: [team({ team: 'New', location: 'Roaming' })] }, new Set(['New']));
    expect(added.staff![0]!.location).toBe('Roaming');
  });
});
