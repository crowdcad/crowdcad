import type { Equipment } from '@/app/types';

interface UnitLike {
  team: string;
  location?: string;
}

/**
 * The unit holding the equipment, if a unit has it. Read from `location`,
 * which custody keeps equal to the holder's name (and which event setup
 * replaces with the default location to show where items start). On the map
 * the unit shows it (src/lib/mapLayout.ts).
 */
export function equipmentHolderUnit(equip: Pick<Equipment, 'location'>, units: UnitLike[]): UnitLike | undefined {
  return equip.location ? units.find((u) => u.team === equip.location) : undefined;
}
