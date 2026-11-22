import type { Layer } from '@/app/types';
import { distanceM, formatMeters } from './distance';
import { postLatLng } from './positions';
import type { LatLon } from './types';

/** Within this of a venue location, a point is just that location. */
const AT_M = 25;

/**
 * Words for a point dropped on the map: the nearest venue location's name when it is that close, else how far
 * from it ("80 m from Sather Gate"), else the coordinates when the venue has no placed locations.
 */
export function describePoint(point: LatLon, layers: Layer[]): string {
  let best: { name: string; d: number } | null = null;
  for (const layer of layers) {
    for (const post of layer.posts ?? []) {
      if (typeof post === 'string') continue;
      const p = postLatLng(post, layer);
      if (!p) continue;
      const d = distanceM(point, { lat: p.lat, lon: p.lng });
      if (!best || d < best.d) best = { name: post.name, d };
    }
  }
  if (!best) return `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
  return best.d <= AT_M ? best.name : `${formatMeters(best.d)} from ${best.name}`;
}
