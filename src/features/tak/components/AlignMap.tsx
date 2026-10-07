'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Button, Input, Slider } from '@heroui/react';
import { Crosshair, LocateFixed, Search, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { fitAffine, parseLatLon } from '../lib/affine';
import { imageCorners } from '../lib/basemapFrame';
import { DEFAULT_BASEMAP_ID, resolveBasemap } from '../lib/basemaps';
import { searchPlaces, type PlaceResult } from '../lib/geocode';
import { saveAlignment } from '../data/alignmentStore';
import { TAK_INPUT_CLASSNAMES } from '../lib/ui';
import { PREF, usePref } from '../data/prefs';
import { TAK_MODULE_MARKER } from '../marker';
import type { ControlPoint, LatLon, TakMapAlignment } from '../types';
import BasemapPicker from './BasemapPicker';
import BasemapView, { type BasemapMarker, type BasemapViewRequest } from './BasemapView';

/**
 * "Align map": ties an event map image to real-world coordinates with control
 * points, for TAK live positions and heat maps. Each point is a spot clicked
 * on the image plus the same spot clicked on a basemap (or typed
 * coordinates). Once 3 points exist, the image is previewed on the basemap.
 * It renders its own image and never touches the core map components or the
 * layer's existing data.
 */
export interface AlignMapProps {
  eventId: string;
  layer: { id: string; name: string; mapUrl: string };
  ownerUid: string;
  initial?: TakMapAlignment;
  onSaved?: (alignment: TakMapAlignment) => void;
  onCancel?: () => void;
}

/** Error levels for the summary line, in meters. */
const GOOD_M = 5;
const FAIR_M = 15;
/** Below this spread across the image (percent of width and height), points are too close together. */
const MIN_SPREAD_PCT = 40;

function boundsOf(points: LatLon[]): [number, number, number, number] {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export default function AlignMap({ eventId, layer, ownerUid, initial, onSaved, onCancel }: AlignMapProps) {
  const sameImage = initial?.mapUrl === layer.mapUrl;
  const [points, setPoints] = useState<ControlPoint[]>(sameImage ? initial!.controlPoints : []);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // A point in progress: its image spot, its real position, or neither yet.
  const [pendingImg, setPendingImg] = useState<{ x: number; y: number } | null>(null);
  const [pendingGeo, setPendingGeo] = useState<LatLon | null>(null);
  const [coordInput, setCoordInput] = useState('');
  const [coordError, setCoordError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [basemapId, setBasemapId] = usePref<string>(PREF.alignBasemap, DEFAULT_BASEMAP_ID);
  const [opacity, setOpacity] = useState(0.6);
  const [showOverlay, setShowOverlay] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const centerRef = useRef<LatLon | undefined>(undefined);
  const [view, setView] = useState<BasemapViewRequest | undefined>(() =>
    sameImage && initial!.controlPoints.length ? { key: 1, bounds: boundsOf(initial!.controlPoints) } : undefined,
  );
  const basemap = resolveBasemap(basemapId);

  const fit = useMemo(() => (natural ? fitAffine(points, natural.w, natural.h) : null), [points, natural]);
  const fitOk = fit && !('error' in fit) ? fit : null;

  const addPoint = (img: { x: number; y: number }, geo: LatLon) => {
    setPoints((prev) => [...prev, { x: img.x, y: img.y, lat: geo.lat, lon: geo.lon, label: `Point ${prev.length + 1}` }]);
    setPendingImg(null);
    setPendingGeo(null);
    setCoordInput('');
    setCoordError(null);
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (x < 0 || x > 100 || y < 0 || y > 100) return;
    if (pendingGeo) return addPoint({ x, y }, pendingGeo);
    setPendingImg({ x, y });
    setCoordInput('');
    setCoordError(null);
  };

  const handleMapClick = (p: LatLon) => {
    if (pendingImg) return addPoint(pendingImg, p);
    setPendingGeo(p);
  };

  const confirmTyped = () => {
    const parsed = parseLatLon(coordInput);
    if (!parsed) {
      setCoordError('Enter latitude and longitude in decimal degrees, e.g. 45.0012, -100.0021');
      return;
    }
    if (pendingImg) addPoint(pendingImg, parsed);
  };

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setCoordError('This browser cannot share its location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => pendingImg && addPoint(pendingImg, { lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setCoordError('Location unavailable. Allow location access, or type the coordinates.'),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const goTo = (r: PlaceResult) => {
    setView((v) => ({ key: (v?.key ?? 0) + 1, ...(r.bbox ? { bounds: r.bbox } : { center: { lat: r.lat, lon: r.lon }, zoom: 17 }) }));
    setResults(null);
  };

  const runSearch = async () => {
    setSearchError(null);
    setSearching(true);
    try {
      const found = await searchPlaces(query, centerRef.current);
      setResults(found);
      if (found.length === 1) goTo(found[0]!);
      if (found.length === 0) setSearchError('No places found. Try a different name or an address.');
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Place search failed.');
    } finally {
      setSearching(false);
    }
  };

  const save = async () => {
    if (!fitOk || !natural) return;
    setSaving(true);
    setSaveError(null);
    const alignment: TakMapAlignment = {
      mapUrl: layer.mapUrl,
      naturalWidth: natural.w,
      naturalHeight: natural.h,
      controlPoints: points,
      origin: fitOk.origin,
      transform: fitOk.transform,
      residualM: fitOk.residualM,
      ownerUid,
      updatedAt: Date.now(),
    };
    try {
      await saveAlignment(eventId, layer.id, alignment);
      onSaved?.(alignment);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the alignment.');
    } finally {
      setSaving(false);
    }
  };

  const next = (() => {
    if (pendingImg) return 'Now click the same spot on the basemap, or type its coordinates below.';
    if (pendingGeo) return 'Now click the same spot on your map image.';
    return 'Click a spot on your map image, then the same spot on the basemap (either order).';
  })();

  const summary = (() => {
    if (!natural) return 'Loading map…';
    if (points.length < 3) return `${3 - points.length} more point${points.length === 2 ? '' : 's'} needed.`;
    if (!fitOk) return 'These points are in a line. Spread them out across the map.';
    if (fitOk.residualM === null) return 'Aligned with 3 points. Add a 4th to estimate accuracy.';
    const level = fitOk.residualM <= GOOD_M ? 'good' : fitOk.residualM <= FAIR_M ? 'fair' : 'poor';
    return `Estimated accuracy: about ${fitOk.residualM.toFixed(1)} m (${level}).`;
  })();

  // Points bunched in one part of the image fit there but guess everywhere else.
  const spread = points.length
    ? Math.min(Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)))
    : 0;
  const bunched = !!fitOk && spread < MIN_SPREAD_PCT;

  const mapMarkers: BasemapMarker[] = [
    ...points.map((p, i) => ({ lat: p.lat, lon: p.lon, label: String(i + 1), tone: 'point' as const })),
    ...(pendingGeo ? [{ ...pendingGeo, label: '', tone: 'pending' as const }] : []),
  ];

  return (
    <div className="flex flex-col gap-3 text-surface-light" data-tak-module={TAK_MODULE_MARKER}>
      <div>
        <h3 className="text-lg font-semibold">Align map: {layer.name}</h3>
        <p className="text-sm text-surface-faint">
          Pick at least 3 spots you can identify on both maps, spread across the image. Corners of buildings, path
          junctions and field markings work well. More points give a better estimate of accuracy.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <BasemapPicker value={basemap.id} onChange={setBasemapId} />
        <form
          className="flex min-w-[240px] flex-1 items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <Input classNames={TAK_INPUT_CLASSNAMES}
            size="sm"
            label="Find a place or coordinates"
            placeholder="Venue name, address, or 37.7694, -122.4862"
            value={query}
            onValueChange={setQuery}
            isInvalid={Boolean(searchError)}
            errorMessage={searchError ?? undefined}
          />
          <Button type="submit" size="sm" isIconOnly aria-label="Search" isLoading={searching} className="mb-0.5">
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>
      {results && results.length > 1 && (
        <ul className="max-h-40 overflow-auto rounded-lg border border-surface-liner bg-surface-deep text-sm">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-surface-liner/30" onClick={() => goTo(r)}>
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm font-medium" role="status">
        {next}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="relative">
          <div className="absolute right-2 top-2 z-10 flex gap-1">
            <Button isIconOnly size="sm" radius="full" variant="flat" aria-label="Zoom out" onPress={() => setZoom((z) => Math.max(1, z - 0.5))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button isIconOnly size="sm" radius="full" variant="flat" aria-label="Zoom in" onPress={() => setZoom((z) => Math.min(4, z + 0.5))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative h-[50vh] overflow-auto rounded-lg border border-surface-liner bg-surface-deepest">
            <div className="relative" style={{ width: `${zoom * 100}%` }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- plain img: the alignment needs the image's natural size and exact click geometry */}
              <img
                src={layer.mapUrl}
                alt={`Map: ${layer.name}`}
                className="block w-full cursor-crosshair select-none"
                draggable={false}
                onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                onClick={handleImageClick}
              />
              {points.map((p, i) => (
                <div
                  key={i}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                >
                  <Crosshair className="h-5 w-5 text-status-blue drop-shadow" />
                  <span className="absolute left-5 top-0 whitespace-nowrap rounded bg-surface-deepest/90 px-1 text-xs">{i + 1}</span>
                </div>
              ))}
              {pendingImg && (
                <div
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${pendingImg.x}%`, top: `${pendingImg.y}%` }}
                >
                  <Crosshair className="h-6 w-6 animate-pulse text-accent" />
                </div>
              )}
            </div>
          </div>
        </div>

        <BasemapView
          className="h-[50vh] rounded-lg border border-surface-liner"
          basemapId={basemap.id}
          onMapClick={handleMapClick}
          markers={mapMarkers}
          image={fitOk && showOverlay ? { url: layer.mapUrl, corners: imageCorners(fitOk), opacity } : null}
          view={view}
          onCenterChange={(c) => (centerRef.current = c)}
        />
      </div>

      {fitOk && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />
            Show my map on the basemap
          </label>
          {showOverlay && (
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
      )}

      {(pendingImg || pendingGeo) && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-surface-liner bg-surface-deep p-3">
          {pendingImg && (
            <>
              <Input classNames={TAK_INPUT_CLASSNAMES}
                size="sm"
                label="Or type its position (latitude, longitude)"
                placeholder="45.0012, -100.0021"
                value={coordInput}
                onValueChange={setCoordInput}
                onKeyDown={(e) => e.key === 'Enter' && confirmTyped()}
                isInvalid={Boolean(coordError)}
                errorMessage={coordError ?? undefined}
                className="min-w-[260px] flex-1"
              />
              <Button size="sm" className="bg-accent text-surface-light" onPress={confirmTyped}>
                Add point
              </Button>
              <Button size="sm" variant="flat" startContent={<LocateFixed className="h-4 w-4" />} onPress={useDeviceLocation}>
                Use my location
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="light"
            onPress={() => {
              setPendingImg(null);
              setPendingGeo(null);
            }}
          >
            Cancel this point
          </Button>
        </div>
      )}

      {points.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-surface-faint">
            <tr>
              <th className="py-1">#</th>
              <th>Latitude, longitude</th>
              <th>Off by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => {
              const r = fitOk && fitOk.residualM !== null ? fitOk.pointResidualsM[i] : undefined;
              return (
                <tr key={i} className="border-t border-surface-liner">
                  <td className="py-1">{i + 1}</td>
                  <td>
                    {p.lat.toFixed(6)}, {p.lon.toFixed(6)}
                  </td>
                  <td>{r === undefined ? '—' : `${r.toFixed(1)} m`}</td>
                  <td className="text-right">
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      aria-label={`Remove point ${i + 1}`}
                      onPress={() => setPoints((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="text-sm" role="status">
        {summary}
      </p>
      {bunched && (
        <p className="text-sm text-status-yellow">
          Your points are close together, so the rest of the map is a guess and may look stretched in the preview. Add
          points near the edges or corners of the image.
        </p>
      )}
      {saveError && <p className="text-sm text-status-red">{saveError}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="flat" onPress={onCancel}>
            Later
          </Button>
        )}
        <Button className="bg-accent text-surface-light" isDisabled={!fitOk || saving} isLoading={saving} onPress={save}>
          Save alignment
        </Button>
      </div>
    </div>
  );
}
