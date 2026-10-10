'use client';

import React from 'react';
import type { Call, Clinic, Equipment, Layer, Post, Staff, Supervisor } from '@/app/types';
import { postLatLng } from '@/lib/geo/positions';
import GeoLayerMap from '@/components/geo/GeoLayerMap';
import type { GeoPin } from '@/components/geo/BasemapView';
import { EquipmentMarker, PostMarker, SupervisorMarker, TeamMarker, type ImageRect, type MapOverlay } from '@/components/modals/event/venuemapmodal';

/**
 * The dispatch Map tab on a geo layer (P8, D64): the live map with the venue
 * image on top, and the same post, team, supervisor and equipment markers as
 * the image map, each at its post's coordinates. The markers are the image
 * map's own components, drawn at a single point (an empty rect at the pin),
 * so they look and behave the same.
 */
export interface GeoVenueMapProps {
  layer: Layer;
  layerIndex: number;
  staff: Staff[];
  supervisor: Supervisor[];
  equipment: Equipment[];
  teamTimers: { [team: string]: number };
  calls: Call[];
  clinics: Clinic[];
  selectedPostName?: string | null;
  selectedTeamName?: string | null;
  selectedSupervisorName?: string | null;
  selectedEquipmentName?: string | null;
  onAddCallAtPost?: (postName: string) => void;
  onAddCallForTeam?: (teamName: string) => void;
  focus?: { key: number; lat: number; lng: number } | null;
  overlay?: MapOverlay;
  className?: string;
}

// Markers position themselves at rect.x + x% of rect.width; an empty rect at the pin puts them on it.
const AT_PIN: ImageRect = { x: 0, y: 0, width: 0, height: 0 };

type PostObject = Exclude<Post, string>;

export default function GeoVenueMap({
  layer,
  layerIndex,
  staff,
  supervisor,
  equipment,
  teamTimers,
  calls,
  clinics,
  selectedPostName,
  selectedTeamName,
  selectedSupervisorName,
  selectedEquipmentName,
  onAddCallAtPost,
  onAddCallForTeam,
  focus,
  overlay,
  className,
}: GeoVenueMapProps) {
  const posts = (layer.posts || []).filter((p): p is PostObject => typeof p !== 'string');
  const placed = new Map<string, { post: PostObject; at: { lat: number; lng: number } }>();
  for (const post of posts) {
    const at = postLatLng(post, layer);
    if (at && post.name) placed.set(post.name, { post, at });
  }
  const atPin = (post: PostObject): PostObject => ({ ...post, x: 0, y: 0 });

  const pins: GeoPin[] = [];
  for (const [name, { post, at }] of placed) {
    pins.push({
      key: `post:${name}`,
      lat: at.lat,
      lng: at.lng,
      node: (
        <PostMarker post={atPin(post)} rect={AT_PIN} staff={staff} scale={1} isSelected={selectedPostName === name} onAddCall={onAddCallAtPost} />
      ),
    });
  }
  for (const equip of equipment) {
    const p = equip.location ? placed.get(equip.location) : undefined;
    if (!p) continue;
    pins.push({
      key: `equipment:${equip.id}`,
      lat: p.at.lat,
      lng: p.at.lng,
      node: <EquipmentMarker equipment={equip} post={atPin(p.post)} rect={AT_PIN} scale={1} isSelected={selectedEquipmentName === equip.name} />,
    });
  }
  const tracking = overlay?.unitTracking;
  // Live tracking: each unit at its own position, or not at all (D66).
  if (tracking) {
    for (const team of staff) {
      const p = tracking.positions[team.team];
      if (!p) continue;
      pins.push({
        key: `team:${team.team}`,
        lat: p.lat,
        lng: p.lon,
        node: (
          <TeamMarker
            team={team}
            post={{ name: team.team, x: 0, y: 0 }}
            rect={AT_PIN}
            teamTimers={teamTimers}
            calls={calls}
            clinics={clinics}
            scale={1}
            isSelected={selectedTeamName === team.team}
            onAddCall={onAddCallForTeam}
            exact
            faded={p.stale}
          />
        ),
      });
    }
    for (const sup of supervisor) {
      const p = tracking.positions[sup.team];
      if (!p) continue;
      pins.push({
        key: `supervisor:${sup.team}`,
        lat: p.lat,
        lng: p.lon,
        node: (
          <SupervisorMarker
            supervisor={sup}
            post={{ name: sup.team, x: 0, y: 0 }}
            rect={AT_PIN}
            scale={1}
            isSelected={selectedSupervisorName === sup.team}
            exact
            faded={p.stale}
          />
        ),
      });
    }
  }
  // Teams sharing a post are staggered, as on the image map.
  const occupancy: Record<string, number> = {};
  for (const team of tracking ? [] : staff) {
    const p = team.location ? placed.get(team.location) : undefined;
    if (!p) continue;
    const staggerIndex = occupancy[team.location] ?? 0;
    occupancy[team.location] = staggerIndex + 1;
    pins.push({
      key: `team:${team.team}`,
      lat: p.at.lat,
      lng: p.at.lng,
      node: (
        <TeamMarker
          team={team}
          post={atPin(p.post)}
          rect={AT_PIN}
          teamTimers={teamTimers}
          calls={calls}
          clinics={clinics}
          scale={1}
          isSelected={selectedTeamName === team.team}
          onAddCall={onAddCallForTeam}
          staggerIndex={staggerIndex}
        />
      ),
    });
  }
  for (const sup of tracking ? [] : supervisor) {
    const p = sup.location ? placed.get(sup.location) : undefined;
    if (!p) continue;
    pins.push({
      key: `supervisor:${sup.team}`,
      lat: p.at.lat,
      lng: p.at.lng,
      node: <SupervisorMarker supervisor={sup} post={atPin(p.post)} rect={AT_PIN} scale={1} isSelected={selectedSupervisorName === sup.team} />,
    });
  }

  return (
    // The basemap controls live in the Map tab's top bar (venuemaptab.tsx).
    <GeoLayerMap className={className} layer={layer} showPosts={false} showControls={false} extraPins={pins} focus={focus}>
      {overlay?.geoMarkers?.({ layer, layerIndex })}
      {overlay?.chrome}
    </GeoLayerMap>
  );
}
