'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Radio, RadioGroup, Select, SelectItem } from '@heroui/react';
import type { Layer } from '@/app/types';
import { loadAlignments, loadVenueAlignments, takMapStatus } from '../data/alignmentStore';
import { deleteEventConfig, getEventConfig, listAllowedBridges, saveEventConfig, type TakBridge, type TakEventConfig } from '../data/takStore';
import { TAK_MODULE_MARKER } from '../marker';
import type { HistoryMode, TakMapAlignment } from '../types';
import HelpTip from '@/components/geo/HelpTip';

/**
 * The event builder's single TAK choice: "Map: Standard (default) / TAK live
 * tracking". Standard events write nothing. Choosing TAK writes the event's
 * TAK config (bridge, history mode) as the owner changes it, and sets the
 * event's mapMode through onMapModeChange, which the event builder saves with
 * the rest of the event. A new event has no id until the builder finishes, so
 * with eventId null nothing is written: the config goes to
 * onPendingConfigChange instead, for the builder to save once the event exists.
 */
export interface TakMapModeChoiceProps {
  eventId: string | null;
  onPendingConfigChange?: (config: TakEventConfig | null) => void;
  uid: string;
  mapMode: 'standard' | 'tak' | undefined;
  onMapModeChange: (mode: 'standard' | 'tak') => void;
  layers: Layer[];
}

// HeroUI's primary is near-black in the dark theme; show the selection in the accent colour, as elsewhere in core.
const RADIO_CLASSES = { control: 'bg-accent', wrapper: 'group-data-[selected=true]:border-accent' };
// Same height, radius and padding as the event builder's other fields (MetadataSection).
const SELECT_CLASSES = { label: 'text-surface-light font-medium', trigger: 'rounded-large px-4' };

const HISTORY_LABELS: Record<HistoryMode, string> = {
  off: 'Off: live positions only, nothing kept',
  summary: 'Summary: 5-minute summaries and a heat map (default)',
  detailed: 'Detailed: summary, plus positions while teams are on calls',
};

export default function TakMapModeChoice({ eventId, onPendingConfigChange, uid, mapMode, onMapModeChange, layers }: TakMapModeChoiceProps) {
  const [bridges, setBridges] = useState<TakBridge[] | null>(null);
  const [bridgeUid, setBridgeUid] = useState<string | null>(null);
  const [historyMode, setHistoryMode] = useState<HistoryMode>('summary');
  const [alignments, setAlignments] = useState<Record<string, TakMapAlignment>>({});
  const [venueAlignments, setVenueAlignments] = useState<Record<string, TakMapAlignment>>({});
  const [error, setError] = useState<string | null>(null);
  const tak = mapMode === 'tak';

  useEffect(() => {
    void listAllowedBridges(uid).then(setBridges).catch(() => setBridges([]));
  }, [uid]);

  // Existing TAK settings (editing an event).
  useEffect(() => {
    if (!tak || !eventId) return;
    void getEventConfig(eventId)
      .then((c) => {
        if (c) {
          setBridgeUid(c.bridgeUid);
          setHistoryMode(c.historyMode);
        }
      })
      .catch(() => {});
    void loadAlignments(eventId).then(setAlignments).catch(() => {});
    void loadVenueAlignments(eventId).then(setVenueAlignments);
  }, [tak, eventId]);

  const persist = async (nextBridge: string | null, nextMode: HistoryMode) => {
    setError(null);
    const config: TakEventConfig = { bridgeUid: nextBridge, enabled: true, closed: false, historyMode: nextMode };
    if (!eventId) {
      onPendingConfigChange?.(config);
      return;
    }
    try {
      await saveEventConfig(eventId, config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save TAK settings.');
    }
  };

  const chooseMode = async (mode: 'standard' | 'tak') => {
    onMapModeChange(mode);
    if (mode === 'standard') {
      if (!eventId) onPendingConfigChange?.(null);
      else await deleteEventConfig(eventId).catch(() => {});
      return;
    }
    // Preselect when exactly one bridge is available.
    const only = bridges && bridges.length === 1 ? bridges[0]! : null;
    const nextBridge = bridgeUid ?? only?.bridgeUid ?? null;
    const nextMode = only?.defaultHistoryMode ?? historyMode;
    setBridgeUid(nextBridge);
    setHistoryMode(nextMode);
    await persist(nextBridge, nextMode);
  };

  const noBridges = bridges !== null && bridges.length === 0;
  const mapStatuses = layers.flatMap((l) => {
    const status = takMapStatus(l, alignments, venueAlignments);
    return status ? [{ layer: l, status }] : [];
  });

  return (
    <div className="space-y-2" data-tak-module={TAK_MODULE_MARKER}>
      <RadioGroup
        label="Map"
        orientation="horizontal"
        value={tak ? 'tak' : 'standard'}
        onValueChange={(v) => void chooseMode(v as 'standard' | 'tak')}
      >
        <Radio value="standard" classNames={RADIO_CLASSES}>
          Standard
        </Radio>
        <Radio value="tak" isDisabled={noBridges && !tak} classNames={RADIO_CLASSES}>
          TAK live tracking
        </Radio>
      </RadioGroup>
      {noBridges && !tak && (
        <p className="text-xs text-surface-faint">
          TAK live tracking needs a TAK server. Set one up in{' '}
          <Link href="/profile" className="text-accent underline">
            Settings (Admin, TAK)
          </Link>
          , or ask an admin to give you access to one.
        </p>
      )}

      {tak && (
        <div className="space-y-2 rounded-lg border border-surface-liner p-3">
          <Select
            size="lg"
            classNames={SELECT_CLASSES}
            label="TAK server"
            selectedKeys={bridgeUid ? [bridgeUid] : []}
            onSelectionChange={(keys) => {
              const next = (Array.from(keys)[0] as string | undefined) ?? null;
              setBridgeUid(next);
              void persist(next, historyMode);
            }}
          >
            {(bridges ?? []).map((b) => (
              <SelectItem key={b.bridgeUid}>{b.label}</SelectItem>
            ))}
          </Select>
          <Select
            size="lg"
            classNames={SELECT_CLASSES}
            label="Location history"
            selectedKeys={[historyMode]}
            onSelectionChange={(keys) => {
              const next = Array.from(keys)[0] as HistoryMode | undefined;
              if (!next) return;
              setHistoryMode(next);
              void persist(bridgeUid, next);
            }}
          >
            {(Object.keys(HISTORY_LABELS) as HistoryMode[]).map((m) => (
              <SelectItem key={m}>{HISTORY_LABELS[m]}</SelectItem>
            ))}
          </Select>
          <div className="space-y-1">
            <p className="inline-flex items-center gap-1 text-xs text-surface-faint">
              Maps
              <HelpTip text="Live positions appear on a map drawn on the real map, or on a map image once it is aligned. Images are aligned in venue setup (Venues, edit the venue, Map alignment step)." />
            </p>
            {mapStatuses.length === 0 && <p className="text-xs text-surface-faint">This venue has no maps yet.</p>}
            {mapStatuses.map(({ layer, status }) => (
              <p key={layer.id} className="truncate text-sm">
                {layer.name}: <span className={status.ready ? 'text-surface-faint' : 'text-status-orange'}>{status.text}</span>
              </p>
            ))}
          </div>
          {error && <p className="text-sm text-status-red">{error}</p>}
        </div>
      )}

    </div>
  );
}
