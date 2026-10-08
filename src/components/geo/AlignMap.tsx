'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Slider } from '@heroui/react';
import { Crosshair, LocateFixed, Trash2 } from 'lucide-react';
import { useZoomPan } from '@/hooks/useZoomPan';
import { MAP_CHECKER_BG } from '@/lib/mapStyles';
import MapZoomControls from '@/components/ui/map-zoom-controls';
import { fitAffine, parseLatLon } from '@/lib/geo/affine';
import { imageCorners } from '@/lib/geo/basemapFrame';
import { DEFAULT_BASEMAP_ID, validChoice } from '@/lib/geo/basemaps';
import type { PlaceResult } from '@/lib/geo/geocode';
import { ACCENT_SLIDER_CLASSNAMES } from '@/lib/geo/ui';
import { PREF, usePref } from '@/lib/geo/prefs';
import type { ControlPoint, LatLon, MapAlignment } from '@/lib/geo/types';
import BasemapPicker from './BasemapPicker';
import PlaceSearch from './PlaceSearch';
import BasemapView, { type BasemapMarker, type BasemapViewRequest } from './BasemapView';

/**
 * "Align map": ties a venue map image to real-world coordinates with control
 * points, for TAK live positions and heat maps. Each point is a spot clicked
 * on the image plus the same spot clicked on a basemap (or typed
 * coordinates). Once 3 points exist, the image is previewed on the basemap.
 *
 * It only computes the alignment; `onSave` decides where it is kept (the
 * venue's layer, D61).
 */
export interface AlignMapProps {
  layer: { id: string; name: string; mapUrl: string };
  ownerUid: string;
  initial?: MapAlignment;
  /** Called with the result when the user saves. Leave out when using onChange. */
  onSave?: (alignment: MapAlignment) => void | Promise<void>;
  /**
   * Called whenever the points change: the alignment once 3 or more points
   * fit, or null when they no longer do. With it there is no save button;
   * the caller keeps the latest (venue setup saves it with the venue).
   */
  onChange?: (alignment: MapAlignment | null) => void;
  saveLabel?: string;
  onCancel?: () => void;
  cancelLabel?: string;
  /** Height of the two map panes. */
  paneClassName?: string;
}

/** Error levels for the summary line, in meters. */
const GOOD_M = 5;
const FAIR_M = 15;
/** Below this spread across the image (percent of width and height), points are too close together. */
const MIN_SPREAD_PCT = 40;
/** A press that moves further than this is a pan, not a click. */
const CLICK_SLOP_PX = 4;

