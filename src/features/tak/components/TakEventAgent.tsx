'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Event } from '@/app/types';
import { useTakEvent } from '../data/hub';
import { linkDevice, listMappings, saveCallState, type TakDeviceMapping } from '../data/takStore';
import { isStale, proposeAutoLinks, teamIdsOnCall, teamPositions } from '../lib/linking';
import { ensureTeamIds, takTeams } from '../lib/teamIds';
import { alignmentFor } from '../data/alignmentStore';
import { eligibleForAutoLocation, saveAutoLocations, type AutoLocationChange } from '../data/autoLocationStore';
import { EMPTY_TRACK, postPoints, step, type TrackState } from '../lib/autoLocation';
import { getEventVenueLayers } from '@/lib/zones';
import { resolvePostName } from '@/lib/locationLabel';

/**
 * Background work for an open TAK event's dispatch page, with no UI. It runs
 * whichever tab is showing:
 * - gives teams created before team ids existed an id (TAK events only);
 * - auto-links devices (remembered mapping first, then a unique callsign);
 * - fills available teams' Location from their position: the nearest post,
 *   in words when not at it, steadied by hysteresis (D65);
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

  // Live location labels (D65). Every open dispatch page computes the same
  // labels from the same positions; the write is a no-op once one has landed.
  const tracks = useRef(new Map<string, TrackState>());
  const wasEligible = useRef(new Map<string, boolean>());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, [active]);
  const posts = useMemo(
    () => postPoints(getEventVenueLayers(event), (l) => alignmentFor(l, tak.alignments, tak.venueAlignments)),
    [event, tak.alignments, tak.venueAlignments],
  );
  useEffect(() => {
    if (!active || !posts.length) return;
    const now = Date.now();
    const byTeam = new Map(teamPositions(tak.live, tak.links, teams).map((tp) => [tp.team.id, tp.position]));
    const isPost = (name: string) => posts.some((p) => p.name === name);
    const changes: AutoLocationChange[] = [];
    for (const unit of [...(event.staff ?? []), ...(event.supervisor ?? [])]) {
      if (!unit.id) continue;
      const fix = byTeam.get(unit.id);
      const prev = tracks.current.get(unit.id) ?? EMPTY_TRACK;
      const next = step(prev, fix && !isStale(fix, now) ? { lat: fix.lat, lon: fix.lon } : null, posts, now);
      tracks.current.set(unit.id, next);
      const label = next.current?.label;
      const eligible = eligibleForAutoLocation(unit);
      const becameEligible = eligible && wasEligible.current.get(unit.id) === false;
      wasEligible.current.set(unit.id, eligible);
      // Write only when the label changes (or the team is back from a call), so a dispatcher's own edit
      // stays until the team moves.
      if (!label || !eligible || unit.location === label || (label === prev.current?.label && !becameEligible)) continue;
      changes.push({ teamId: unit.id, from: unit.location || '', label, newPost: resolvePostName(unit.location, isPost) !== next.current!.post });
    }
    if (changes.length) void saveAutoLocations(eventId, changes).catch(() => {});
    // tick lets a pending label take effect after its dwell without a new position.
  }, [active, posts, tak.live, tak.links, teams, event.staff, event.supervisor, eventId, tick]);

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
