import { describe, expect, it } from 'vitest';
import type { Event, Staff } from '@/app/types';
import { keepTrackedLocations } from './teamLocationGuard';

const team = (over: Partial<Staff> = {}): Staff => ({ team: 'T1', location: 'Near Gate A', status: 'Available', members: [], ...over });
const event = (mapMode: Event['mapMode'], staff: Staff[]) => ({ mapMode, staff, supervisor: [] }) as unknown as Event;

describe('keepTrackedLocations', () => {
  it('keeps the Location on a TAK event when a call or schedule write moves it', () => {
    const out = keepTrackedLocations(event('tak', [team()]), { staff: [team({ location: 'Stage', status: 'En Route', originalPost: 'Gate A' })] });
    expect(out.staff![0]).toMatchObject({ location: 'Near Gate A', status: 'En Route', originalPost: 'Gate A' });
  });

  it('lets a manual edit through for the named unit', () => {
    const out = keepTrackedLocations(event('tak', [team()]), { staff: [team({ location: 'Roaming' })] }, ['T1']);
    expect(out.staff![0]!.location).toBe('Roaming');
  });

  it('changes nothing on a standard event, and keeps new units as given', () => {
    const updates = { staff: [team({ location: 'Stage' })] };
    expect(keepTrackedLocations(event('standard', [team()]), updates)).toBe(updates);
    const added = keepTrackedLocations(event('tak', []), { staff: [team({ team: 'New', location: 'Roaming' })] });
    expect(added.staff![0]!.location).toBe('Roaming');
  });
});
