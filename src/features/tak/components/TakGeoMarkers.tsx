'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Staff, Supervisor } from '@/app/types';
import { GeoPins, type GeoPin } from '@/components/geo/BasemapView';
import { useTakEvent } from '../data/hub';
import { isStale, teamPositions } from '../lib/linking';
import { takTeams } from '../lib/teamIds';
import { TAK_MODULE_MARKER } from '../marker';

/**
 * Live TAK team positions on the dispatch live map (geo layers, P8, D64),
 * through the map overlay's geoMarkers. Positions are pinned by their own
 * coordinates, so they show anywhere on the map, inside the venue image or not.
 */
export interface TakGeoMarkersProps {
  eventId: string;
  staff: Staff[];
  supervisor: Supervisor[];
}

export default function TakGeoMarkers({ eventId, staff, supervisor }: TakGeoMarkersProps) {
  const tak = useTakEvent(eventId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const teams = useMemo(() => takTeams(staff, supervisor), [staff, supervisor]);
  const positions = useMemo(() => teamPositions(tak.live, tak.links, teams), [tak.live, tak.links, teams]);
  if (!tak.config?.enabled) return null;

  const pins: GeoPin[] = positions.map(({ team, position, deviceCount }) => {
    const stale = isStale(position, now);
    const ageMin = Math.floor((now - position.receivedAt) / 60_000);
    return {
      key: `tak:${team.id}`,
      lat: position.lat,
      lng: position.lon,
      node: (
        <div
          className="flex -translate-y-[7px] flex-col items-center"
          style={{ opacity: stale ? 0.45 : 1 }}
          data-tak-module={TAK_MODULE_MARKER}
          title={`${team.name} (TAK${deviceCount > 1 ? `, ${deviceCount} devices` : ''})${stale ? `, last seen ${ageMin} min ago` : ''}`}
        >
          <span
            className={`h-3.5 w-3.5 rounded-full border-2 border-white shadow ${team.kind === 'supervisor' ? 'bg-accent' : 'bg-status-blue'}`}
          />
          <span className="mt-0.5 whitespace-nowrap rounded bg-surface-deepest/90 px-1 text-[10px] font-medium text-surface-light">
            {team.name}
          </span>
        </div>
      ),
    };
  });
  return <GeoPins pins={pins} />;
}
