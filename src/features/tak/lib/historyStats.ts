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
  grid: { cellM: number; originLat: number; originLon: number; cells: Record<string, number>; overflowSecs?: number };
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
  lat: number;
  lon: number;
  secs: number;
}

/**
 * All segments' grid cells as positions (cell centers) with seconds, merged
 * across segments that land on the same spot (rounded to ~1 m).
 */
export function heatCells(segments: HistorySegment[]): HeatCell[] {
  const merged = new Map<string, HeatCell>();
  for (const seg of segments) {
    const { cellM, originLat, originLon, cells } = seg.grid;
    const mPerDegLat = (R * Math.PI) / 180;
    const mPerDegLon = mPerDegLat * Math.cos((originLat * Math.PI) / 180);
    for (const [key, secs] of Object.entries(cells)) {
      const [ix, iy] = key.split(',').map(Number) as [number, number];
      const lat = originLat + ((iy + 0.5) * cellM) / mPerDegLat;
      const lon = originLon + ((ix + 0.5) * cellM) / mPerDegLon;
      const k = `${lat.toFixed(5)},${lon.toFixed(5)}`;
      const existing = merged.get(k);
      if (existing) existing.secs += secs;
      else merged.set(k, { lat, lon, secs });
    }
  }
  return [...merged.values()];
}
