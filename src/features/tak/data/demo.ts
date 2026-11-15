'use client';

import { createContext, useContext } from 'react';
import type { TakEventState } from './hub';
import type { TakBridge, TakEventConfig } from './takStore';

/**
 * Practice data for the TAK module's own components (TakEventPanel), for
 * CrowdCAD Training (core src/training). Inside a TakDemoContext provider,
 * useTakEvent returns `state` instead of subscribing to Firestore, and the
 * panel's writes (config, device links) go to these callbacks. Nothing is
 * read from or written to a server, so the real panel can be shown on a
 * practice board without a TAK server.
 */
export interface TakDemo {
  state: TakEventState;
  bridges: TakBridge[];
  saveConfig(config: TakEventConfig): void;
  linkDevice(deviceUid: string, teamId: string): void;
  unlinkDevice(deviceUid: string): void;
}

export const TakDemoContext = createContext<TakDemo | null>(null);

export function useTakDemo(): TakDemo | null {
  return useContext(TakDemoContext);
}
