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
import { loadAlignments } from './alignmentStore';
import type { HeatCell } from '../lib/historyStats';
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
  loaded: boolean;
  error: string | null;
}

const EMPTY: TakEventState = { config: null, links: [], live: [], status: null, alignments: {}, loaded: false, error: null };

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
  entry.stop = () => {
    alive = false;
    for (const u of unsubs) u();
  };
  return entry;
}

/** View state shared by the TAK panel (map chrome) and the map markers. */
export interface TakViewState {
  heatmap: HeatCell[] | null;
}

const views = new Map<string, { state: TakViewState; listeners: Set<(s: TakViewState) => void> }>();

function viewEntry(eventId: string) {
  let v = views.get(eventId);
  if (!v) {
    v = { state: { heatmap: null }, listeners: new Set() };
    views.set(eventId, v);
  }
  return v;
}

export function setTakView(eventId: string, patch: Partial<TakViewState>): void {
  const v = viewEntry(eventId);
  v.state = { ...v.state, ...patch };
  for (const l of v.listeners) l(v.state);
}

export function useTakView(eventId: string | undefined): TakViewState {
  const [state, setState] = useState<TakViewState>(() => (eventId ? viewEntry(eventId).state : { heatmap: null }));
  useEffect(() => {
    if (!eventId) return;
    const v = viewEntry(eventId);
    v.listeners.add(setState);
    setState(v.state);
    return () => {
      v.listeners.delete(setState);
    };
  }, [eventId]);
  return state;
}

/** Re-reads map alignments after an "Align map" save. */
export function refreshAlignments(eventId: string): void {
  const entry = entries.get(eventId);
  if (!entry) return;
  void loadAlignments(eventId).then((alignments) => {
    entry.state = { ...entry.state, alignments };
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
