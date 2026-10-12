'use client';

import React from 'react';
import type { Equipment, Layer, Post } from '@/app/types';
import { postLatLng } from '@/lib/geo/positions';
import type { GeoPin } from '@/components/geo/BasemapView';
import { EquipmentMarker, equipmentStaggerIndices, type ImageRect } from '@/components/modals/event/venuemapmodal';
import { equipmentAnchor } from '@/lib/equipmentPlacement';
import type { UnitTracking } from '@/lib/unitTracking';

/**
 * Image-map markers as pins on a geo layer (GeoVenueMap, event setup's map).
 * Kept apart from GeoVenueMap so pages can build pins without loading the
 * live map's code up front.
 */

// Markers position themselves at rect.x + x% of rect.width; an empty rect at the pin puts them on it.
export const AT_PIN: ImageRect = { x: 0, y: 0, width: 0, height: 0 };

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

export const atPin = (post: PostObject): PostObject => ({ ...post, x: 0, y: 0 });

/**
 * Equipment markers on a geo layer, as on the image map: at a post (e.g. its
 * default location while setting up an event), or beside the unit carrying
 * it (equipmentAnchor).
 */
export function geoEquipmentPins(
  layer: Layer,
  equipment: Equipment[],
  selectedEquipmentName?: string | null,
  placed = placedPosts(layer),
  units: { team: string; location?: string }[] = [],
  tracking?: UnitTracking | null
): GeoPin[] {
  const stagger = equipmentStaggerIndices(equipment);
  return equipment.flatMap((equip) => {
    const anchor = equipmentAnchor(equip, units, tracking);
    if (!anchor) return [];
    const p = anchor.kind === 'post' ? placed.get(anchor.post) : undefined;
    const at = anchor.kind === 'point' ? { lat: anchor.lat, lng: anchor.lon } : p?.at;
    if (!at) return [];
    const post = p ? atPin(p.post) : { name: equip.name, x: 0, y: 0 };
    return [
      {
        key: `equipment:${equip.id}`,
        lat: at.lat,
        lng: at.lng,
        node: (
          <EquipmentMarker
            equipment={equip}
            post={post}
            rect={AT_PIN}
            scale={1}
            isSelected={selectedEquipmentName === equip.name}
            staggerIndex={stagger.get(equip.id)}
            faded={anchor.kind === 'point' && anchor.faded}
          />
        ),
      },
    ];
  });
}
