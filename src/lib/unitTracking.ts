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
}

/** True while a unit has a fresh position: its Location is then tracked, not edited. */
export function isUnitConnected(tracking: UnitTracking | null | undefined, unitName: string): boolean {
  const p = tracking?.positions[unitName];
  return !!p && !p.stale;
}
