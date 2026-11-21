'use client';
/**
 * Extension packs' contributions to the dispatch page, combined into one
 * value and shared with every component on the page through context, so a
 * team card (or any other part) can ask for them without prop drilling.
 */
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
import type { Event, Staff } from '@/app/types';
import type { MapOverlay } from '@/components/modals/event/venuemapmodal';
import type { DispatchContribution, LogRow, PanelTab, StatusDetail } from './types';

export interface DispatchExtras {
  tabs: PanelTab[];
  strip: ReactNode | null;
  toolbar: ReactNode[];
  mounted: ReactNode[];
  mapOverlay: MapOverlay | undefined;
  background: ReactNode[];
  logRows: LogRow[];
  statusOptions: (unit: Staff) => string[] | null;
  statusDetail: (status: string) => StatusDetail | null;
  /** Every pack's fields and log lines for a status change, combined. */
  statusPatch: (event: Event, unit: Staff, status: string, detail?: string) => { patch: Partial<Staff>; logMessages: string[] };
  UnitChips: ComponentType<{ unit: Staff; event: Event; compact?: boolean }>[];
  locations: string[];
}

const first = <T,>(values: (T | null | undefined)[]): T | null => values.find((v) => v !== null && v !== undefined) ?? null;

export function mergeDispatch(parts: DispatchContribution[]): DispatchExtras {
  return {
    tabs: parts.flatMap((p) => p.tabs ?? []),
    strip: first(parts.map((p) => p.strip)),
    toolbar: parts.flatMap((p) => (p.toolbar ? [p.toolbar] : [])),
    mounted: parts.flatMap((p) => (p.mounted ? [p.mounted] : [])),
    mapOverlay: first(parts.map((p) => p.mapOverlay)) ?? undefined,
    background: parts.flatMap((p) => (p.background ? [p.background] : [])),
    logRows: parts.flatMap((p) => p.logRows ?? []),
    statusOptions: (unit) => first(parts.map((p) => p.statusOptions?.(unit))),
    statusDetail: (status) => first(parts.map((p) => p.statusDetail?.(status))),
    statusPatch: (event, unit, status, detail) => {
      const results = parts.flatMap((p) => {
        const r = p.statusPatch?.(event, unit, status, detail);
        return r ? [r] : [];
      });
      return {
        patch: Object.assign({}, ...results.map((r) => r.patch)),
        logMessages: results.flatMap((r) => (r.logMessage ? [r.logMessage] : [])),
      };
    },
    UnitChips: parts.flatMap((p) => (p.UnitChip ? [p.UnitChip] : [])),
    locations: parts.flatMap((p) => p.locations ?? []),
  };
}

export const NO_DISPATCH_EXTRAS: DispatchExtras = mergeDispatch([]);

const DispatchExtrasContext = createContext<DispatchExtras>(NO_DISPATCH_EXTRAS);
export const DispatchExtrasProvider = DispatchExtrasContext.Provider;
export const useDispatchExtras = () => useContext(DispatchExtrasContext);
