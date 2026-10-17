'use client';

import { useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import type { Event, MciColor, MciTreatmentArea, MciZone } from '@/app/types';
import {
  addMciArea,
  addMciZone,
  clearZonePatch,
  declareMci,
  movePatch,
  reopenZonePatch,
  setTaggedTotalPatch,
  standDownMci,
  tagPatch,
  undoPatch,
  type MciCounts,
  type MciWrite,
  type MciWriteContext,
} from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';

type UpdateEvent = (updates: Partial<Event> | ((current: Event) => Partial<Event>)) => Promise<void>;

export interface MciActions {
  declare: (input: { zones: MciZone[]; areas: MciTreatmentArea[] }) => Promise<void>;
  standDown: () => Promise<void>;
  addZone: (name: string) => Promise<boolean>;
  addArea: (name: string) => Promise<boolean>;
  tag: (zoneId: string, color: MciColor, delta: number) => Promise<void>;
  setTagged: (zoneId: string, color: MciColor, total: number) => Promise<void>;
  move: (zoneId: string, areaId: string, counts: Partial<MciCounts>) => Promise<boolean>;
  clearZone: (zoneId: string) => Promise<void>;
  reopenZone: (zoneId: string) => Promise<void>;
  undo: (entryId: string) => Promise<void>;
}

/**
 * The dispatch page's MCI writes. Each one builds its patch from the event the
 * transaction read (the functional form of `updateEvent`), never from React
 * state, so two dispatchers writing at once both count. A write that had to
 * be reduced, or was refused, tells the dispatcher with a toast.
 */
export function useMciActions(updateEvent: UpdateEvent, uid: string | undefined): MciActions {
  const { t } = useDispatchTerms();

  const run = useCallback(
    async (build: (current: Event, ctx: MciWriteContext) => MciWrite): Promise<MciWrite | null> => {
      let result = null as MciWrite | null;
      await updateEvent((current) => {
        result = build(current, { now: Date.now(), by: uid });
        return result.patch;
      });
      const outcome = result as MciWrite | null;
      if (outcome?.clamped) toast.info(t('Reduced to the patients still in the zone.'));
      if (outcome?.error === 'duplicate') toast.error(t('A zone or treatment location with that name already exists.'));
      if (outcome?.error === 'cannot-undo') toast.error(t('That entry can no longer be undone.'));
      return outcome;
    },
    [updateEvent, uid, t]
  );

  return useMemo<MciActions>(
    () => ({
      declare: async (input) => {
        await updateEvent((current) => declareMci(current, input, Date.now()));
      },
      standDown: async () => {
        await updateEvent((current) => (current.mci?.active ? standDownMci(current, Date.now()) : {}));
      },
      addZone: async (name) => {
        const out = await run((current, ctx) => addMciZone(current, { name }, ctx));
        return !!out && !out.error;
      },
      addArea: async (name) => {
        const out = await run((current, ctx) => addMciArea(current, { name }, ctx));
        return !!out && !out.error;
      },
      tag: async (zoneId, color, delta) => {
        await run((current, ctx) => tagPatch(current, zoneId, color, delta, ctx));
      },
      setTagged: async (zoneId, color, total) => {
        await run((current, ctx) => setTaggedTotalPatch(current, zoneId, color, total, ctx));
      },
      move: async (zoneId, areaId, counts) => {
        const out = await run((current, ctx) => movePatch(current, zoneId, areaId, counts, ctx));
        return !!out && !out.error;
      },
      clearZone: async (zoneId) => {
        await run((current, ctx) => clearZonePatch(current, zoneId, ctx));
      },
      reopenZone: async (zoneId) => {
        await run((current, ctx) => reopenZonePatch(current, zoneId, ctx));
      },
      undo: async (entryId) => {
        await run((current, ctx) => undoPatch(current, entryId, ctx));
      },
    }),
    [run, updateEvent]
  );
}
