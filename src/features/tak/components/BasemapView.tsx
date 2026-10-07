'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useEffect, useRef, useState } from 'react';
import type { Map as MlMap } from 'maplibre-gl';
import { resolveBasemap } from '../lib/basemaps';
import { TAK_MODULE_MARKER } from '../marker';
import type { LatLon } from '../types';

/**
 * An interactive basemap (MapLibre) for aligning maps and viewing history.
 * The event map image, markers and heat cells are drawn above the map in
 * plain DOM and canvas, positioned from the map's projection on every move,
 * so the image never has to be loaded into WebGL (which would need CORS on
 * the storage bucket).
 */

export interface BasemapMarker {
  lat: number;
  lon: number;
  label: string;
  tone: 'point' | 'pending';
}

export interface BasemapImage {
  url: string;
  /** Top left, top right, bottom right, bottom left. */
  corners: [LatLon, LatLon, LatLon, LatLon];
  opacity: number;
}

export interface HeatPoint {
  lat: number;
  lon: number;
  secs: number;
}

/** A request to move the view; change `key` to apply it again. */
export interface BasemapViewRequest {
  key: number;
  /** [west, south, east, north] */
  bounds?: [number, number, number, number];
  center?: LatLon;
  zoom?: number;
}

export interface BasemapViewProps {
  basemapId: string;
  className?: string;
  onMapClick?: (p: LatLon) => void;
  markers?: BasemapMarker[];
  image?: BasemapImage | null;
  heat?: HeatPoint[] | null;
  /** Heat cell size in meters (the bridge's grid). */
  heatCellM?: number;
  view?: BasemapViewRequest;
  /** Reports the map center after each move, e.g. to bias place search. */
  onCenterChange?: (p: LatLon) => void;
  cursor?: 'crosshair' | 'grab';
  /** Zoom with Ctrl/Cmd + scroll (two fingers on touch) so the page still scrolls over the map. */
  cooperativeGestures?: boolean;
}

let maplibrePromise: Promise<typeof import('maplibre-gl')> | null = null;
/**
 * Loads MapLibre once, on first use. MapLibre finds its worker file relative
 * to its own module, which bundlers don't follow, so the worker is emitted as
 * an asset here and its URL passed in.
 */
export const loadMaplibre = () =>
  (maplibrePromise ??= import('maplibre-gl').then((ml) => {
    ml.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString());
    return ml;
  }));

export default function BasemapView({
  basemapId,
  className,
  onMapClick,
  markers = [],
  image,
  heat,
  heatCellM = 5,
  view,
  onCenterChange,
  cursor = 'crosshair',
  cooperativeGestures = false,
}: BasemapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const heatRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [, setTick] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const centerRef = useRef(onCenterChange);
  centerRef.current = onCenterChange;
  const option = resolveBasemap(basemapId);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    void loadMaplibre().then((ml) => {
      if (cancelled || !containerRef.current) return;
      const map = new ml.Map({
        container: containerRef.current,
        style: option.style,
        center: [0, 20],
        zoom: 1,
        attributionControl: { compact: true },
        dragRotate: false,
        cooperativeGestures,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;
      const redraw = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => setTick((t) => t + 1));
      };
      map.on('move', redraw);
      map.on('resize', redraw);
      map.on('moveend', () => {
        const c = map.getCenter();
        centerRef.current?.({ lat: c.lat, lon: c.lng });
      });
      map.on('click', (e) => clickRef.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
      map.on('load', () => {
        setReady(true);
        setLoadError(null);
      });
      map.on('error', (e) => {
        // Tile or style failures (often offline). The overlays still work on a blank map.
        if (!map.isStyleLoaded()) setLoadError(e.error?.message ?? 'The basemap could not be loaded.');
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The initial style only; later changes go through setStyle below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    setLoadError(null);
    mapRef.current.setStyle(option.style);
  }, [option.style]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !view) return;
    if (view.bounds) {
      const [w, s, e, n] = view.bounds;
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: 40, maxZoom: 18, duration: 600 },
      );
    } else if (view.center) {
      map.flyTo({ center: [view.center.lon, view.center.lat], zoom: view.zoom ?? 17, duration: 600 });
    }
    // Re-applied only when the request key changes, or once the map exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.key, ready]);

  const map = mapRef.current;
  const project = (p: LatLon) => map!.project([p.lon, p.lat]);

  // Heat cells, drawn on a canvas above the image.
  useEffect(() => {
    const canvas = heatRef.current;
    const m = mapRef.current;
    if (!canvas || !m) return;
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = canvas;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!heat?.length) return;
    const max = Math.max(...heat.map((c) => c.secs));
    const lat0 = heat[0]!.lat;
    const a = m.project([heat[0]!.lon, lat0]);
    const b = m.project([heat[0]!.lon + heatCellM / (111_195 * Math.cos((lat0 * Math.PI) / 180)), lat0]);
    const size = Math.max(2, Math.hypot(b.x - a.x, b.y - a.y));
    ctx.fillStyle = 'rgb(220, 38, 38)';
    for (const c of heat) {
      const p = m.project([c.lon, c.lat]);
      if (p.x < -size || p.y < -size || p.x > w + size || p.y > h + size) continue;
      ctx.globalAlpha = 0.15 + 0.7 * Math.sqrt(c.secs / max);
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
  });

  let imageStyle: React.CSSProperties | null = null;
  if (map && image && natural) {
    const tl = project(image.corners[0]);
    const tr = project(image.corners[1]);
    const bl = project(image.corners[3]);
    const r = (n: number) => Number(n.toFixed(6));
    imageStyle = {
      width: natural.w,
      height: natural.h,
      transformOrigin: '0 0',
      transform: `matrix(${r((tr.x - tl.x) / natural.w)}, ${r((tr.y - tl.y) / natural.w)}, ${r((bl.x - tl.x) / natural.h)}, ${r((bl.y - tl.y) / natural.h)}, ${r(tl.x)}, ${r(tl.y)})`,
      opacity: image.opacity,
    };
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`} data-tak-module={TAK_MODULE_MARKER}>
      {/* Inline position: MapLibre's stylesheet sets position: relative on the map element. */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, cursor: onMapClick ? cursor : undefined }} />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- positioned by a CSS matrix from the map projection
          <img
            src={image.url}
            alt=""
            className="absolute left-0 top-0 max-w-none select-none"
            style={imageStyle ?? { display: 'none' }}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            draggable={false}
          />
        )}
        <canvas ref={heatRef} className="absolute inset-0 h-full w-full" />
        {map &&
          markers.map((mk, i) => {
            const p = project(mk);
            return (
              <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }}>
                <span
                  className={`block rounded-full border-2 border-white shadow ${
                    mk.tone === 'pending' ? 'h-4 w-4 animate-pulse bg-accent' : 'h-3 w-3 bg-status-blue'
                  }`}
                />
                {mk.label && (
                  <span className="absolute left-4 top-[-2px] whitespace-nowrap rounded bg-surface-deepest/90 px-1 text-xs text-surface-light">
                    {mk.label}
                  </span>
                )}
              </div>
            );
          })}
      </div>
      {loadError && (
        <p className="absolute bottom-8 left-2 right-2 rounded bg-surface-deepest/90 px-2 py-1 text-xs text-status-red">
          Basemap unavailable ({loadError}). You can still type coordinates, or pick &quot;No basemap&quot;.
        </p>
      )}
    </div>
  );
}
