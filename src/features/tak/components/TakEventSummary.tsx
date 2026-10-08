'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Select, SelectItem, Slider } from '@heroui/react';
import { Download } from 'lucide-react';
import type { Event, Layer } from '@/app/types';
import { useAuth } from '@/hooks/useauth';
import { getEventVenueLayers } from '@/lib/zones';
import { alignmentFor, loadAlignments } from '../data/alignmentStore';
import { PREF, usePref } from '../data/prefs';
import { loadHistory } from '../data/takStore';
import { percentToLatLon } from '../lib/affine';
import { imageCorners } from '../lib/basemapFrame';
import { DEFAULT_BASEMAP_ID, validChoice } from '../lib/basemaps';
import { heatCells, teamHistoryStats, type HistorySegment, type PostLocation } from '../lib/historyStats';
import { exportFileName, heatCsv, heatGeoJson, historyCsv } from '../lib/historyExport';
import { takTeams } from '../lib/teamIds';
import { TAK_MODULE_MARKER } from '../marker';
import type { TakMapAlignment } from '../types';
import BasemapPicker from './BasemapPicker';
import BasemapView, { type BasemapViewRequest } from './BasemapView';

/**
 * Location history on the event summary page (touchpoint k, D57): the heat
 * map on a basemap with the event's aligned map, and each team's tracked
 * time, distance, coverage gaps and time on post. Only the event owner can
 * read history (see the TAK rules), so nothing renders for anyone else.
 */
export interface TakEventSummaryProps {
  eventId: string;
  event: Event;
  /** Classes for the section's outer box, so it matches the page's grid. */
  className?: string;
}

const NO_IMAGE = '__none__';
/** The bridge's heat-map grid size. */
const HEAT_CELL_M = 5;

/** Post positions from aligned layers, for "time on post". */
export function postLocations(layers: Layer[], alignments: Record<string, TakMapAlignment>): PostLocation[] {
  const out: PostLocation[] = [];
  for (const layer of layers) {
    const a = alignmentFor(layer, alignments);
    if (!a) continue;
    for (const post of layer.posts ?? []) {
      if (typeof post === 'string' || post.x === null || post.y === null) continue;
      out.push({ name: post.name, ...percentToLatLon(a, post.x, post.y) });
    }
  }
  return out;
}

