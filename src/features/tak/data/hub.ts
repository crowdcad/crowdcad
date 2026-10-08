'use client';

import { useEffect, useState } from 'react';
import {
  subscribeDeviceLinks,
  subscribeEventConfig,
  subscribeEventStatus,
  subscribeLive,
  type TakDeviceLink,
  type TakEventConfig,
  type TakEventStatus,
  type TakLivePosition,
} from './takStore';
import { loadAlignments, loadVenueAlignments } from './alignmentStore';
import type { TakMapAlignment } from '../types';

/**
 * One shared, reference-counted set of subscriptions per event, so the map
 * markers and the TAK panel don't each open their own (core's PocketBase
 * subscribeToQuery also unsubscribes every listener on a collection at once,
 * so duplicate subscriptions would cancel each other).
 */
export interface TakEventState {
  config: TakEventConfig | null;
  links: TakDeviceLink[];
  live: TakLivePosition[];
  status: TakEventStatus | null;
  alignments: Record<string, TakMapAlignment>;
  /** Alignments on the event's venue as it is now (empty if it can't be read). */
  venueAlignments: Record<string, TakMapAlignment>;
  loaded: boolean;
  error: string | null;
}

const EMPTY: TakEventState = { config: null, links: [], live: [], status: null, alignments: {}, venueAlignments: {}, loaded: false, error: null };

interface Entry {
  state: TakEventState;
  listeners: Set<(s: TakEventState) => void>;
  stop: () => void;
}

const entries = new Map<string, Entry>();

function open(eventId: string): Entry {
  const entry: Entry = { state: EMPTY, listeners: new Set(), stop: () => {} };
  const set = (patch: Partial<TakEventState>) => {
    entry.state = { ...entry.state, ...patch };
    for (const l of entry.listeners) l(entry.state);
  };
  const fail = (err: Error) => set({ error: err.message });
  const unsubs = [
    subscribeEventConfig(eventId, (config) => set({ config, loaded: true }), fail),
    subscribeDeviceLinks(eventId, (links) => set({ links }), fail),
    subscribeLive(eventId, (live) => set({ live }), fail),
    subscribeEventStatus(eventId, (status) => set({ status }), fail),
  ];
  let alive = true;
  void loadAlignments(eventId).then((alignments) => alive && set({ alignments }), fail);
  void loadVenueAlignments(eventId).then((venueAlignments) => alive && set({ venueAlignments }));
  entry.stop = () => {
    alive = false;
    for (const u of unsubs) u();
  };
  return entry;
}

/** Re-reads map alignments (the event's and its venue's). */
export function refreshAlignments(eventId: string): void {
  const entry = entries.get(eventId);
  if (!entry) return;
  void Promise.all([loadAlignments(eventId), loadVenueAlignments(eventId)]).then(([alignments, venueAlignments]) => {
    entry.state = { ...entry.state, alignments, venueAlignments };
    for (const l of entry.listeners) l(entry.state);
  });
}

export function useTakEvent(eventId: string | undefined): TakEventState {
  const [state, setState] = useState<TakEventState>(() => (eventId && entries.get(eventId)?.state) || EMPTY);
  useEffect(() => {
    if (!eventId) return;
    let entry = entries.get(eventId);
    if (!entry) {
      entry = open(eventId);
      entries.set(eventId, entry);
    }
    entry.listeners.add(setState);
    setState(entry.state);
    return () => {
      entry!.listeners.delete(setState);
      if (entry!.listeners.size === 0) {
        entry!.stop();
        entries.delete(eventId);
      }
    };
  }, [eventId]);
  return state;
}
