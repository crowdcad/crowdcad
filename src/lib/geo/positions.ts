import type { Layer, Post, Zone } from '@/app/types';
import { latLonToPercent, percentToLatLon } from './affine';
import { layerAlignment, layerArea } from './layers';

/**
 * Positions of posts and zones on geo layers (P8, D64). On a geo layer a
 * post's `lat`/`lng` is its position, and `x`/`y` (image percent) are kept
 * when it is inside the image so image views still show it. A zone keeps
 * `coords` and, on an aligned image, the matching `points`.
 */

export type LatLng = { lat: number; lng: number };
type PostObject = Exclude<Post, string>;

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Where a post is on a geo layer: its own coordinates, else its image position through the alignment. */
export function postLatLng(post: Post, layer: Layer): LatLng | null {
  if (typeof post === 'string') return null;
  if (isNum(post.lat) && isNum(post.lng) && (layerAlignment(layer) || layerArea(layer))) return { lat: post.lat, lng: post.lng };
  const a = layerAlignment(layer);
  if (a && isNum(post.x) && isNum(post.y)) {
    const p = percentToLatLon(a, post.x, post.y);
    return { lat: p.lat, lng: p.lon };
  }
  return null;
}

/** The image position for a coordinate on an aligned layer, or null when it falls outside the image (or there is no image). */
export function imagePercentFor(p: LatLng, layer: Layer): { x: number; y: number } | null {
  const a = layerAlignment(layer);
  if (!a) return null;
  const { x, y } = latLonToPercent(a, { lat: p.lat, lon: p.lng });
  return x >= 0 && x <= 100 && y >= 0 && y <= 100 ? { x, y } : null;
}

/** A post placed or moved to a coordinate on a geo layer. */
export function postAt(post: PostObject, p: LatLng, layer: Layer): PostObject {
  const pct = imagePercentFor(p, layer);
  return { ...post, lat: p.lat, lng: p.lng, x: pct ? pct.x : null, y: pct ? pct.y : null };
}

/** A zone's polygon in coordinates, if it has one on this layer. */
export function zoneLatLngs(zone: Zone, layer: Layer): LatLng[] | null {
  if (zone.coords && zone.coords.length >= 3) return zone.coords;
  const a = layerAlignment(layer);
  if (!a || zone.points.length < 3) return null;
  return zone.points.map((pt) => {
    const p = percentToLatLon(a, pt.x, pt.y);
    return { lat: p.lat, lng: p.lon };
  });
}

/** Image-percent vertices for a polygon drawn on an aligned layer (they may run past the image's edges), or [] with no image. */
export function zonePointsFor(coords: LatLng[], layer: Layer): { x: number; y: number }[] {
  const a = layerAlignment(layer);
  if (!a) return [];
  return coords.map((c) => {
    const { x, y } = latLonToPercent(a, { lat: c.lat, lon: c.lng });
    return { x, y };
  });
}

/**
 * Fills coordinates for posts and zones that only have image positions, on
 * an aligned layer (saving an aligned venue, D64). Image positions are kept,
 * so nothing moves and image views still work. Other layers are returned as is.
 */
export function withCoordinates(layer: Layer): Layer {
  const a = layerAlignment(layer);
  if (!a) return layer;
  let changed = false;
  const posts = layer.posts.map((post) => {
    if (typeof post === 'string' || (isNum(post.lat) && isNum(post.lng)) || !isNum(post.x) || !isNum(post.y)) return post;
    changed = true;
    const p = percentToLatLon(a, post.x, post.y);
    return { ...post, lat: p.lat, lng: p.lon };
  });
  const zones = layer.zones?.map((zone) => {
    if (zone.coords?.length || zone.points.length < 3) return zone;
    changed = true;
    return { ...zone, coords: zoneLatLngs(zone, layer)! };
  });
  return changed ? { ...layer, posts, ...(zones ? { zones } : {}) } : layer;
}

/** [west, south, east, north] around a set of coordinates, or null for none. */
export function boundsOf(points: LatLng[]): [number, number, number, number] | null {
  if (!points.length) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

/** True if a post can be shown on this layer's map: by image position, or by coordinates on a geo layer. */
export function isPlacedPost(post: Post, layer: Layer): post is PostObject {
  if (typeof post === 'string' || !post.name) return false;
  return (isNum(post.x) && isNum(post.y)) || postLatLng(post, layer) !== null;
}
