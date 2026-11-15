'use client';

import React, { createContext, useContext } from 'react';
import type { Event } from '@/app/types';
import type { UnitTracking } from '@/lib/unitTracking';
import { indexedDbLiteStore, type LiteEventStore } from '@/lib/liteEventStore';

/**
 * LiteContext provides a simple flag to indicate whether the current route is a Lite (local-only) page.
 * Lite pages must NOT import or use Firebase, Auth, Firestore, or any cloud services.
 * This context allows any Lite page to identify itself and helps prevent accidental cloud coupling.
 *
 * Training (src/training) mounts the same Lite dispatch page with three extras:
 * an in-memory `store`, a `writeGate` that can turn a write away while a guided
 * step is locked, and a scripted `tracking` feed standing in for TAK.
 */
export interface LiteTrackingFeed {
  /** Calls `onTracking` with each new set of positions; returns an unsubscribe. */
  subscribe(onTracking: (tracking: UnitTracking | null) => void): () => void;
  /** Shown over the map while the feed runs (e.g. a "Simulated TAK feed" badge). */
  chrome?: React.ReactNode;
}

/** Returns false to drop a write (the page keeps the event as it was). */
export type LiteWriteGate = (current: Event, next: Event) => boolean;

interface LiteContextValue {
  isLiteMode: boolean;
  /** Where the Lite event lives. IndexedDB unless a training session supplies its own. */
  store: LiteEventStore;
  writeGate?: LiteWriteGate;
  tracking?: LiteTrackingFeed;
  /** True inside a training session; hides Lite-only actions that would leave the sandbox. */
  isTraining: boolean;
}

const LiteContext = createContext<LiteContextValue | undefined>(undefined);

export function LiteProvider({
  children,
  isLiteMode = false,
  store = indexedDbLiteStore,
  writeGate,
  tracking,
  isTraining = false,
}: {
  children: React.ReactNode;
  isLiteMode?: boolean;
  store?: LiteEventStore;
  writeGate?: LiteWriteGate;
  tracking?: LiteTrackingFeed;
  isTraining?: boolean;
}) {
  const value = React.useMemo(
    () => ({ isLiteMode, store, writeGate, tracking, isTraining }),
    [isLiteMode, store, writeGate, tracking, isTraining]
  );
  return <LiteContext.Provider value={value}>{children}</LiteContext.Provider>;
}

/**
 * Hook to check if the current page is running in Lite mode.
 * Returns { isLiteMode: boolean } plus the store and the training extras.
 * Use this to conditionally render Lite-only UI or warn about cloud features not available in Lite.
 */
export function useLiteMode(): LiteContextValue {
  const context = useContext(LiteContext);
  if (!context) {
    // If context is not provided, assume cloud mode (default)
    return { isLiteMode: false, store: indexedDbLiteStore, isTraining: false };
  }
  return context;
}
