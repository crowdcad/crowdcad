'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Button, Input } from '@heroui/react';
import { Crosshair, LocateFixed, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { fitAffine, parseLatLon } from '../lib/affine';
import { saveAlignment } from '../data/alignmentStore';
import { TAK_MODULE_MARKER } from '../marker';
import type { ControlPoint, TakMapAlignment } from '../types';

/**
 * "Align map": ties an event map image to real-world coordinates with control
 * points, for TAK live positions and heat maps. It renders its own image and
 * never touches the core map components or the layer's existing data.
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

export default function AlignMap({ eventId, layer, ownerUid, initial, onSaved, onCancel }: AlignMapProps) {
  const sameImage = initial?.mapUrl === layer.mapUrl;
  const [points, setPoints] = useState<ControlPoint[]>(sameImage ? initial!.controlPoints : []);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [coordInput, setCoordInput] = useState('');
  const [coordError, setCoordError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const fit = useMemo(() => (natural ? fitAffine(points, natural.w, natural.h) : null), [points, natural]);
  const fitOk = fit && !('error' in fit) ? fit : null;

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (x < 0 || x > 100 || y < 0 || y > 100) return;
    setPending({ x, y });
    setCoordInput('');
    setCoordError(null);
  };

  const addPending = (lat: number, lon: number) => {
    if (!pending) return;
    setPoints((prev) => [...prev, { x: pending.x, y: pending.y, lat, lon, label: `Point ${prev.length + 1}` }]);
    setPending(null);
    setCoordInput('');
  };

  const confirmTyped = () => {
    const parsed = parseLatLon(coordInput);
    if (!parsed) {
      setCoordError('Enter latitude and longitude in decimal degrees, e.g. 45.0012, -100.0021');
      return;
    }
    addPending(parsed.lat, parsed.lon);
  };

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setCoordError('This browser cannot share its location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => addPending(pos.coords.latitude, pos.coords.longitude),
      () => setCoordError('Location unavailable. Allow location access, or type the coordinates.'),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
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

  const summary = (() => {
    if (!natural) return 'Loading map…';
    if (points.length < 3) return `Click the map to place control points. ${3 - points.length} more needed.`;
    if (!fitOk) return 'These points are in a line. Spread them out across the map.';
    if (fitOk.residualM === null) return 'Aligned with 3 points. Add a 4th to estimate accuracy.';
    const level = fitOk.residualM <= GOOD_M ? 'good' : fitOk.residualM <= FAIR_M ? 'fair' : 'poor';
    return `Estimated accuracy: about ${fitOk.residualM.toFixed(1)} m (${level}).`;
  })();

  return (
    <div className="flex flex-col gap-3 text-surface-light" data-tak-module={TAK_MODULE_MARKER}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Align map: {layer.name}</h3>
          <p className="text-sm text-surface-faint">
            Pick at least 3 spots you can identify on the ground, spread across the map. More points give a better
            estimate of accuracy.
          </p>
        </div>
        <div className="flex gap-1">
          <Button isIconOnly size="sm" radius="full" variant="flat" aria-label="Zoom out" onPress={() => setZoom((z) => Math.max(1, z - 0.5))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button isIconOnly size="sm" radius="full" variant="flat" aria-label="Zoom in" onPress={() => setZoom((z) => Math.min(4, z + 0.5))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative max-h-[60vh] overflow-auto rounded-lg border border-surface-liner bg-surface-deepest">
        <div className="relative" style={{ width: `${zoom * 100}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- plain img: the alignment needs the image's natural size and exact click geometry */}
          <img
            ref={imgRef}
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
          {pending && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pending.x}%`, top: `${pending.y}%` }}
            >
              <Crosshair className="h-6 w-6 animate-pulse text-accent" />
            </div>
          )}
        </div>
      </div>

      {pending && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-surface-liner bg-surface-deep p-3">
          <Input
            size="sm"
            label="Real position of this spot (latitude, longitude)"
            placeholder="45.0012, -100.0021"
            value={coordInput}
            onValueChange={setCoordInput}
            onKeyDown={(e) => e.key === 'Enter' && confirmTyped()}
            isInvalid={Boolean(coordError)}
            errorMessage={coordError ?? undefined}
            className="min-w-[260px] flex-1"
            autoFocus
          />
          <Button size="sm" className="bg-accent text-surface-light" onPress={confirmTyped}>
            Add point
          </Button>
          <Button size="sm" variant="flat" startContent={<LocateFixed className="h-4 w-4" />} onPress={useDeviceLocation}>
            Use my location
          </Button>
          <Button size="sm" variant="light" onPress={() => setPending(null)}>
            Cancel
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
