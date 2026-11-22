import { describe, expect, it } from 'vitest';
import type { Call, Event, Layer, Staff, Supervisor } from '@/app/types';
import { distanceM, formatMeters } from '@/lib/geo/distance';
import { callPoint, placePoint, unitOptions } from './unitDistance';

// A drawn-area (geo) layer with three posts about 100 m and 400 m apart.
const layer = {
  id: 'l1',
  name: 'Campus',
  mapUrl: '',
  area: { polygon: [[37.87, -122.26], [37.875, -122.26], [37.875, -122.255], [37.87, -122.255]] },
  posts: [
    { name: 'Gate', x: null, y: null, lat: 37.8700, lng: -122.2600 },
    { name: 'Steps', x: null, y: null, lat: 37.8709, lng: -122.2600 },
    { name: 'Field', x: null, y: null, lat: 37.8736, lng: -122.2600 },
  ],
} as unknown as Layer;

const staff = (team: string, status: string, location: string) => ({ team, status, location, members: [] }) as unknown as Staff;
const call = (location: string, extra: Partial<Call> = {}) => ({ id: 'c1', location, assignedTeam: [], status: 'Pending', ...extra }) as Call;

describe('unit distances for a call', () => {
  it('finds places by name, any case, and a dropped pin first', () => {
    expect(placePoint('gate', [layer])).toEqual({ lat: 37.87, lon: -122.26 });
    expect(placePoint('Nowhere', [layer])).toBeNull();
    expect(callPoint(call('Somewhere', { locationPoint: { lat: 1, lng: 2 } }), [layer])).toEqual({ lat: 1, lon: 2 });
  });

  it('lists free units nearest first, then those on break or in clinic, skipping busy ones', () => {
    const event = {
      staff: [staff('MRC1', 'Available', 'Field'), staff('MRC2', 'Available', 'Steps'), staff('MRC3', 'On Break', 'Gate'), staff('MRC4', 'En Route', 'Gate'), staff('MRC5', 'Available', 'Unknown spot')],
      supervisor: [],
      calls: [],
    } as unknown as Event;
    const options = unitOptions(event, call('Gate'), 'team', [layer], null);
    expect(options.map((o) => o.name)).toEqual(['MRC2', 'MRC1', 'MRC5', 'MRC3']);
    expect(Math.round(options[0].distance!)).toBe(100);
    expect(options[2].distance).toBeUndefined();
    expect(options[3]).toMatchObject({ inactive: true, distance: 0 });
  });

  it('uses a live position over the Location field, but not a stale one', () => {
    const event = { staff: [staff('MRC1', 'Available', 'Field')], supervisor: [], calls: [] } as unknown as Event;
    const live = unitOptions(event, call('Gate'), 'team', [layer], { positions: { MRC1: { lat: 37.8700, lon: -122.2600, stale: false } }, alignments: {} });
    expect(live[0]).toMatchObject({ live: true, distance: 0 });
    const stale = unitOptions(event, call('Gate'), 'team', [layer], { positions: { MRC1: { lat: 37.8700, lon: -122.2600, stale: true } }, alignments: {} });
    expect(stale[0].live).toBe(false);
    expect(Math.round(stale[0].distance!)).toBe(400);
  });

  it('names supervisors by member and team', () => {
    const event = { staff: [], supervisor: [{ team: 'Sup 1', member: 'Kim Lee [EMT]', status: 'Available', location: 'Gate' } as unknown as Supervisor], calls: [] } as unknown as Event;
    expect(unitOptions(event, call('Steps'), 'supervisor', [layer], null)[0].label).toBe('Kim Lee (Sup 1)');
  });

  it('formats meters and kilometers', () => {
    expect(formatMeters(distanceM({ lat: 37.87, lon: -122.26 }, { lat: 37.8709, lon: -122.26 }))).toBe('100 m');
    expect(formatMeters(1234)).toBe('1.2 km');
  });
});
