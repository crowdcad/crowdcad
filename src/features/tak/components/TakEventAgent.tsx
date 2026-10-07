'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Event } from '@/app/types';
import { useTakEvent } from '../data/hub';
import { linkDevice, listMappings, saveCallState, type TakDeviceMapping } from '../data/takStore';
import { proposeAutoLinks, teamIdsOnCall } from '../lib/linking';
import { ensureTeamIds, takTeams } from '../lib/teamIds';

/**
 * Background work for an open TAK event's dispatch page, with no UI. It runs
 * whichever tab is showing:
 * - gives teams created before team ids existed an id (TAK events only);
 * - auto-links devices (remembered mapping first, then a unique callsign);
 * - in Detailed history mode, publishes which teams are on a call, as opaque
 *   team ids only, so the bridge can keep extra points during calls without
 *   reading the event.
 */
export interface TakEventAgentProps {
  eventId: string;
  event: Event;
  uid: string;
}

export default function TakEventAgent({ eventId, event, uid }: TakEventAgentProps) {
  const tak = useTakEvent(eventId);
  const [mappings, setMappings] = useState<TakDeviceMapping[]>([]);
  const attempted = useRef(new Set<string>());
  const published = useRef<string | null>(null);

  const teams = useMemo(() => takTeams(event.staff, event.supervisor), [event.staff, event.supervisor]);
  const config = tak.config;
  const active = !!config?.bridgeUid && !!config.enabled && !config.closed && !event.ended;

  const needsIds = (event.staff ?? []).some((s) => !s.id) || (event.supervisor ?? []).some((s) => !s.id);
  useEffect(() => {
    if (needsIds && !event.ended) void ensureTeamIds(eventId).catch(() => {});
  }, [needsIds, eventId, event.ended]);

  const bridgeUid = config?.bridgeUid ?? null;
  useEffect(() => {
    if (!bridgeUid) return setMappings([]);
    // Readable by the bridge's allowed users and admins; others simply get none.
    void listMappings(bridgeUid).then(setMappings).catch(() => setMappings([]));
  }, [bridgeUid]);

  useEffect(() => {
    if (!active) return;
    for (const p of proposeAutoLinks(tak.live, tak.links, teams, mappings)) {
      const key = `${p.deviceUid}->${p.teamId}`;
      if (attempted.current.has(key)) continue;
      attempted.current.add(key);
      void linkDevice(eventId, p.deviceUid, p.teamId, 'auto', uid).catch(() => {});
    }
  }, [active, tak.live, tak.links, teams, mappings, eventId, uid]);

  const onCall = useMemo(() => teamIdsOnCall(event.calls, teams), [event.calls, teams]);
  useEffect(() => {
    if (!active || config?.historyMode !== 'detailed') return;
    const key = onCall.join(',');
    if (published.current === key) return;
    published.current = key;
    void saveCallState(eventId, onCall).catch(() => {
      published.current = null;
    });
  }, [active, config?.historyMode, onCall, eventId]);

  return null;
}
