'use client';

import React from 'react';
import type { Call, Clinic, Equipment, Layer, Staff, Supervisor } from '@/app/types';
import GeoLayerMap from '@/components/geo/GeoLayerMap';
import type { GeoPin } from '@/components/geo/BasemapView';
import { PostMarker, SupervisorMarker, TeamMarker, type MapOverlay } from '@/components/modals/event/venuemapmodal';
import { AT_PIN, atPin, geoEquipmentPins, placedPosts } from './geoPins';

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
  /** Show posts in team and supervisor cards. Off when the event has no posting schedule. */
  showPosts?: boolean;
  focus?: { key: number; lat: number; lng: number } | null;
  overlay?: MapOverlay;
  className?: string;
}

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
  showPosts = true,
  focus,
  overlay,
  className,
}: GeoVenueMapProps) {
  const placed = placedPosts(layer);

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
  pins.push(...geoEquipmentPins(layer, equipment, selectedEquipmentName, placed));
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
            showPosts={showPosts}
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
            showPosts={showPosts}
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
          showPosts={showPosts}
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
      node: <SupervisorMarker showPosts={showPosts} supervisor={sup} post={atPin(p.post)} rect={AT_PIN} scale={1} isSelected={selectedSupervisorName === sup.team} />,
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