function boundsOf(points: LatLon[]): [number, number, number, number] {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export default function AlignMap({
  layer,
  ownerUid,
  initial,
  onSave,
  onChange,
  saveLabel = 'Save alignment',
  onCancel,
  cancelLabel = 'Later',
  paneClassName = 'h-[55vh] min-h-[320px]',
}: AlignMapProps) {
  const sameImage = initial?.mapUrl === layer.mapUrl;
  const [points, setPoints] = useState<ControlPoint[]>(sameImage ? initial!.controlPoints : []);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // A point in progress: its image spot, its real position, or neither yet.
  const [pendingImg, setPendingImg] = useState<{ x: number; y: number } | null>(null);
  const [pendingGeo, setPendingGeo] = useState<LatLon | null>(null);
  const [coordInput, setCoordInput] = useState('');
  const [coordError, setCoordError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [basemapId, setBasemapId] = usePref<string>(PREF.alignBasemap, DEFAULT_BASEMAP_ID);
  const [opacity, setOpacity] = useState(0.6);
  const [showOverlay, setShowOverlay] = useState(true);
  const centerRef = useRef<LatLon | undefined>(undefined);
  const [view, setView] = useState<BasemapViewRequest | undefined>(() =>
    sameImage && initial!.controlPoints.length ? { key: 1, bounds: boundsOf(initial!.controlPoints) } : undefined,
  );
  const basemapChoice = validChoice(basemapId, DEFAULT_BASEMAP_ID);

  // The image pane pans and zooms like CrowdCAD's other maps; zooming out past fit shows margin around it.
  const zp = useZoomPan({ minScale: 0.5, maxScale: 8 });
  const pressAt = useRef<{ x: number; y: number } | null>(null);

  const fit = useMemo(() => (natural ? fitAffine(points, natural.w, natural.h) : null), [points, natural]);
  const fitOk = fit && !('error' in fit) ? fit : null;

  const addPoint = (img: { x: number; y: number }, geo: LatLon) => {
    setPoints((prev) => [
      ...prev,
      {
        x: img.x,
        y: img.y,
        lat: geo.lat,
        lon: geo.lon,
        label: `Point ${prev.length + 1}`,
      },
    ]);
    setPendingImg(null);
    setPendingGeo(null);
    setCoordInput('');
    setCoordError(null);
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const start = pressAt.current;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP_PX) return; // a pan, not a click
    // The rect already includes the pan/zoom transform.
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
      (pos) =>
        pendingImg &&
        addPoint(pendingImg, {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
      () => setCoordError('Location unavailable. Allow location access, or type the coordinates.'),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const goTo = (r: PlaceResult) => {
    setView((v) => ({
      key: (v?.key ?? 0) + 1,
      ...(r.bbox ? { bounds: r.bbox } : { center: { lat: r.lat, lon: r.lon }, zoom: 17 }),
    }));
  };

  const build = (): MapAlignment | null =>
    fitOk && natural
      ? {
          mapUrl: layer.mapUrl,
          naturalWidth: natural.w,
          naturalHeight: natural.h,
          controlPoints: points,
          origin: fitOk.origin,
          transform: fitOk.transform,
          residualM: fitOk.residualM,
          ownerUid,
          updatedAt: Date.now(),
        }
      : null;

  // Report every change of points (not the initial ones) to onChange.
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const initialPoints = useRef(points);
  useEffect(() => {
    if (!changeRef.current || !natural || points === initialPoints.current) return;
    changeRef.current(build());
    // build reads the current points, fit and image size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, natural]);

  const save = async () => {
    const alignment = build();
    if (!alignment || !onSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(alignment);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the alignment.');
    } finally {
      setSaving(false);
    }
  };

  const next = (() => {
    if (pendingImg) return 'Now click the same spot on the basemap, or type its coordinates below.';
    if (pendingGeo) return 'Now click the same spot on your map image.';
    return 'Click a spot on your map image, then the same spot on the basemap (either order). Drag to move either map.';
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
    ? Math.min(
        Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
        Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
      )
    : 0;
  const bunched = !!fitOk && spread < MIN_SPREAD_PCT;

  const mapMarkers: BasemapMarker[] = [
    ...points.map((p, i) => ({
      lat: p.lat,
      lon: p.lon,
      label: String(i + 1),
      tone: 'point' as const,
    })),
    ...(pendingGeo ? [{ ...pendingGeo, label: '', tone: 'pending' as const }] : []),
  ];
  // Markers keep their on-screen size while the image zooms.
  const markerScale = {
    transform: `translate(-50%, -50%) scale(${1 / zp.scale})`,
  };

  return (
    <div className="flex flex-col gap-3 text-surface-light">
      <div className="flex flex-wrap items-end gap-2">
        <BasemapPicker value={basemapChoice} onChange={setBasemapId} omit={['none']} />
        <PlaceSearch className="flex-1" near={() => centerRef.current} onPick={goTo} />
        {fitOk && (
          <div className="flex items-end gap-3 text-sm">
            <label className="flex h-12 items-center gap-2 whitespace-nowrap">
              <input type="checkbox" className="accent-accent" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />
              Show my map
            </label>
            {showOverlay && (
              <Slider
                size="sm"
                label="Map opacity"
                className="w-40"
                minValue={0.1}
                maxValue={1}
                step={0.05}
                value={opacity}
                onChange={(v) => setOpacity(Array.isArray(v) ? v[0]! : v)}
                getValue={(v) => `${Math.round((Array.isArray(v) ? v[0]! : v) * 100)}%`}
                classNames={ACCENT_SLIDER_CLASSNAMES}
              />
            )}
          </div>
        )}
      </div>

      <p className="text-sm font-medium" role="status">
        {next}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div
          className={`relative overflow-hidden rounded-lg border border-surface-liner ${paneClassName}`}
          style={{
            ...MAP_CHECKER_BG,
            cursor: zp.isPanning ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
          onWheel={zp.handleWheel}
          onMouseDown={(e) => {
            pressAt.current = { x: e.clientX, y: e.clientY };
            zp.handleMouseDown(e);
          }}
          onMouseMove={zp.handleMouseMove}
          onMouseUp={zp.handleMouseUp}
          onMouseLeave={zp.handleMouseUp}
          onTouchStart={zp.handleTouchStart}
          onTouchMove={zp.handleTouchMove}
          onTouchEnd={zp.handleTouchEnd}
        >
          <div
            className="flex h-full w-full items-center justify-center p-6"
            style={{
              transform: `translate(${zp.position.x}px, ${zp.position.y}px) scale(${zp.scale})`,
              transformOrigin: 'center center',
              transition: zp.isPanning ? 'none' : 'transform 0.1s ease-out',
            }}
          >
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- plain img: the alignment needs the image's natural size and exact click geometry */}
              <img
                src={layer.mapUrl}
                alt={`Map: ${layer.name}`}
                className="block max-w-full cursor-crosshair select-none"
                style={{ maxHeight: 'calc(55vh - 3rem)' }}
                draggable={false}
                onLoad={(e) =>
                  setNatural({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  })
                }
                onClick={handleImageClick}
              />
              {points.map((p, i) => (
                <div key={i} className="pointer-events-none absolute" style={{ left: `${p.x}%`, top: `${p.y}%`, ...markerScale }}>
                  <Crosshair className="h-5 w-5 text-status-blue drop-shadow" />
                  <span className="absolute left-5 top-0 whitespace-nowrap rounded bg-surface-deepest/90 px-1 text-xs">{i + 1}</span>
                </div>
              ))}
              {pendingImg && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: `${pendingImg.x}%`,
                    top: `${pendingImg.y}%`,
                    ...markerScale,
                  }}
                >
                  <Crosshair className="h-6 w-6 animate-pulse text-accent" />
                </div>
              )}
            </div>
          </div>
          <MapZoomControls onZoomIn={() => zp.zoomIn(0.5)} onZoomOut={() => zp.zoomOut(0.5)} onReset={zp.resetZoom} />
        </div>

        <BasemapView
          className={`rounded-lg border border-surface-liner ${paneClassName}`}
          basemapId={basemapChoice}
          onMapClick={handleMapClick}
          markers={mapMarkers}
          image={fitOk && showOverlay ? { url: layer.mapUrl, corners: imageCorners(fitOk), opacity } : null}
          view={view}
          onCenterChange={(c) => (centerRef.current = c)}
        />
      </div>

      {(pendingImg || pendingGeo) && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-surface-liner bg-surface-deep p-3">
          {pendingImg && (
            <>
              <Input
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
          Your points are close together, so the rest of the map is a guess and may look stretched in the preview. Add points near the edges
          or corners of the image.
        </p>
      )}
      {saveError && <p className="text-sm text-status-red">{saveError}</p>}

      {!onChange && (
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button variant="flat" onPress={onCancel}>
              {cancelLabel}
            </Button>
          )}
          <Button className="bg-accent text-surface-light" isDisabled={!fitOk || saving} isLoading={saving} onPress={save}>
            {saveLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
