'use client';

import React from 'react';
import type { Equipment, Layer, Post } from '@/app/types';
import { postLatLng } from '@/lib/geo/positions';
import type { GeoPin } from '@/components/geo/BasemapView';
import { EquipmentMarker, equipmentStaggerIndices, type ImageRect } from '@/components/modals/event/venuemapmodal';

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
 * Equipment markers at their posts on a geo layer (each item's `location`,
 * e.g. its default location while setting up an event), as on the image map.
 */
export function geoEquipmentPins(layer: Layer, equipment: Equipment[], selectedEquipmentName?: string | null, placed = placedPosts(layer)): GeoPin[] {
  const stagger = equipmentStaggerIndices(equipment);
  return equipment.flatMap((equip) => {
    const p = equip.location ? placed.get(equip.location) : undefined;
    if (!p) return [];
    return [
      {
        key: `equipment:${equip.id}`,
        lat: p.at.lat,
        lng: p.at.lng,
        node: <EquipmentMarker equipment={equip} post={atPin(p.post)} rect={AT_PIN} scale={1} isSelected={selectedEquipmentName === equip.name} staggerIndex={stagger.get(equip.id)} />,
      },
    ];
  });
}
