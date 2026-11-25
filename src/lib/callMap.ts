/**
 * Calls on the venue map (#94): where each call is drawn, calls at one place
 * stacked into one marker, and teams on a call with a dropped pin drawn at
 * that pin instead of at a post.
 *
 * A call's place is its dropped pin (`locationPoint`) first, else the venue
 * location its Location names. A call with neither (free text that matches
 * no location) has no place and is left off the map.
 */
import type { Call, Layer } from '@/app/types';
import { distanceM } from '@/lib/geo/distance';
import { isGeoLayer } from '@/lib/geo/layers';
import { imagePercentFor, postLatLng } from '@/lib/geo/positions';
import type { UnitPosition, UnitTracking } from '@/lib/unitTracking';
import { isCallResolved } from '@/lib/clinics';

/** Calls closer than this to each other share one marker on a live map. */
export const CALL_STACK_M = 10;
/** The same on an image map, in percent of the image's width and height. */
const CALL_STACK_PCT = 1;

/** A call still being worked: not resolved, and not marked a duplicate of another. */
export function isOpenCall(call: Call): boolean {
  return !isCallResolved(call) && call.status !== 'Resolved' && !call.duplicate;
}

/** The number a call is shown with ("Call #3"): its place among all the event's calls, oldest first. */
export function callDisplayNumbers(calls: Call[]): Map<string, number> {
  const sorted = [...calls].sort((a, b) => parseInt(a.id) - parseInt(b.id));
  return new Map(sorted.map((c, i) => [c.id, i + 1]));
}

/** One marker on a layer: one call, or several at the same place. */
export interface CallSpot {
  key: string;
  calls: Call[];
  /** On a live map (geo layer). */
  lat?: number;
  lng?: number;
  /** On an image map, in percent. */
  x?: number;
  y?: number;
  /** The venue location the calls name, when they are placed there (not at a dropped pin). */
  atPost?: string;
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** The venue location a call's Location names on this layer, if it is placed there. */
function namedPost(call: Call, layer: Layer) {
  const wanted = call.location?.trim().toLowerCase();
  if (!wanted) return null;
  for (const post of layer.posts ?? []) {
    if (typeof post !== 'string' && post.name.trim().toLowerCase() === wanted) return post;
  }
  return null;
}

/** Where a call is drawn on one layer, or null when this layer can't show it. */
function callPlace(call: Call, layer: Layer, live: boolean): { post?: string; lat?: number; lng?: number; x?: number; y?: number } | null {
  const pin = call.locationPoint;
  if (pin) {
    if (live) return isGeoLayer(layer) ? { lat: pin.lat, lng: pin.lng } : null;
    return imagePercentFor(pin, layer);
  }
  const post = namedPost(call, layer);
  if (!post) return null;
  if (live) {
    const at = postLatLng(post, layer);
    return at ? { post: post.name, ...at } : null;
  }
  return isNum(post.x) && isNum(post.y) ? { post: post.name, x: post.x, y: post.y } : null;
}

/**
 * The call markers for one layer, in call order: on its live map when `live`
 * (a geo layer), else on its image. Calls at the same venue location, or
 * within a few meters of each other, share a marker.
 */
export function callSpots(calls: Call[], layer: Layer, live: boolean): CallSpot[] {
  const spots: CallSpot[] = [];
  const ordered = [...calls].sort((a, b) => parseInt(a.id) - parseInt(b.id));
  for (const call of ordered) {
    const at = callPlace(call, layer, live);
    if (!at) continue;
    const near = spots.find((s) => {
      if (at.post && s.atPost === at.post) return true;
      if (live) return isNum(s.lat) && isNum(s.lng) && distanceM({ lat: s.lat, lon: s.lng }, { lat: at.lat!, lon: at.lng! }) <= CALL_STACK_M;
      return isNum(s.x) && isNum(s.y) && Math.abs(s.x - at.x!) <= CALL_STACK_PCT && Math.abs(s.y - at.y!) <= CALL_STACK_PCT;
    });
    if (near) near.calls.push(call);
    else {
      const { post, ...point } = at;
      spots.push({ key: `call:${call.id}`, calls: [call], ...point, ...(post ? { atPost: post } : {}) });
    }
  }
  return spots;
}

/** How many calls have no place on any of the venue's layers (shown as a note under the summary map). */
export function unplacedCallCount(calls: Call[], layers: Layer[]): number {
  return calls.filter((call) => !layers.some((layer) => callPlace(call, layer, true) || callPlace(call, layer, false))).length;
}

/**
 * Units on an open call with a dropped pin are drawn at that pin, not at the
 * post their Location names. Returns the map's unit positions with those
 * added (`atCall` set). A live position from a connected device still wins;
 * a stale one gives way to the pin.
 */
export function withCallPins(tracking: UnitTracking | null | undefined, calls: Call[]): UnitTracking | undefined {
  const pinned: Record<string, UnitPosition> = {};
  for (const call of calls) {
    if (!call.locationPoint || !isOpenCall(call)) continue;
    for (const unit of call.assignedTeam ?? []) {
      if (tracking?.positions[unit] && !tracking.positions[unit].stale) continue;
      pinned[unit] = { lat: call.locationPoint.lat, lon: call.locationPoint.lng, stale: false, atCall: call.id };
    }
  }
  if (!Object.keys(pinned).length) return tracking ?? undefined;
  return {
    alignments: {},
    ...tracking,
    positions: { ...(tracking?.positions ?? {}), ...pinned },
  };
}
