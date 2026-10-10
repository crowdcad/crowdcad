'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Event } from '@/app/types';
import type { MapAlignment } from '@/lib/geo/types';
import type { UnitTracking } from '@/lib/unitTracking';
import { useTakEvent } from '../data/hub';
import { linkDevice, listMappings, saveCallState, type TakDeviceMapping } from '../data/takStore';
import { isStale, proposeAutoLinks, teamIdsOnCall, teamPositions } from '../lib/linking';
import { ensureTeamIds, takTeams } from '../lib/teamIds';
import { alignmentFor } from '../data/alignmentStore';
import { saveAutoLocations, type AutoLocationChange } from '../data/autoLocationStore';
import { EMPTY_TRACK, postPoints, step, type TrackState } from '../lib/autoLocation';
import { getEventVenueLayers } from '@/lib/zones';

/**
 * Background work for an open TAK event's dispatch page, with no UI. It runs
 * whichever tab is showing:
 * - gives teams created before team ids existed an id (TAK events only);
 * - auto-links devices (remembered mapping first, then a unique callsign);
 * - fills every connected unit's Location from its position, whatever its
 *   status: the nearest post, in words when not at it, steadied by
 *   hysteresis (D65, D66);
 * - reports live positions to the dispatch page (`onTracking`), which draws
 *   team markers there and locks connected units' Location (D66);
 * - in Detailed history mode, publishes which teams are on a call, as opaque
 *   team ids only, so the bridge can keep extra points during calls without
 *   reading the event.
 */
export interface TakEventAgentProps {
  eventId: string;
  event: Event;
  uid: string;
  /** Live positions by unit name, and the alignment for each layer. */
  onTracking?: (tracking: UnitTracking) => void;
}

export default function TakEventAgent({ eventId, event, uid, onTracking }: TakEventAgentProps) {
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

  // Live location labels (D65, D66). Every open dispatch page computes the
  // same labels from the same positions; the write is a no-op once one has landed.
  const tracks = useRef(new Map<string, TrackState>());
  const inFlight = useRef(new Set<string>());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, [active]);
  const layers = useMemo(() => getEventVenueLayers(event), [event]);
  const alignments = useMemo(() => {
    const out: Record<string, MapAlignment> = {};
    for (const l of layers) {
      const a = alignmentFor(l, tak.alignments, tak.venueAlignments);
      if (a) out[l.id] = a;
    }
    return out;
  }, [layers, tak.alignments, tak.venueAlignments]);
  const posts = useMemo(() => postPoints(layers, (l) => alignments[l.id]), [layers, alignments]);
  const positions = useMemo(() => teamPositions(tak.live, tak.links, teams), [tak.live, tak.links, teams]);

  useEffect(() => {
    if (!active || !posts.length) return;
    const now = Date.now();
    const byTeam = new Map(positions.map((tp) => [tp.team.id, tp.position]));
    const changes: AutoLocationChange[] = [];
    for (const unit of [...(event.staff ?? []), ...(event.supervisor ?? [])]) {
      if (!unit.id) continue;
      const fix = byTeam.get(unit.id);
      const connected = !!fix && !isStale(fix, now);
      const prev = tracks.current.get(unit.id) ?? EMPTY_TRACK;
      const next = step(prev, connected ? { lat: fix!.lat, lon: fix!.lon } : null, posts, now);
      tracks.current.set(unit.id, next);
      const label = next.current?.label;
      // A connected unit's Location is kept at its label: it can't be edited meanwhile, and no other write moves it.
      if (!connected || !label || unit.location === label) continue;
      const key = `${unit.id}:${label}`;
      if (inFlight.current.has(key)) continue;
      inFlight.current.add(key);
      changes.push({ teamId: unit.id, from: unit.location || '', label });
    }
    if (changes.length) {
      void saveAutoLocations(eventId, changes)
        .catch(() => {})
        .finally(() => changes.forEach((c) => inFlight.current.delete(`${c.teamId}:${c.label}`)));
    }
    // tick lets a pending label take effect after its dwell without a new position.
  }, [active, posts, positions, event.staff, event.supervisor, eventId, tick]);

  // Live positions for the dispatch page: markers and locked Locations (D66).
  const lastReport = useRef('');
  useEffect(() => {
    if (!onTracking) return;
    const now = Date.now();
    const tracking: UnitTracking = { positions: {}, alignments };
    if (config?.enabled && !config.closed) {
      for (const { team, position } of positions) {
        tracking.positions[team.name] = { lat: position.lat, lon: position.lon, stale: isStale(position, now) };
      }
    }
    const key = JSON.stringify(tracking);
    if (key === lastReport.current) return;
    lastReport.current = key;
    onTracking(tracking);
  }, [onTracking, positions, alignments, config?.enabled, config?.closed, tick]);

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
