import { describe, expect, it } from 'vitest';
import type { Call, Layer } from '@/app/types';
import { describePoint } from '@/lib/geo/describePoint';
import { callDisplayNumbers, callsOfTeam, callSpots, isOpenCall, unplacedCallCount, withCallPins } from './callMap';

// A drawn-area (geo) layer with posts about 100 m apart, and an image layer with the same names by x/y.
const geo = {
  id: 'g',
  name: 'Campus',
  area: { polygon: [{ lat: 37.87, lng: -122.26 }, { lat: 37.875, lng: -122.26 }, { lat: 37.875, lng: -122.255 }] },
  posts: [
    { name: 'Gate', x: null, y: null, lat: 37.87, lng: -122.26 },
    { name: 'Steps', x: null, y: null, lat: 37.8709, lng: -122.26 },
  ],
} as unknown as Layer;
const image = {
  id: 'i',
  name: 'Floor',
  mapUrl: 'x.png',
  posts: [{ name: 'Gate', x: 10, y: 20 }, 'Unplaced'],
} as unknown as Layer;

const call = (id: string, location: string, extra: Partial<Call> = {}) =>
  ({ id, order: Number(id), location, assignedTeam: [], status: 'En Route', chiefComplaint: '', ...extra }) as Call;

describe('calls on the map', () => {
  it('numbers calls oldest first, and knows open calls', () => {
    expect([...callDisplayNumbers([call('20', 'a'), call('3', 'b')])]).toEqual([['3', 1], ['20', 2]]);
    expect(isOpenCall(call('1', 'a'))).toBe(true);
    expect(isOpenCall(call('1', 'a', { status: 'Delivered' }))).toBe(false);
    expect(isOpenCall(call('1', 'a', { duplicate: true }))).toBe(false);
  });

  it('places a call at its pin first, else its named location, and stacks calls at one place', () => {
    const calls = [
      call('1', 'Gate'),
      call('2', 'gate'),
      // About 5 m from Gate: stacks with it on the live map.
      call('3', 'Near Gate', { locationPoint: { lat: 37.87004, lng: -122.26 } }),
      call('4', 'Steps'),
      call('5', 'Behind the tent'),
    ];
    const spots = callSpots(calls, geo, true);
    expect(spots.map((s) => s.calls.map((c) => c.id))).toEqual([['1', '2', '3'], ['4']]);
    expect(spots[0]).toMatchObject({ lat: 37.87, lng: -122.26 });

    // The image layer shows only Gate by x/y; it isn't aligned, so it can't show the pin.
    const onImage = callSpots(calls, image, false);
    expect(onImage.map((s) => s.calls.map((c) => c.id))).toEqual([['1', '2']]);
    expect(onImage[0]).toMatchObject({ x: 10, y: 20 });

    expect(unplacedCallCount(calls, [geo, image])).toBe(1);
  });

  it('puts units on an open call with a pin at the pin, unless a device reports them', () => {
    const pinned = call('7', 'Near Gate', { assignedTeam: ['Team 1', 'Team 2', 'Team 3'], locationPoint: { lat: 1, lng: 2 } });
    const tracking = {
      alignments: {},
      positions: { 'Team 2': { lat: 5, lon: 5, stale: false }, 'Team 3': { lat: 6, lon: 6, stale: true } },
    };
    const out = withCallPins(tracking, [pinned, call('8', 'Gate', { assignedTeam: ['Team 4'] })])!;
    expect(out.positions['Team 1']).toEqual({ lat: 1, lon: 2, stale: false, atCall: '7' });
    expect(out.positions['Team 2']).toEqual({ lat: 5, lon: 5, stale: false });
    expect(out.positions['Team 3']).toMatchObject({ lat: 1, lon: 2, atCall: '7' });
    expect(out.positions['Team 4']).toBeUndefined();

    // No pins: the tracking is returned as is (or nothing on a standard event).
    expect(withCallPins(tracking, [])).toBe(tracking);
    expect(withCallPins(null, [call('9', 'Gate')])).toBeUndefined();
    expect(withCallPins(null, [{ ...pinned, status: 'Resolved' }])).toBeUndefined();
  });

  it("describes a dropped pin without claiming it is at a location", () => {
    expect(describePoint({ lat: 37.87004, lon: -122.26 }, [geo])).toBe('Near Gate');
    expect(describePoint({ lat: 37.8704, lon: -122.26 }, [geo])).toBe('40 m from Gate');
  });
});

describe('callsOfTeam', () => {
  it('lists calls a unit is on or was taken off', () => {
    const calls = [
      { id: '1', assignedTeam: ['Medic 1'] },
      { id: '2', assignedTeam: [], detachedTeams: [{ team: 'Medic 1', reason: 'Rolled from Scene' }] },
      { id: '3', assignedTeam: ['Bike 3'] },
    ] as unknown as Call[];
    expect(callsOfTeam(calls, 'Medic 1').map((c) => c.id)).toEqual(['1', '2']);
    expect(callsOfTeam(calls, 'Foot 4')).toEqual([]);
  });
});