/** Saves text as a file in the browser. */
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function hm(secs: number): string {
  const m = Math.round(secs / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export default function TakEventSummary({ eventId, event, className }: TakEventSummaryProps) {
  const { user } = useAuth();
  const isOwner = !!user && user.uid === event.userId;
  const [history, setHistory] = useState<HistorySegment[] | null>(null);
  const [alignments, setAlignments] = useState<Record<string, TakMapAlignment>>({});
  const [error, setError] = useState<string | null>(null);
  const [basemapId, setBasemapId] = usePref<string>(PREF.alignBasemap, DEFAULT_BASEMAP_ID);
  const [imageLayerId, setImageLayerId] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.6);

  useEffect(() => {
    if (!isOwner) return;
    let alive = true;
    Promise.all([loadHistory(eventId), loadAlignments(eventId)])
      .then(([h, a]) => {
        if (!alive) return;
        setHistory(h);
        setAlignments(a);
      })
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : 'Could not load location history.'));
    return () => {
      alive = false;
    };
  }, [eventId, isOwner]);

  const layers = useMemo(() => getEventVenueLayers(event), [event]);
  const aligned = useMemo(() => layers.filter((l) => alignmentFor(l, alignments)), [layers, alignments]);
  const teams = useMemo(() => takTeams(event.staff, event.supervisor), [event.staff, event.supervisor]);
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? 'Unknown team';
  const heat = useMemo(() => (history ? heatCells(history) : []), [history]);
  const posts = useMemo(() => postLocations(layers, alignments), [layers, alignments]);
  const stats = useMemo(() => (history ? teamHistoryStats(history, posts) : []), [history, posts]);

  const view = useMemo<BasemapViewRequest | undefined>(() => {
    const pts = heat.length ? heat : aligned.flatMap((l) => imageCorners(alignmentFor(l, alignments)!));
    if (!pts.length) return undefined;
    const lats = pts.map((p) => p.lat);
    const lons = pts.map((p) => p.lon);
    return { key: 1, bounds: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] };
  }, [heat, aligned, alignments]);

  if (!isOwner) return null;

  const imageLayer = imageLayerId === NO_IMAGE ? undefined : (aligned.find((l) => l.id === imageLayerId) ?? aligned[0]);
  const imageAlignment = alignmentFor(imageLayer, alignments);

  return (
    <section className={className} data-tak-module={TAK_MODULE_MARKER}>
      <div className="px-4 py-3">
        <span className="font-semibold">Location history (TAK)</span>
        <div className="text-sm text-surface-faint">Only you, the event owner, can see this.</div>
      </div>
      <div className="space-y-4 px-4 pb-4">
        {error && <p className="text-sm text-status-red">{error}</p>}
        {!error && !history && <p className="text-sm text-surface-faint">Loading location history…</p>}
        {history && history.length === 0 && (
          <p className="text-sm text-surface-faint">
            No location history was recorded. History is recorded while a TAK server is linked and Location history is
            not Off.
          </p>
        )}
        {history && history.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="flat"
                startContent={<Download className="h-4 w-4" />}
                onPress={() => download(exportFileName(event.name, 'tak-history.csv'), historyCsv(history, teamName), 'text/csv;charset=utf-8')}
              >
                Export history (CSV)
              </Button>
              <Button
                size="sm"
                variant="flat"
                startContent={<Download className="h-4 w-4" />}
                onPress={() => download(exportFileName(event.name, 'tak-heatmap.csv'), heatCsv(heat, HEAT_CELL_M), 'text/csv;charset=utf-8')}
              >
                Export heat map (CSV)
              </Button>
              <Button
                size="sm"
                variant="flat"
                startContent={<Download className="h-4 w-4" />}
                onPress={() =>
                  download(exportFileName(event.name, 'tak-heatmap.geojson'), heatGeoJson(heat, HEAT_CELL_M), 'application/geo+json')
                }
              >
                Export heat map (GeoJSON)
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <BasemapPicker value={validChoice(basemapId, DEFAULT_BASEMAP_ID)} onChange={setBasemapId} omit={['none']} />
              {aligned.length > 0 && (
                <Select
                  size="sm"
                  label="Event map"
                  className="w-48"
                  selectedKeys={[imageLayer?.id ?? NO_IMAGE]}
                  disallowEmptySelection
                  onSelectionChange={(keys) => {
                    const id = Array.from(keys)[0];
                    if (typeof id === 'string') setImageLayerId(id);
                  }}
                >
                  {[...aligned.map((l) => <SelectItem key={l.id}>{l.name}</SelectItem>), <SelectItem key={NO_IMAGE}>None</SelectItem>]}
                </Select>
              )}
              {imageLayer && (
                <Slider
                  size="sm"
                  label="Map opacity"
                  className="max-w-xs"
                  minValue={0.1}
                  maxValue={1}
                  step={0.05}
                  value={opacity}
                  onChange={(v) => setOpacity(Array.isArray(v) ? v[0]! : v)}
                  getValue={(v) => `${Math.round((Array.isArray(v) ? v[0]! : v) * 100)}%`}
                />
              )}
            </div>
            <BasemapView
              className="h-[60vh] min-h-[320px] rounded border border-surface-liner"
              basemapId={validChoice(basemapId, DEFAULT_BASEMAP_ID)}
              image={imageLayer && imageAlignment ? { url: imageLayer.mapUrl!, corners: imageCorners(imageAlignment), opacity } : null}
              heat={heat}
              view={view}
              cursor="grab"
              cooperativeGestures
            />
            <p className="text-xs text-surface-faint">
              Heat map: time spent in each 5 m square, darker for longer. Tracked time counts each position report for up
              to 60 seconds.
            </p>
            {posts.length === 0 && <p className="text-xs text-surface-faint">Align an event map that has posts to see time on post.</p>}
            <div className="grid gap-2 md:grid-cols-2">
              {stats.map((s) => {
                const top = s.timeOnPost.slice(0, 3);
                return (
                  <div key={s.teamId} className="rounded border border-surface-liner p-3">
                    <p className="font-medium">{teamName(s.teamId)}</p>
                    <p className="text-xs text-surface-faint">
                      Tracked {hm(s.trackedSecs)}, moved {(s.distanceM / 1000).toFixed(2)} km
                      {s.gaps.length > 0 ? `, ${s.gaps.length} coverage gap${s.gaps.length === 1 ? '' : 's'}` : ''}
                    </p>
                    {top.map((p) => (
                      <div key={p.post} className="mt-1 flex items-center gap-2 text-xs">
                        <span className="w-24 truncate">{p.post}</span>
                        <span className="h-2 rounded bg-accent" style={{ width: `${Math.max(4, (p.secs / Math.max(1, s.trackedSecs)) * 60)}%` }} />
                        <span className="text-surface-faint">{hm(p.secs)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
