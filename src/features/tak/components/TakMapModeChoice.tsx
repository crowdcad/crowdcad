'use client';

import React, { useEffect, useState } from 'react';
import { Button, Modal, ModalBody, ModalContent, Radio, RadioGroup, Select, SelectItem } from '@heroui/react';
import { MapPinned } from 'lucide-react';
import type { Layer } from '@/app/types';
import { loadAlignments } from '../data/alignmentStore';
import { deleteEventConfig, getEventConfig, listAllowedBridges, saveEventConfig, type TakBridge } from '../data/takStore';
import { TAK_MODULE_MARKER } from '../marker';
import type { HistoryMode, TakMapAlignment } from '../types';
import AlignMap from './AlignMap';

/**
 * The event builder's single TAK choice: "Map: Standard (default) / TAK live
 * tracking". Standard events write nothing. Choosing TAK writes the event's
 * TAK config (bridge, history mode) as the owner changes it, and sets the
 * event's mapMode through onMapModeChange, which the event builder saves with
 * the rest of the event.
 */
export interface TakMapModeChoiceProps {
  eventId: string;
  uid: string;
  mapMode: 'standard' | 'tak' | undefined;
  onMapModeChange: (mode: 'standard' | 'tak') => void;
  layers: Layer[];
}

// HeroUI's primary is near-black in the dark theme; show the selection in the accent colour, as elsewhere in core.
const RADIO_CLASSES = { control: 'bg-accent', wrapper: 'group-data-[selected=true]:border-accent' };

const HISTORY_LABELS: Record<HistoryMode, string> = {
  off: 'Off: live positions only, nothing kept',
  summary: 'Summary: 5-minute summaries and a heat map (default)',
  detailed: 'Detailed: summary, plus positions while teams are on calls',
};

export default function TakMapModeChoice({ eventId, uid, mapMode, onMapModeChange, layers }: TakMapModeChoiceProps) {
  const [bridges, setBridges] = useState<TakBridge[] | null>(null);
  const [bridgeUid, setBridgeUid] = useState<string | null>(null);
  const [historyMode, setHistoryMode] = useState<HistoryMode>('summary');
  const [alignments, setAlignments] = useState<Record<string, TakMapAlignment>>({});
  const [aligning, setAligning] = useState<Layer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tak = mapMode === 'tak';

  useEffect(() => {
    void listAllowedBridges(uid).then(setBridges).catch(() => setBridges([]));
  }, [uid]);

  // Existing TAK settings (editing an event).
  useEffect(() => {
    if (!tak) return;
    void getEventConfig(eventId)
      .then((c) => {
        if (c) {
          setBridgeUid(c.bridgeUid);
          setHistoryMode(c.historyMode);
        }
      })
      .catch(() => {});
    void loadAlignments(eventId).then(setAlignments).catch(() => {});
  }, [tak, eventId]);

  const persist = async (nextBridge: string | null, nextMode: HistoryMode) => {
    setError(null);
    try {
      await saveEventConfig(eventId, { bridgeUid: nextBridge, enabled: true, closed: false, historyMode: nextMode });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save TAK settings.');
    }
  };

  const chooseMode = async (mode: 'standard' | 'tak') => {
    onMapModeChange(mode);
    if (mode === 'standard') {
      await deleteEventConfig(eventId).catch(() => {});
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
  const mapLayers = layers.filter((l) => l.mapUrl);

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
      {noBridges && !tak && <p className="text-xs text-surface-faint">Ask your admin to set up TAK.</p>}

      {tak && (
        <div className="space-y-2 rounded-lg border border-surface-liner p-3">
          <Select
            size="sm"
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
            size="sm"
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
            <p className="text-xs text-surface-faint">
              Live positions appear on a map once it is aligned. Align now, or later from the dispatch map&apos;s TAK panel.
            </p>
            {mapLayers.length === 0 && <p className="text-xs text-surface-faint">This venue has no map images yet.</p>}
            {mapLayers.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {l.name}: <span className="text-surface-faint">{alignments[l.id]?.mapUrl === l.mapUrl ? 'aligned' : 'not aligned'}</span>
                </span>
                <Button size="sm" variant="flat" startContent={<MapPinned className="h-4 w-4" />} onPress={() => setAligning(l)}>
                  Align map now
                </Button>
              </div>
            ))}
          </div>
          {error && <p className="text-sm text-status-red">{error}</p>}
        </div>
      )}

      <Modal isOpen={!!aligning} onClose={() => setAligning(null)} size="5xl" scrollBehavior="inside">
        <ModalContent>
          <ModalBody className="py-5">
            {aligning && (
              <AlignMap
                eventId={eventId}
                layer={{ id: aligning.id, name: aligning.name, mapUrl: aligning.mapUrl! }}
                ownerUid={uid}
                initial={alignments[aligning.id]}
                onSaved={(a) => {
                  setAlignments((prev) => ({ ...prev, [aligning.id]: a }));
                  setAligning(null);
                }}
                onCancel={() => setAligning(null)}
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}
