'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Modal, ModalBody, ModalContent, Select, SelectItem, Switch } from '@heroui/react';
import { ChevronDown, ChevronUp, Link2Off, MapPinned, Radio } from 'lucide-react';
import type { Event, Layer } from '@/app/types';
import { refreshAlignments, useTakEvent } from '../data/hub';
import { alignmentMatches } from '../data/alignmentStore';
import {
  clearLive,
  linkDevice,
  listAllowedBridges,
  rememberMapping,
  saveEventConfig,
  unlinkDevice,
  type TakBridge,
  type TakEventConfig,
} from '../data/takStore';
import { isStale, unassignedDevices } from '../lib/linking';
import { takTeams } from '../lib/teamIds';
import { TAK_MODULE_MARKER } from '../marker';
import type { HistoryMode } from '../types';
import AlignMap from './AlignMap';

export interface TakEventPanelProps {
  eventId: string;
  event: Event;
  uid: string;
  /** The event owner manages the TAK config, bridge link and map alignment. */
  isOwner: boolean;
  layers: Layer[];
}

const HISTORY_LABELS: Record<HistoryMode, string> = {
  off: 'Off (live only)',
  summary: 'Summary (default)',
  detailed: 'Detailed (adds positions during calls)',
};

function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

export default function TakEventPanel({ eventId, event, uid, isOwner, layers }: TakEventPanelProps) {
  const tak = useTakEvent(eventId);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [bridges, setBridges] = useState<TakBridge[]>([]);
  const [aligning, setAligning] = useState<Layer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  const teams = useMemo(() => takTeams(event.staff, event.supervisor), [event.staff, event.supervisor]);
  const config = tak.config;
  const bridgeUid = config?.bridgeUid ?? null;

  useEffect(() => {
    if (isOwner) void listAllowedBridges(uid).then(setBridges).catch(() => setBridges([]));
  }, [isOwner, uid]);

  const updateConfig = async (patch: Partial<TakEventConfig>) => {
    setError(null);
    const next: TakEventConfig = {
      bridgeUid: config?.bridgeUid ?? null,
      enabled: config?.enabled ?? true,
      closed: config?.closed ?? false,
      historyMode: config?.historyMode ?? 'summary',
      ...patch,
    };
    try {
      if (patch.bridgeUid === null && config?.bridgeUid) await clearLive(eventId);
      await saveEventConfig(eventId, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save TAK settings.');
    }
  };

  const manualLink = async (deviceUid: string, teamId: string, callsign?: string) => {
    setError(null);
    try {
      await linkDevice(eventId, deviceUid, teamId, 'manual', uid);
      const team = teams.find((t) => t.id === teamId);
      // Remembering is best effort: only the bridge's allowed users and admins may.
      if (bridgeUid && team) await rememberMapping(bridgeUid, { deviceUid, teamName: team.name, callsign }, uid).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link the device.');
    }
  };

  const linked = !!bridgeUid && !!config?.enabled && !config.closed;
  const fresh = tak.status ? now - tak.status.lastSeenAt < 3 * 60_000 : false;
  const connected = linked && fresh && !!tak.status?.takConnected;
  const recording = linked && config!.historyMode !== 'off';
  const unassigned = unassignedDevices(tak.live, tak.links);
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? 'Unknown team';

  const dotClass = !linked ? 'bg-surface-faint' : connected ? 'bg-status-green' : 'bg-status-red';

  return (
    <div className="absolute bottom-3 left-3 z-30 max-w-[min(92vw,380px)] text-surface-light" data-tak-module={TAK_MODULE_MARKER}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-surface-liner bg-surface-deepest/95 px-3 py-1.5 text-xs shadow"
        aria-expanded={open}
      >
        <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
        <span className="font-semibold">TAK</span>
        <span className="text-surface-faint">
          {!bridgeUid ? 'not linked' : !config?.enabled ? 'paused' : connected ? `${tak.live.length} device${tak.live.length === 1 ? '' : 's'}` : 'no signal'}
        </span>
        {recording && (
          <span className="flex items-center gap-1 rounded-full bg-status-red/20 px-1.5 text-status-red" title="Location history is being recorded">
            <Radio className="h-3 w-3" /> Recording
          </span>
        )}
        {unassigned.length > 0 && <span className="rounded-full bg-status-yellow/20 px-1.5 text-status-yellow">{unassigned.length} unassigned</span>}
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="mt-2 max-h-[60vh] space-y-3 overflow-auto rounded-lg border border-surface-liner bg-surface-deepest/95 p-3 text-sm shadow-lg">
          <section>
            <p>
              {!bridgeUid
                ? 'No TAK server is linked to this event.'
                : tak.status
                  ? `Bridge ${connected ? 'connected' : 'not reporting'}, last seen ${ago(tak.status.lastSeenAt, now)}.`
                  : 'Waiting for the bridge to report.'}
            </p>
            {recording && (
              <p className="text-surface-faint">
                Recording location history: {HISTORY_LABELS[config!.historyMode]}. Only the event owner can view it.
              </p>
            )}
          </section>

          {isOwner && (
            <section className="space-y-2">
              <Select
                size="sm"
                label="TAK server"
                selectedKeys={bridgeUid ? [bridgeUid] : []}
                onSelectionChange={(keys) => {
                  const next = Array.from(keys)[0] as string | undefined;
                  void updateConfig({ bridgeUid: next ?? null });
                }}
                placeholder={bridges.length ? 'Choose a TAK server' : 'Ask your admin to set up TAK'}
                isDisabled={bridges.length === 0 || event.ended}
              >
                {bridges.map((b) => (
                  <SelectItem key={b.bridgeUid}>{b.label}</SelectItem>
                ))}
              </Select>
              <Select
                size="sm"
                label="Location history"
                selectedKeys={[config?.historyMode ?? 'summary']}
                onSelectionChange={(keys) => {
                  const next = Array.from(keys)[0] as HistoryMode | undefined;
                  if (next) void updateConfig({ historyMode: next });
                }}
                isDisabled={event.ended}
              >
                {(Object.keys(HISTORY_LABELS) as HistoryMode[]).map((m) => (
                  <SelectItem key={m}>{HISTORY_LABELS[m]}</SelectItem>
                ))}
              </Select>
              <div className="flex items-center justify-between">
                <Switch size="sm" isSelected={config?.enabled ?? false} isDisabled={!bridgeUid || event.ended} onValueChange={(v) => void updateConfig({ enabled: v })}>
                  Live tracking on
                </Switch>
                {bridgeUid && !event.ended && (
                  <Button size="sm" variant="light" startContent={<Link2Off className="h-4 w-4" />} onPress={() => void updateConfig({ bridgeUid: null })}>
                    Unlink
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-surface-faint">Maps</p>
                {layers.filter((l) => l.mapUrl).map((l) => {
                  const a = tak.alignments[l.id];
                  const ok = alignmentMatches(a, l.mapUrl);
                  return (
                    <div key={l.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {l.name}:{' '}
                        <span className="text-surface-faint">
                          {ok ? (a!.residualM === null ? 'aligned' : `aligned, about ${a!.residualM.toFixed(1)} m`) : a ? 'image changed, align again' : 'not aligned'}
                        </span>
                      </span>
                      <Button size="sm" variant="flat" startContent={<MapPinned className="h-4 w-4" />} onPress={() => setAligning(l)}>
                        Align
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {linked && (
            <section className="space-y-1">
              <p className="text-xs text-surface-faint">Unassigned TAK devices</p>
              {unassigned.length === 0 && <p className="text-surface-faint">None.</p>}
              {unassigned.map((p) => (
                <div key={p.deviceUid} className="flex items-center gap-2">
                  <span className={`min-w-0 flex-1 truncate ${isStale(p, now) ? 'opacity-50' : ''}`}>
                    {p.callsign || p.deviceUid} <span className="text-surface-faint">({ago(p.receivedAt, now)})</span>
                  </span>
                  <Select
                    size="sm"
                    aria-label={`Team for ${p.callsign || p.deviceUid}`}
                    placeholder="Assign to team"
                    className="w-40"
                    onSelectionChange={(keys) => {
                      const teamId = Array.from(keys)[0] as string | undefined;
                      if (teamId) void manualLink(p.deviceUid, teamId, p.callsign);
                    }}
                  >
                    {teams.map((t) => (
                      <SelectItem key={t.id}>{t.name}</SelectItem>
                    ))}
                  </Select>
                </div>
              ))}
              {tak.links.length > 0 && (
                <>
                  <p className="pt-1 text-xs text-surface-faint">Linked devices</p>
                  {tak.links.map((l) => {
                    const p = tak.live.find((x) => x.deviceUid === l.deviceUid);
                    return (
                      <div key={l.deviceUid} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {p?.callsign || l.deviceUid} → {teamName(l.teamId)}{' '}
                          <span className="text-surface-faint">({l.method})</span>
                        </span>
                        <Button isIconOnly size="sm" variant="light" aria-label="Unlink device" onPress={() => void unlinkDevice(eventId, l.deviceUid)}>
                          <Link2Off className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </>
              )}
            </section>
          )}

          {(error || tak.error) && <p className="text-status-red">{error || tak.error}</p>}
        </div>
      )}

      <Modal isOpen={!!aligning} onClose={() => setAligning(null)} size="4xl" scrollBehavior="inside">
        <ModalContent>
          <ModalBody className="py-5">
            {aligning && (
              <AlignMap
                eventId={eventId}
                layer={{ id: aligning.id, name: aligning.name, mapUrl: aligning.mapUrl! }}
                ownerUid={uid}
                initial={tak.alignments[aligning.id]}
                onSaved={() => {
                  refreshAlignments(eventId);
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
