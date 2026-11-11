import type { Layer } from '@/app/types';
import { postLatLng } from '@/lib/geo/positions';
import type { LatLon, MapAlignment } from '@/lib/geo/types';
import { distanceM, POST_RADIUS_M } from './historyStats';

/**
 * Live location labels (D65, D71): a team's Location filled from its TAK
 * position as a post's name, with words for how close it is. Only posts with
 * coordinates are used; nothing is reverse geocoded.
 *
 * - inside a post's capture radius (CAPTURE_M): "Gate A"
 * - within NEAR_M: "Near Gate A"
 * - farther: "250 m from Gate A" (rounded to 50 m; "1.2 km" past 1 km)
 *
 * Capture and anchoring keep the label on one post instead of flickering
 * between two (D71):
 * - a team is *at* a post once inside its capture radius, and stays at it
 *   until EXIT_MARGIN_M past that radius;
 * - after leaving, it stays anchored to the last post ("Near Gate A") until
 *   it is inside another post's radius, or another post is ANCHOR_SWITCH_M
 *   closer, or it is past NEAR_M;
 * - a far distance changes only when it moves by more than DISTANCE_STEP_M.
 *
 * A new label must hold for a dwell time before it is used: DWELL_AT_MS for
 * arriving at a post (a confident change), DWELL_MS for anything else.
 *
 * Every open dispatch page runs this; each seeds it from the label already
 * stored on the unit (`stored` in step), so pages agree on where a team was
 * and never overwrite each other back and forth.
 */

export interface NamedPoint extends LatLon {
  name: string;
}

export type Band = 'at' | 'near' | 'away';

export const CAPTURE_M = POST_RADIUS_M;
export const EXIT_MARGIN_M = 8;
export const NEAR_M = 100;
export const ANCHOR_SWITCH_M = 25;
export const SWITCH_MARGIN_M = 10;
export const DISTANCE_STEP_M = 50;
export const DWELL_AT_MS = 5_000;
export const DWELL_MS = 15_000;

export interface Placement {
  post: string;
  band: Band;
  /** Rounded distance shown in an "away" label, else 0. */
  shownM: number;
  label: string;
}

export interface TrackState {
  /** The label in use (null until the first one has held for its dwell time). */
  current: Placement | null;
  /** A different label waiting out its dwell time. */
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

/**
 * The placement a stored label names, if it is one of these labels for a
 * known post ("Gate A", "Near Gate A", "250 m from Gate A"); else null (a
 * label typed by hand, or a post that no longer exists).
 */
export function parsePlacement(label: string | undefined, posts: NamedPoint[]): Placement | null {
  if (!label) return null;
  const names = new Set(posts.map((p) => p.name));
  if (names.has(label)) return { post: label, band: 'at', shownM: 0, label };
  if (label.startsWith('Near ') && names.has(label.slice(5))) return { post: label.slice(5), band: 'near', shownM: 0, label };
  const far = /^(\d+(?:\.\d+)?) (m|km) from (.+)$/.exec(label);
  if (far && names.has(far[3]!)) {
    const shownM = Math.round(Number(far[1]) * (far[2] === 'km' ? 1000 : 1));
    return { post: far[3]!, band: 'away', shownM, label };
  }
  return null;
}

function make(post: string, band: Band, shownM = 0): Placement {
  return { post, band, shownM, label: placementLabel(post, band, shownM) };
}

/** The placement for a position, given the one in use (for capture and anchoring). Null with no posts. */
export function place(position: LatLon, posts: NamedPoint[], previous: Placement | null): Placement | null {
  if (!posts.length) return null;
  const withD = posts.map((post) => ({ post, d: distanceM(position, post) }));
  let nearest = withD[0]!;
  for (const x of withD) if (x.d < nearest.d) nearest = x;
  const prev = previous ? withD.find((x) => x.post.name === previous.post) : undefined;

  // At a post: stay until clearly past its capture radius.
  if (prev && previous!.band === 'at' && prev.d <= CAPTURE_M + EXIT_MARGIN_M) return make(prev.post.name, 'at');
  // Inside a post's capture radius: at it (the nearest, if radii overlap).
  if (nearest.d <= CAPTURE_M) return make(nearest.post.name, 'at');

  // Between posts: stay anchored to the last post while near it, unless another is clearly closer.
  if (prev && previous!.band !== 'away' && prev.d <= NEAR_M + EXIT_MARGIN_M && nearest.d + ANCHOR_SWITCH_M > prev.d) {
    return make(prev.post.name, 'near');
  }
  if (nearest.d <= NEAR_M) return make(nearest.post.name, 'near');

  // Far away: words the distance from the nearest post, keeping the previous post unless another is clearly closer.
  let chosen = nearest;
  if (prev && prev.post.name !== nearest.post.name && prev.d <= nearest.d + SWITCH_MARGIN_M) chosen = prev;
  let shownM = roundedDistance(chosen.d);
  // Keep the shown distance until the team has really moved.
  if (previous?.band === 'away' && previous.post === chosen.post.name && Math.abs(chosen.d - previous.shownM) <= DISTANCE_STEP_M * 0.8) {
    shownM = previous.shownM;
  }
  return make(chosen.post.name, 'away', shownM);
}

/** How long a new placement must hold before it is used. */
export function dwellFor(placement: Placement): number {
  return placement.band === 'at' ? DWELL_AT_MS : DWELL_MS;
}

/**
 * Advances a team's state with a new position (or none, to let a pending
 * label mature). `stored` is the label already on the unit, parsed with
 * parsePlacement: when it differs from this page's own, this page adopts it,
 * so every page builds on the same history.
 */
export function step(state: TrackState, position: LatLon | null, posts: NamedPoint[], now: number, stored: Placement | null = null): TrackState {
  if (stored && stored.label !== state.current?.label) {
    state = { current: stored, pending: state.pending && state.pending.placement.label !== stored.label ? state.pending : null };
  }
  const candidate = position ? place(position, posts, state.current) : state.pending?.placement ?? null;
  if (!candidate) return state;
  if (state.current && candidate.label === state.current.label) {
    // Same label: keep the in-use placement but take its refined state.
    return { current: candidate, pending: null };
  }
  const since = state.pending && state.pending.placement.label === candidate.label ? state.pending.since : now;
  if (now - since >= dwellFor(candidate)) return { current: candidate, pending: null };
  return { current: state.current, pending: { placement: candidate, since } };
}

/** When the pending label (if any) will have held long enough, for scheduling the next check. */
export function maturesAt(state: TrackState): number | null {
  return state.pending ? state.pending.since + dwellFor(state.pending.placement) : null;
}
