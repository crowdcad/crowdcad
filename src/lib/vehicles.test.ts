import { describe, expect, it } from 'vitest';
import type { Event, EventEquipment } from '@/app/types';
import { fleetOf } from './equipmentCustody';
import { eventVehicles, renameVehicleIn, setEquipmentVehicle, throughVehicle, vehicleOfUnit } from './vehicles';

const cart = { id: 'v1', name: 'Cart 1', location: 'Gate B' };
const event = (eventEquipment: EventEquipment[], vehiclesEnabled = true): Event =>
  ({
    id: 'e1',
    name: 'Fest',
    date: '',
    venue: { id: 'vn', name: 'Venue', equipment: [], userId: 'u' },
    postingTimes: [],
    staff: [{ team: 'Team 1', location: 'Gate A', status: 'Available', members: [] }],
    supervisor: [],
    userId: 'u',
    calls: [],
    eventPosts: [],
    eventEquipment,
    vehiclesEnabled,
    eventVehicles: [cart],
  }) as Event;

describe('vehicles', () => {
  it('only exist while on for the event', () => {
    expect(eventVehicles(event([]))).toEqual([cart]);
    expect(eventVehicles(event([], false))).toEqual([]);
  });

  it('place what is on them where they are', () => {
    expect(throughVehicle({ location: 'Cart 1' }, [cart])).toEqual({ location: 'Gate B' });
    expect(throughVehicle({ location: 'Gate A' }, [cart])).toEqual({ location: 'Gate A' });
    expect(vehicleOfUnit('Team 1', [{ ...cart, location: 'Team 1' }])).toMatchObject({ name: 'Cart 1' });
  });

  it('move their equipment along when renamed', () => {
    expect(renameVehicleIn([{ location: 'Cart 1', defaultLocation: 'Cart 1' }, { location: 'Gate A' }], 'Cart 1', 'Cart A')).toEqual([
      { location: 'Cart A', defaultLocation: 'Cart A' },
      { location: 'Gate A' },
    ]);
  });

  it('load staged equipment now, and only rehome equipment out on a run', () => {
    const staged: EventEquipment = { id: 'a', name: 'AED 1', status: 'Available', location: 'Gate A', defaultLocation: 'Gate A' };
    const carried: EventEquipment = { id: 'g', name: 'Gurney 1', status: 'In Use', location: 'Team 1', assignedTeam: 'Team 1', defaultLocation: 'Gate A' };
    const ev = event([staged, carried]);
    let fleet = setEquipmentVehicle(fleetOf(ev), ev, 'AED 1', cart, 1);
    fleet = setEquipmentVehicle(fleet, ev, 'Gurney 1', cart, 1);
    const [aed, gurney] = fleet.eventEquipment;
    expect(aed).toMatchObject({ location: 'Cart 1', defaultLocation: 'Cart 1', status: 'Available' });
    expect(gurney).toMatchObject({ location: 'Team 1', defaultLocation: 'Cart 1' });
  });

  it('leave equipment where the vehicle is parked when taken off', () => {
    const ev = event([{ id: 'a', name: 'AED 1', status: 'Available', location: 'Cart 1', defaultLocation: 'Cart 1' }]);
    const [aed] = setEquipmentVehicle(fleetOf(ev), ev, 'AED 1', null, 1).eventEquipment;
    expect(aed).toMatchObject({ location: 'Gate B', defaultLocation: 'Gate B' });
  });
});
