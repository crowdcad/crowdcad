'use client';

import React from 'react';
import type { Call, Clinic, Equipment, Layer, Staff, Supervisor, Vehicle } from '@/app/types';
import GeoLayerMap from '@/components/geo/GeoLayerMap';
import type { GeoPin, HeatPoint } from '@/components/geo/BasemapView';
import { AT_ANCHOR, CallMarker, PostMarker, SLOTS, layoutMarkers, type MapOverlay } from '@/components/modals/event/venuemapmodal';
import { callDisplayNumbers, callSpots, isOpenCall } from '@/lib/callMap';
import { AT_PIN, asGeoPins, geoPlacement, placedPosts } from './geoPins';

/**
 * The dispatch Map tab on a geo layer (P8, D64): the live map with the venue
 * image on top, and the same post, team, supervisor and equipment markers as
 * the image map, each at its post's coordinates. The markers are the image
 * map's own components, laid out the same way (layoutMarkers) and drawn at a
 * single point, so they look and behave the same.
 */
export interface GeoVenueMapProps {
  layer: Layer;
  layerIndex: number;
  staff: Staff[];
  supervisor: Supervisor[];
  equipment: Equipment[];
  vehicles?: Vehicle[];
  teamTimers: { [team: string]: number };
  calls: Call[];
  clinics: Clinic[];
  selectedPostName?: string | null;
  selectedTeamName?: string | null;
  selectedSupervisorName?: string | null;
  selectedEquipmentName?: string | null;
  onAddCallAtPost?: (postName: string) => void;
  onAddCallForTeam?: (teamName: string) => void;
  onOpenEquipment?: (equipmentName: string) => void;
  /** Show posts in team and supervisor cards. Off when the event has no posting schedule. */
  showPosts?: boolean;
  /** Draw the posts' own pins (the Map tab's Layers menu can hide them; units at posts are still placed). */
  showPostPins?: boolean;
  focus?: { key: number; lat: number; lng: number } | null;
  overlay?: MapOverlay;
  className?: string;
  /** Draw call markers (#94): open calls, or every call (the event summary's map). Off by default. */
  showCalls?: 'open' | 'all' | false;
  /** "Call #N" numbers when `calls` is only some of the event's (the summary's team filter); counted from `calls` otherwise. */
  callNumbers?: Map<string, number>;
  /** Clicking a call in a call marker's list opens it. */
  onOpenCall?: (callId: string) => void;
  /** Heat cells drawn over the map (the event summary's map). */
  heat?: HeatPoint[] | null;
}

export default function GeoVenueMap({
  layer,
  layerIndex,
  staff,
  supervisor,
  equipment,
  vehicles,
  teamTimers,
  calls,
  selectedPostName,
  selectedTeamName,
  selectedSupervisorName,
  selectedEquipmentName,
  onAddCallAtPost,
  onAddCallForTeam,
  onOpenEquipment,
  showPosts = true,
  showPostPins = true,
  focus,
  overlay,
  className,
  showCalls = false,
  onOpenCall,
  callNumbers,
  heat,
}: GeoVenueMapProps) {
  const placed = placedPosts(layer);

  const pins: GeoPin[] = [];
  for (const [name, { post, at }] of showPostPins ? placed : []) {
    pins.push({
      key: `post:${name}`,
      lat: at.lat,
      lng: at.lng,
      node: <PostMarker post={post} at={AT_PIN} scale={1} isSelected={selectedPostName === name} onAddCall={onAddCallAtPost} />,
    });
  }
  const numbers = callNumbers ?? callDisplayNumbers(calls);
  for (const spot of showCalls ? callSpots(showCalls === 'all' ? calls : calls.filter(isOpenCall), layer, true) : []) {
    pins.push({
      key: spot.key,
      lat: spot.lat!,
      lng: spot.lng!,
      node: <CallMarker calls={spot.calls} at={AT_PIN} offset={spot.atPost ? SLOTS.call : AT_ANCHOR} scale={1} numbers={numbers} onOpenCall={onOpenCall} />,
    });
  }
  pins.push(
    ...asGeoPins(
      layoutMarkers({
        scale: 1,
        staff,
        supervisor,
        equipment,
        calls,
        teamTimers,
        tracking: overlay?.unitTracking,
        vehicles,
        showPosts,
        selectedTeamName,
        selectedSupervisorName,
        selectedEquipmentName,
        onAddCallForTeam,
        onOpenEquipment,
        ...geoPlacement(placed),
      })
    )
  );

  return (
    // The basemap controls live in the Map tab's top bar (venuemaptab.tsx).
    <GeoLayerMap className={className} layer={layer} showPosts={false} showControls={false} extraPins={pins} focus={focus} heat={heat}>
      {overlay?.geoMarkers?.({ layer, layerIndex })}
      {overlay?.chrome}
    </GeoLayerMap>
  );
}
