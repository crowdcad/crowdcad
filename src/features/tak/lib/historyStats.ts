import type { LatLon } from '../types';

/**
 * End-of-event analytics, computed in the browser from the summary history
 * the bridge writes (5-minute windows and a sparse heat-map grid per
 * device-team segment).
 */

export interface HistoryWindowDoc {
  t0: number;
  lat: number;
  lon: number;
  spreadM: number;
  n: number;
  secs: number;
}

export interface HistorySegment {
  segmentId: string;
  deviceUid: string;
  teamId: string;
  startedAt: number;
  endedAt: number | null;
  windows: HistoryWindowDoc[];
  /**
   * `lattice` (contract 0.8.0, D72): the origin is snapped to the event-wide heat grid and cells use its size
   * (heatGrid), so they land exactly on event cells. Older segments start at their first fix.
   */
  grid: { cellM: number; originLat: number; originLon: number; cells: Record<string, number>; overflowSecs?: number; lattice?: boolean };
}

export interface PostLocation {
  name: string;
  lat: number;
  lon: number;
}

export interface CoverageGap {
  from: number;
  to: number;
}

export interface TeamHistoryStats {
  teamId: string;
  trackedSecs: number;
  distanceM: number;
  /** Seconds near each post (within POST_RADIUS_M of the window's mean position), largest first. */
  timeOnPost: { post: string; secs: number }[];
  /** Stretches of at least MIN_GAP_MS with no position, between the team's first and last fix. */
  gaps: CoverageGap[];
}

const R = 6_371_008.8;
export const POST_RADIUS_M = 25;
export const MIN_GAP_MS = 10 * 60_000;
const WINDOW_MS = 5 * 60_000;

export function distanceM(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Per-team statistics. A team's devices' windows are merged in time order. */
export function teamHistoryStats(segments: HistorySegment[], posts: PostLocation[]): TeamHistoryStats[] {
  const byTeam = new Map<string, HistoryWindowDoc[]>();
  for (const seg of segments) {
    byTeam.set(seg.teamId, [...(byTeam.get(seg.teamId) ?? []), ...seg.windows.filter((w) => w.secs > 0 || w.n > 0)]);
  }
  const out: TeamHistoryStats[] = [];
  for (const [teamId, windows] of byTeam) {
    windows.sort((a, b) => a.t0 - b.t0);
    let trackedSecs = 0;
    let distance = 0;
    const onPost = new Map<string, number>();
    const gaps: CoverageGap[] = [];
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i]!;
      trackedSecs += w.secs;
      const prev = windows[i - 1];
      if (prev) {
        // Several devices on one team can share a window; only move between windows.
        if (w.t0 - prev.t0 <= WINDOW_MS && w.t0 !== prev.t0) distance += distanceM(prev, w);
        const gapStart = prev.t0 + WINDOW_MS;
        if (w.t0 - gapStart >= MIN_GAP_MS) gaps.push({ from: gapStart, to: w.t0 });
      }
      let nearest: { name: string; d: number } | null = null;
      for (const p of posts) {
        const d = distanceM(w, p);
        if (d <= POST_RADIUS_M && (!nearest || d < nearest.d)) nearest = { name: p.name, d };
      }
      if (nearest) onPost.set(nearest.name, (onPost.get(nearest.name) ?? 0) + w.secs);
    }
    out.push({
      teamId,
      trackedSecs,
      distanceM: distance,
      timeOnPost: [...onPost].map(([post, secs]) => ({ post, secs })).sort((a, b) => b.secs - a.secs),
      gaps,
    });
  }
  return out.sort((a, b) => b.trackedSecs - a.trackedSecs);
}

export interface HeatCell {
  /** The cell's center. */
  lat: number;
  lon: number;
  secs: number;
  /** The cell's height and width in degrees: cells tile exactly, edge to edge. Always set by heatCells. */
  dLat?: number;
  dLon?: number;
}

/** A heat grid's cell size in degrees. */
export interface HeatGrid {
  latStep: number;
  lonStep: number;
}

const M_PER_DEG_LAT = (R * Math.PI) / 180;

/**
 * The event-wide heat grid (D72): a fixed lattice anchored at 0,0, so cells
 * from every segment line up. The longitude step uses the whole-degree
 * latitude nearest `refLat`, which every segment of an event shares; the
 * bridge snaps each segment's origin to the same lattice.
 */
export function heatGrid(cellM: number, refLat: number): HeatGrid {
  const ref = Math.round(refLat);
  return { latStep: cellM / M_PER_DEG_LAT, lonStep: cellM / (M_PER_DEG_LAT * Math.cos((ref * Math.PI) / 180)) };
}

/** Overlap fractions this small (under 0.1% of a cell, millimetres) are rounding slivers, not real overlap. */
const SLIVER = 1e-3;

/** The target cells a source span [a0, a1) covers on a lattice of `step`, with the fraction of the span in each. */
function spans(a0: number, a1: number, step: number): [number, number][] {
  const out: [number, number][] = [];
  const first = Math.floor(a0 / step + 1e-9);
  const last = Math.ceil(a1 / step - 1e-9) - 1;
  for (let i = first; i <= last; i++) {
    const f = (Math.min(a1, (i + 1) * step) - Math.max(a0, i * step)) / (a1 - a0);
    if (f > SLIVER) out.push([i, f]);
  }
  const total = out.reduce((n, [, f]) => n + f, 0);
  return out.map(([i, f]) => [i, f / total]);
}

/**
 * Every segment's grid cells re-binned onto one event-wide grid (heatGrid):
 * each segment's grid starts at its own first fix, so its cells are split
 * over the event cells they overlap, by area. Seconds are kept. Cells from
 * a bridge that snaps its origins (D72) land exactly on event cells.
 */
export function heatCells(segments: HistorySegment[]): HeatCell[] {
  const first = segments.find((s) => Object.keys(s.grid.cells).length);
  if (!first) return [];
  const cellM = first.grid.cellM;
  const grid = heatGrid(cellM, first.grid.originLat);
  const merged = new Map<string, { ix: number; iy: number; secs: number }>();
  for (const seg of segments) {
    const { cellM: segCellM, originLat, originLon, cells, lattice } = seg.grid;
    // The segment's own cell size: the event lattice's (D72), or for older segments, metres at its first fix.
    const own = lattice ? heatGrid(segCellM, originLat) : null;
    const sLat = own?.latStep ?? segCellM / M_PER_DEG_LAT;
    const sLon = own?.lonStep ?? segCellM / (M_PER_DEG_LAT * Math.cos((originLat * Math.PI) / 180));
    for (const [key, secs] of Object.entries(cells)) {
      const [ix, iy] = key.split(',').map(Number) as [number, number];
      const lat0 = originLat + iy * sLat;
      const lon0 = originLon + ix * sLon;
      for (const [ty, fy] of spans(lat0, lat0 + sLat, grid.latStep)) {
        for (const [tx, fx] of spans(lon0, lon0 + sLon, grid.lonStep)) {
          const k = `${tx},${ty}`;
          const add = secs * fy * fx;
          const existing = merged.get(k);
          if (existing) existing.secs += add;
          else merged.set(k, { ix: tx, iy: ty, secs: add });
        }
      }
    }
  }
  return [...merged.values()].map(({ ix, iy, secs }) => ({
    lat: (iy + 0.5) * grid.latStep,
    lon: (ix + 0.5) * grid.lonStep,
    secs: Math.round(secs * 10) / 10,
    dLat: grid.latStep,
    dLon: grid.lonStep,
  }));
}
