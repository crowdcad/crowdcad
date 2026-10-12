import type { Equipment } from '@/app/types';
import type { UnitTracking } from '@/lib/unitTracking';

/**
 * Where to draw a piece of equipment on the map. It has no tracker of its
 * own, so it is drawn with its holder (src/lib/equipmentCustody.ts):
 * - at a post or clinic: that post's pin;
 * - with a unit: beside the unit's marker, which is its live position on a
 *   tracking event (faded while stale, hidden with no position), or the post
 *   its Location names otherwise.
 */
export type EquipmentAnchor =
  | { kind: 'post'; post: string }
  | { kind: 'point'; lat: number; lon: number; faded: boolean };

interface UnitLike {
  team: string;
  location?: string;
}

/**
 * The unit holding the equipment, if a unit has it. Read from `location`,
 * which custody keeps equal to the holder's name (and which event setup
 * replaces with the default location to show where items start).
 */
export function equipmentHolderUnit(equip: Equipment, units: UnitLike[]): UnitLike | undefined {
  return equip.location ? units.find((u) => u.team === equip.location) : undefined;
}

export function equipmentAnchor(equip: Equipment, units: UnitLike[], tracking?: UnitTracking | null): EquipmentAnchor | null {
  const unit = equipmentHolderUnit(equip, units);
  if (!unit) return equip.location ? { kind: 'post', post: equip.location } : null;
  if (tracking) {
    const p = tracking.positions[unit.team];
    return p ? { kind: 'point', lat: p.lat, lon: p.lon, faded: p.stale } : null;
  }
  return unit.location ? { kind: 'post', post: unit.location } : null;
}
