import type { Event, Vehicle, Venue } from '@/app/types';
import { custodyOf, moveEquipment, stagingLocation, type Fleet } from '@/lib/equipmentCustody';

/**
 * Vehicles (#176): carts and other vehicles that carry equipment. A vehicle
 * is an equipment holder like a post: equipment on it has the vehicle's name
 * as its location (and as its default location, so it returns there). The
 * vehicle's own location is a post, or the unit crewing it, so its equipment
 * shows wherever the vehicle is.
 */

/** The event's vehicles, while vehicles are on for it. */
export function eventVehicles(event: Pick<Event, 'vehiclesEnabled' | 'eventVehicles'> | null | undefined): Vehicle[] {
  return event?.vehiclesEnabled ? event.eventVehicles ?? [] : [];
}

/** The venue's vehicles, while vehicles are set up for it. */
export function venueVehicles(venue: Pick<Venue, 'vehiclesEnabled' | 'vehicles'> | null | undefined): Vehicle[] {
  return venue?.vehiclesEnabled ? venue.vehicles ?? [] : [];
}

/** Something on a vehicle, placed where the vehicle is. Anything else is returned as is. */
export function throughVehicle<T extends { location?: string }>(item: T, vehicles: Vehicle[]): T {
  const vehicle = item.location ? vehicles.find((v) => v.name === item.location) : undefined;
  return vehicle ? { ...item, location: vehicle.location } : item;
}

/** The vehicle a unit crews, if any. */
export function vehicleOfUnit(unit: string, vehicles: Vehicle[]): Vehicle | undefined {
  return vehicles.find((v) => v.location === unit);
}

/** Renames a vehicle in place, and moves what's on it along with it. */
export function renameVehicleIn<T extends { location?: string; defaultLocation?: string }>(items: T[], from: string, to: string): T[] {
  return items.map((item) => ({
    ...item,
    ...(item.location === from ? { location: to } : {}),
    ...(item.defaultLocation === from ? { defaultLocation: to } : {}),
  }));
}

/**
 * Puts a piece of equipment on a vehicle, or takes it off (`vehicle` null),
 * on the dispatch board. Its default location becomes the vehicle (or, taken
 * off, the place the vehicle is). Equipment sitting at its default location
 * moves now; equipment out on a run goes there when it's returned.
 */
export function setEquipmentVehicle(fleet: Fleet, event: Event, equipmentName: string, vehicle: Vehicle | null, t: number): Fleet {
  const eq = fleet.eventEquipment.find((e) => e.name === equipmentName);
  if (!eq) return fleet;
  const current = eventVehicles(event).find((v) => v.name === eq.defaultLocation);
  // Taken off a vehicle parked at a post, it stays at that post; otherwise it goes back to the venue's default.
  const home = vehicle ? vehicle.name : current?.location && !unitName(event, current.location) ? current.location : undefined;
  const staged = custodyOf(eq, event).phase === 'staged';
  const next: Fleet = {
    ...fleet,
    eventEquipment: fleet.eventEquipment.map((e) => (e.name === equipmentName ? { ...e, defaultLocation: home } : e)),
  };
  if (!staged) return next;
  return moveEquipment(next, event, equipmentName, home ?? stagingLocation({ ...eq, defaultLocation: undefined }, event), t);
}

const unitName = (event: Pick<Event, 'staff' | 'supervisor'>, name: string) =>
  [...(event.staff ?? []), ...(event.supervisor ?? [])].some((u) => u.team === name);
