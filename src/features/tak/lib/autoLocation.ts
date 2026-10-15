import type { Layer } from '@/app/types';
import { postLatLng } from '@/lib/geo/positions';
import type { LatLon, MapAlignment } from '@/lib/geo/types';
import { distanceM, POST_RADIUS_M } from './historyStats';

/**
 * Live location labels (D65): a team's Location filled from its TAK position
 * as the nearest post's name, with words for how close it is. Only posts with
 * coordinates are used; nothing is reverse geocoded.
 *
 * - within POST_RADIUS_M (25 m): "Gate A"
 * - within NEAR_M (100 m): "Near Gate A"
 * - farther: "250 m from Gate A" (rounded to 50 m; "1.2 km" past 1 km)
 *
 * Hysteresis keeps the label steady while a team stands near a boundary:
 * the current post is kept until another is SWITCH_MARGIN_M closer, each
 * distance band is left only BAND_MARGIN_M past its edge, a far distance
 * changes only when it moves by more than DISTANCE_STEP_M, and any new label
 * must hold for DWELL_MS before it is used.
 */

export interface NamedPoint extends LatLon {
  name: string;
}

export type Band = 'at' | 'near' | 'away';

export const NEAR_M = 100;
export const SWITCH_MARGIN_M = 10;
export const BAND_MARGIN_M = 8;
export const DISTANCE_STEP_M = 50;
export const DWELL_MS = 20_000;

export interface Placement {
  post: string;
  band: Band;
  /** Rounded distance shown in an "away" label, else 0. */
  shownM: number;
  label: string;
}

export interface TrackState {
  /** The label in use (null until the first one has held for DWELL_MS). */
  current: Placement | null;
  /** A different label waiting out DWELL_MS. */
  pending: { placement: Placement; since: number } | null;
}

export const EMPTY_TRACK: TrackState = { current: null, pending: null };

/**
 * Named posts with a position, across layers: a geo layer's own coordinates,
 * or an image position through the layer's alignment (`alignmentOf`, which
 * may come from the venue or the event). The first post with a name wins.
 */
export function postPoints(layers: Layer[], alignmentOf: (layer: Layer) => MapAlignment | undefined): NamedPoint[] {
  const out = new Map<string, NamedPoint>();
  for (const layer of layers) {
    const alignment = alignmentOf(layer);
    const withAlignment = alignment ? { ...layer, alignment } : layer;
    for (const post of layer.posts || []) {
      if (typeof post === 'string' || !post.name || out.has(post.name)) continue;
      const at = postLatLng(post, withAlignment);
      if (at) out.set(post.name, { name: post.name, lat: at.lat, lon: at.lng });
    }
  }
  return [...out.values()];
}

function roundedDistance(m: number): number {
  return Math.max(DISTANCE_STEP_M, Math.round(m / DISTANCE_STEP_M) * DISTANCE_STEP_M);
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace(/\.0$/, '')} km` : `${m} m`;
}

export function placementLabel(post: string, band: Band, shownM: number): string {
  if (band === 'at') return post;
  if (band === 'near') return `Near ${post}`;
  return `${formatDistance(shownM)} from ${post}`;
}

/** Band for a distance, leaving the previous band only past its edge plus a margin. */
export function bandFor(d: number, previous?: Band): Band {
  const atEdge = previous === 'at' ? POST_RADIUS_M + BAND_MARGIN_M : POST_RADIUS_M;
  if (d <= atEdge) return 'at';
  const nearEdge = previous === 'at' || previous === 'near' ? NEAR_M + BAND_MARGIN_M : NEAR_M;
  return d <= nearEdge ? 'near' : 'away';
}

/** The placement for a position, given the one in use (for stickiness). Null with no posts. */
export function place(position: LatLon, posts: NamedPoint[], previous: Placement | null): Placement | null {
  if (!posts.length) return null;
  let nearest: { post: NamedPoint; d: number } | null = null;
  for (const post of posts) {
    const d = distanceM(position, post);
    if (!nearest || d < nearest.d) nearest = { post, d };
  }
  let chosen = nearest!;
  // Keep the current post unless another is clearly closer.
  const kept = previous && posts.find((p) => p.name === previous.post);
  if (kept && kept.name !== chosen.post.name) {
    const dKept = distanceM(position, kept);
    if (dKept <= chosen.d + SWITCH_MARGIN_M) chosen = { post: kept, d: dKept };
  }
  const samePost = previous?.post === chosen.post.name;
  const band = bandFor(chosen.d, samePost ? previous!.band : undefined);
  let shownM = 0;
  if (band === 'away') {
    shownM = roundedDistance(chosen.d);
    // Keep the shown distance until the team has really moved.
    if (samePost && previous!.band === 'away' && Math.abs(chosen.d - previous!.shownM) <= DISTANCE_STEP_M * 0.8) shownM = previous!.shownM;
  }
  return { post: chosen.post.name, band, shownM, label: placementLabel(chosen.post.name, band, shownM) };
}

/** Advances a team's state with a new position (or none, to let a pending label mature). */
export function step(state: TrackState, position: LatLon | null, posts: NamedPoint[], now: number): TrackState {
  const candidate = position ? place(position, posts, state.current) : state.pending?.placement ?? null;
  if (!candidate) return state;
  if (state.current && candidate.label === state.current.label) {
    // Same label: keep the in-use placement but take its refined distance band.
    return { current: candidate, pending: null };
  }
  const since = state.pending && state.pending.placement.label === candidate.label ? state.pending.since : now;
  if (now - since >= DWELL_MS) return { current: candidate, pending: null };
  return { current: state.current, pending: { placement: candidate, since } };
}
