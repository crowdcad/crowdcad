'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Layer, Staff, Supervisor } from '@/app/types';
import { useTakEvent, useTakView } from '../data/hub';
import { alignmentMatches } from '../data/alignmentStore';
import { latLonToPercent } from '../lib/affine';
import { isStale, teamPositions } from '../lib/linking';
import { takTeams } from '../lib/teamIds';
import { TAK_MODULE_MARKER } from '../marker';

/**
 * Live TAK team positions drawn on the dispatch map, through the map's
 * overlay slot. A layer shows positions only once it has been aligned for
 * its current image; positions outside the image are not drawn.
 */
export interface TakLiveMarkersProps {
  eventId: string;
  staff: Staff[];
  supervisor: Supervisor[];
  layer: Layer | undefined;
  rect: { x: number; y: number; width: number; height: number };
  scale: number;
}

export default function TakLiveMarkers({ eventId, staff, supervisor, layer, rect, scale }: TakLiveMarkersProps) {
  const tak = useTakEvent(eventId);
  const view = useTakView(eventId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const teams = useMemo(() => takTeams(staff, supervisor), [staff, supervisor]);
  const positions = useMemo(() => teamPositions(tak.live, tak.links, teams), [tak.live, tak.links, teams]);
  const alignment = layer ? tak.alignments[layer.id] : undefined;
  if (!layer || !alignmentMatches(alignment, layer.mapUrl)) return null;
  const showLive = !!tak.config?.enabled;
  const heat = view.heatmap;
  const maxSecs = heat && heat.length ? Math.max(...heat.map((c) => c.secs)) : 0;

  return (
    <div className="pointer-events-none absolute inset-0" data-tak-module={TAK_MODULE_MARKER}>
      {heat?.map((c, i) => {
        const pct = latLonToPercent(alignment!, c);
        if (pct.x < 0 || pct.x > 100 || pct.y < 0 || pct.y > 100) return null;
        // Size each 5 m cell from the alignment: project a point 5 m east of the cell center.
        const east = latLonToPercent(alignment!, { lat: c.lat, lon: c.lon + 5 / (111_195 * Math.cos((c.lat * Math.PI) / 180)) });
        const sizePx = Math.max(3, Math.hypot(((east.x - pct.x) / 100) * rect.width, ((east.y - pct.y) / 100) * rect.height));
        return (
          <span
            key={i}
            className="absolute rounded-sm bg-status-red"
            style={{
              left: rect.x + (pct.x / 100) * rect.width,
              top: rect.y + (pct.y / 100) * rect.height,
              width: sizePx,
              height: sizePx,
              transform: 'translate(-50%, -50%)',
              opacity: 0.15 + 0.7 * Math.sqrt(c.secs / maxSecs),
            }}
          />
        );
      })}
      {showLive && positions.map(({ team, position, deviceCount }) => {
        const pct = latLonToPercent(alignment!, position);
        if (pct.x < 0 || pct.x > 100 || pct.y < 0 || pct.y > 100) return null;
        const stale = isStale(position, now);
        const ageMin = Math.floor((now - position.receivedAt) / 60_000);
        return (
          <div
            key={team.id}
            className="absolute flex flex-col items-center"
            style={{
              left: rect.x + (pct.x / 100) * rect.width,
              top: rect.y + (pct.y / 100) * rect.height,
              transform: `translate(-50%, -50%) scale(${1 / scale})`,
              opacity: stale ? 0.45 : 1,
            }}
            title={`${team.name} (TAK${deviceCount > 1 ? `, ${deviceCount} devices` : ''})${stale ? `, last seen ${ageMin} min ago` : ''}`}
          >
            <span
              className={`h-3.5 w-3.5 rounded-full border-2 border-white shadow ${
                team.kind === 'supervisor' ? 'bg-accent' : 'bg-status-blue'
              }`}
            />
            <span className="mt-0.5 whitespace-nowrap rounded bg-surface-deepest/90 px-1 text-[10px] font-medium text-surface-light">
              {team.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
