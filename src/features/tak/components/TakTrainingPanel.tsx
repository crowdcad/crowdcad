'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Event, Layer } from '@/app/types';
import type { UnitTracking } from '@/lib/unitTracking';
import { TakDemoContext, type TakDemo } from '../data/demo';
import type { TakEventState } from '../data/hub';
import type { TakBridge, TakDeviceLink, TakEventConfig, TakLivePosition } from '../data/takStore';
import { takTeams } from '../lib/teamIds';
import TakEventPanel from './TakEventPanel';

/**
 * The real TAK map panel on a training board (core src/training), fed with
 * practice data instead of a TAK server: a linked practice server, one device
 * per unit (auto-linked by callsign, positioned by training's scripted feed)
 * and one device whose callsign matches no team, for practising a manual
 * link. Changes made in the panel live in this component's state only.
 */
export interface TakTrainingPanelProps {
  event: Event;
  layers: Layer[];
  tracking: UnitTracking | null;
}

const PRACTICE_BRIDGE: TakBridge = {
  bridgeUid: 'practice-bridge',
  label: 'Practice TAK server',
  allowedUsers: [],
  defaultHistoryMode: 'summary',
  createdBy: 'training',
  recordId: 'practice-bridge',
};

/** The practice device with no matching team (callsign MEDIC-7). */
export const PRACTICE_UNMATCHED_DEVICE = 'practice-medic-7';

export default function TakTrainingPanel({ event, layers, tracking }: TakTrainingPanelProps) {
  const [config, setConfig] = useState<TakEventConfig>({ bridgeUid: PRACTICE_BRIDGE.bridgeUid, enabled: true, closed: false, historyMode: 'summary' });
  const [manual, setManual] = useState<Record<string, string>>({});
  const [unlinked, setUnlinked] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const teams = useMemo(() => takTeams(event.staff, event.supervisor), [event.staff, event.supervisor]);

  const state = useMemo<TakEventState>(() => {
    const live: TakLivePosition[] = [];
    const links: TakDeviceLink[] = [];
    let anchor: { lat: number; lon: number } | null = null;
    for (const team of teams) {
      const p = tracking?.positions[team.name];
      if (!p) continue;
      anchor ??= { lat: p.lat, lon: p.lon };
      const deviceUid = `practice-${team.id}`;
      live.push({ deviceUid, lat: p.lat, lon: p.lon, callsign: team.name, deviceTime: now, receivedAt: p.stale ? now - 10 * 60_000 : now });
      if (!unlinked.has(deviceUid) && !manual[deviceUid]) links.push({ deviceUid, teamId: team.id, linkedAt: now, method: 'auto', linkedBy: 'training' });
    }
    if (anchor) {
      live.push({ deviceUid: PRACTICE_UNMATCHED_DEVICE, lat: anchor.lat + 0.0004, lon: anchor.lon, callsign: 'MEDIC-7', deviceTime: now, receivedAt: now });
    }
    for (const [deviceUid, teamId] of Object.entries(manual)) {
      if (!unlinked.has(deviceUid)) links.push({ deviceUid, teamId, linkedAt: now, method: 'manual', linkedBy: 'training' });
    }
    return {
      config,
      links,
      live,
      status: { lastSeenAt: now, takConnected: true, liveDeviceCount: live.length },
      alignments: {},
      venueAlignments: {},
      loaded: true,
      error: null,
    };
  }, [teams, tracking, config, manual, unlinked, now]);

  const demo = useMemo<TakDemo>(
    () => ({
      state,
      bridges: [PRACTICE_BRIDGE],
      saveConfig: setConfig,
      linkDevice: (deviceUid, teamId) => {
        setManual((m) => ({ ...m, [deviceUid]: teamId }));
        setUnlinked((s) => {
          const next = new Set(s);
          next.delete(deviceUid);
          return next;
        });
      },
      unlinkDevice: (deviceUid) => setUnlinked((s) => new Set(s).add(deviceUid)),
    }),
    [state]
  );

  return (
    <TakDemoContext.Provider value={demo}>
      <TakEventPanel eventId={event.id} event={event} uid="training" isOwner layers={layers} />
    </TakDemoContext.Provider>
  );
}
