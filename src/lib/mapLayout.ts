import type { Equipment, Vehicle } from '@/app/types';
import { equipmentHolderUnit } from '@/lib/equipmentPlacement';
import { getStatusColor } from '@/lib/statusColors';
import type { UnitTracking } from '@/lib/unitTracking';
import { throughVehicle } from '@/lib/vehicles';

/**
 * What goes where on the venue map, for both the image map and the live map
 * (they only differ in turning an anchor into screen coordinates).
 *
 * - A unit is drawn at its live position, beside a call's dropped pin when
 *   it's on that call, or beside the post its Location names.
 * - Several units of one kind beside the same post or pin share one stacked
 *   marker, most urgent on top.
 * - Equipment a unit has is not drawn on its own: the unit shows how many
 *   pieces it has. Equipment on a vehicle is wherever the vehicle is.
 * - Other equipment at one post shares a stacked marker too.
 */

export type MapAnchor = { kind: 'post'; post: string } | { kind: 'point'; lat: number; lon: number };

interface UnitLike {
  team: string;
  location?: string;
  status: string;
}

export interface UnitGroup<U> {
  key: string;
  anchor: MapAnchor;
  /** Beside the anchor (a post or a call's pin), in the unit's own slot, rather than exactly on it. */
  beside: boolean;
  /** Most urgent first. */
  units: U[];
  /** A lone unit's live position: no report for a while. */
  stale?: boolean;
  /** A lone unit's live position: direction of travel, degrees from north. */
  heading?: number;
}

/** Lower is more urgent: on a call, running equipment, available, anything else, on break. */
export function unitUrgency(status: string): number {
  if (status === 'En Route' || status === 'On Scene' || status === 'Transporting') return 0;
  if (getStatusColor(status).textClass === 'text-status-orange') return 1;
  if (status === 'Available') return 2;
  if (status === 'On Break') return 4;
  return 3;
}

/**
 * Units grouped by where they're drawn. `canShow` says whether this map can
 * show a point: a unit at a call's pin the map can't show falls back to its
 * post, and a live position it can't show is left off.
 */
export function unitGroups<U extends UnitLike>(units: U[], tracking: UnitTracking | null | undefined, canShow: (lat: number, lon: number) => boolean): UnitGroup<U>[] {
  const groups = new Map<string, UnitGroup<U>>();
  const add = (key: string, make: () => Omit<UnitGroup<U>, 'units'>, unit: U) => {
    const group = groups.get(key) ?? { ...make(), units: [] };
    group.units.push(unit);
    groups.set(key, group);
  };
  for (const unit of units) {
    const p = tracking?.positions[unit.team];
    if (p && !p.atCall) {
      if (canShow(p.lat, p.lon)) {
        add(`unit:${unit.team}`, () => ({ key: `unit:${unit.team}`, anchor: { kind: 'point', lat: p.lat, lon: p.lon }, beside: false, stale: p.stale, heading: p.heading }), unit);
      }
      continue;
    }
    if (p?.atCall && canShow(p.lat, p.lon)) {
      add(`call:${p.atCall}`, () => ({ key: `call:${p.atCall}`, anchor: { kind: 'point', lat: p.lat, lon: p.lon }, beside: true }), unit);
      continue;
    }
    if (unit.location) add(`post:${unit.location}`, () => ({ key: `post:${unit.location}`, anchor: { kind: 'post', post: unit.location! }, beside: true }), unit);
  }
  return [...groups.values()].map((g) => ({ ...g, units: [...g.units].sort((a, b) => unitUrgency(a.status) - unitUrgency(b.status)) }));
}

export interface EquipmentGroup<E> {
  key: string;
  anchor: MapAnchor;
  /** At a post (beside its pin), rather than at a tracker's own position. */
  beside: boolean;
  items: E[];
  stale?: boolean;
}

export interface EquipmentLayout<E> {
  /** By unit name: the equipment each unit has. */
  carried: Map<string, E[]>;
  groups: EquipmentGroup<E>[];
}

/** Lower is more urgent: in use, anything else, available. */
const equipmentUrgency = (status: string | undefined) => (status === 'Available' ? 2 : status === 'In Use' || status?.startsWith('Call ') ? 0 : 1);

export function equipmentLayout<E extends Equipment>(
  equipment: E[],
  units: { team: string; location?: string }[],
  tracking: UnitTracking | null | undefined,
  vehicles: Vehicle[] = []
): EquipmentLayout<E> {
  const carried = new Map<string, E[]>();
  const groups = new Map<string, EquipmentGroup<E>>();
  for (const item of equipment) {
    const tag = tracking?.equipmentPositions?.[item.name];
    if (tag) {
      groups.set(`equipment:${item.id}`, { key: `equipment:${item.id}`, anchor: { kind: 'point', lat: tag.lat, lon: tag.lon }, beside: false, items: [item], stale: tag.stale });
      continue;
    }
    const placed = throughVehicle(item, vehicles);
    const holder = equipmentHolderUnit(placed, units);
    if (holder) {
      carried.set(holder.team, [...(carried.get(holder.team) ?? []), item]);
      continue;
    }
    if (!placed.location) continue;
    const key = `post:${placed.location}`;
    const group = groups.get(key) ?? { key, anchor: { kind: 'post' as const, post: placed.location }, beside: true, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  for (const g of groups.values()) g.items.sort((a, b) => equipmentUrgency(a.status) - equipmentUrgency(b.status));
  return { carried, groups: [...groups.values()] };
}
