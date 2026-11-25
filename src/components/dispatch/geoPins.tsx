'use client';

import type { Equipment, Layer, Post, Vehicle } from '@/app/types';
import { postLatLng } from '@/lib/geo/positions';
import type { GeoPin } from '@/components/geo/BasemapView';
import { AT_PIN, layoutMarkers, type MarkerContext, type PlacedMarker } from '@/components/modals/event/venuemapmodal';

/**
 * Image-map markers as pins on a geo layer (GeoVenueMap, event setup's map).
 * Kept apart from GeoVenueMap so pages can build pins without loading the
 * live map's code up front.
 */

export { AT_PIN };

type PostObject = Exclude<Post, string>;

/** Posts with a position on a geo layer, by name. */
export function placedPosts(layer: Layer) {
  const placed = new Map<string, { post: PostObject; at: { lat: number; lng: number } }>();
  for (const post of layer.posts || []) {
    if (typeof post === 'string') continue;
    const at = postLatLng(post, layer);
    if (at && post.name) placed.set(post.name, { post, at });
  }
  return placed;
}

/** The parts of a MarkerContext that place markers on a live map: anchors at their pins, north up. */
export function geoPlacement(placed: ReturnType<typeof placedPosts>): Pick<MarkerContext, 'canShow' | 'place' | 'headingOnScreen'> {
  return {
    canShow: () => true,
    place: (anchor) => {
      if (anchor.kind === 'point') return { at: AT_PIN, lat: anchor.lat, lng: anchor.lon };
      const p = placed.get(anchor.post);
      return p ? { at: AT_PIN, lat: p.at.lat, lng: p.at.lng } : null;
    },
    headingOnScreen: (_lat, _lon, heading) => heading,
  };
}

/** Placed markers as live-map pins. */
export const asGeoPins = (markers: PlacedMarker[]): GeoPin[] =>
  markers.flatMap((m) => (m.lat == null || m.lng == null ? [] : [{ key: m.key, lat: m.lat, lng: m.lng, node: m.node }]));

/**
 * Equipment markers on a geo layer when setting up a venue or event: at its
 * (default) location, or where the vehicle it's on is parked.
 */
export function geoEquipmentPins(layer: Layer, equipment: Equipment[], vehicles: Vehicle[] = []): GeoPin[] {
  return asGeoPins(
    layoutMarkers({
      scale: 1,
      staff: [],
      supervisor: [],
      equipment,
      calls: [],
      teamTimers: {},
      vehicles,
      ...geoPlacement(placedPosts(layer)),
    })
  );
}
