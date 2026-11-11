import type { MapAlignment } from '@/lib/geo/types';

/**
 * Live positions of teams and supervisors from a tracking source (the
 * optional TAK module, D66). Core only reads this shape; it never knows
 * where the positions come from.
 *
 * While an event has live tracking, a unit's map marker is drawn at its
 * position (never beside a post pin), and its Location is written by the
 * tracking source and can't be edited while the unit is connected.
 */
export interface UnitPosition {
  lat: number;
  lon: number;
  /** No report for a while: drawn faded, and the unit counts as not connected. */
  stale: boolean;
}

export interface UnitTracking {
  /** By unit name (Staff.team / Supervisor.team). */
  positions: Record<string, UnitPosition>;
  /** Alignment per layer id, for drawing positions on image maps. */
  alignments: Record<string, MapAlignment>;
  /**
   * By unit name: the post a connected unit has steadily been at (within the
   * source's arrival radius, held past its dwell time). Drives equipment
   * pickup and return suggestions (equipmentArrivals.ts).
   */
  atPost?: Record<string, string>;
  /**
   * By equipment name: positions of equipment with a tracker of its own.
   * A tracked item is drawn at its tracker, not with its holder.
   */
  equipmentPositions?: Record<string, UnitPosition>;
}

/** True while a unit has a fresh position: its Location is then tracked, not edited. */
export function isUnitConnected(tracking: UnitTracking | null | undefined, unitName: string): boolean {
  const p = tracking?.positions[unitName];
  return !!p && !p.stale;
}

/**
 * Units whose Location comes from live tracking right now (D66): on a
 * tracking event, those with a fresh position. Every other unit, including
 * one on a tracking event with no device linked, or whose device has gone
 * stale, behaves exactly as on a standard event.
 */
export function trackedUnitNames(mapMode: string | undefined, tracking: UnitTracking | null | undefined): Set<string> {
  const out = new Set<string>();
  if (mapMode !== 'tak' || !tracking) return out;
  for (const [name, p] of Object.entries(tracking.positions)) if (!p.stale) out.add(name);
  return out;
}
