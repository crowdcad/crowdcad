'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Layer } from '@/app/types';
import type { MapAlignment } from '@/lib/geo/types';
import type { UnitTracking } from '@/lib/unitTracking';
import { useTakEvent } from '../data/hub';
import { alignmentFor } from '../data/alignmentStore';
import { isStale, teamPositions, type TakTeam } from '../lib/linking';

/**
 * Live unit positions for an MCI role view's map (#154), with no UI. A role
 * login can't read the event, so units come from the MCI unit summary (name and
 * id); positions, device links and alignments are read as the rules allow an
 * active role login. Reports a core `UnitTracking`, like TakEventAgent.
 */
export interface TakRolePositionsProps {
  eventId: string;
  units: { id?: string; name: string; kind: 'team' | 'supervisor' }[];
  layers: Layer[];
  onTracking: (tracking: UnitTracking) => void;
}

export default function TakRolePositions({ eventId, units, layers, onTracking }: TakRolePositionsProps) {
  const tak = useTakEvent(eventId);
  const teams = useMemo<TakTeam[]>(() => units.filter((u) => u.id).map((u) => ({ id: u.id!, name: u.name, kind: u.kind })), [units]);
  const last = useRef('');
  useEffect(() => {
    const now = Date.now();
    const alignments: Record<string, MapAlignment> = {};
    for (const l of layers) {
      const a = alignmentFor(l, tak.alignments, tak.venueAlignments);
      if (a) alignments[l.id] = a;
    }
    const tracking: UnitTracking = { positions: {}, alignments };
    if (tak.config?.enabled && !tak.config.closed) {
      for (const { team, position } of teamPositions(tak.live, tak.links, teams)) {
        tracking.positions[team.name] = { lat: position.lat, lon: position.lon, stale: isStale(position, now) };
      }
    }
    const key = JSON.stringify(tracking);
    if (key === last.current) return;
    last.current = key;
    onTracking(tracking);
  }, [tak, teams, layers, onTracking]);
  return null;
}
