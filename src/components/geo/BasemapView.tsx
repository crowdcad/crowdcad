'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Map as MlMap, Marker as MlMarker } from 'maplibre-gl';
import { BASEMAPS, DEFAULT_BASEMAP_ID, resolveBasemap } from '@/lib/geo/basemaps';
import { useIsDark } from '@/lib/geo/ui';
import styles from './basemap.module.css';
import type { LatLon } from '@/lib/geo/types';

/**
 * An interactive basemap (MapLibre): the live map behind map alignment,
 * drawn areas, posts and zones on geo layers, the dispatch live map and the
 * TAK history view.
 *
 * The event map image and heat cells are drawn above the map in plain DOM
 * and canvas, so the image never has to be loaded into WebGL (which would
 * need CORS on the storage bucket). They are repositioned directly from the
 * map's own move handler, in the same frame the map draws, never through a
 * React render, so they stay locked to the map while panning and zooming
 * (D60). Markers are MapLibre markers, which work the same way.
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

/** A polygon or line in real coordinates, drawn above the image (zones, drawn areas, a shape being drawn). */
export interface GeoShape {
  id: string;
  coords: { lat: number; lng: number }[];
  color: string;
  /** Closed and filled (a zone or area), or an open line with its vertices (a shape being drawn). */
  closed: boolean;
  fillOpacity?: number;
  dashed?: boolean;
}

/** Any React content pinned to a position: posts, team markers. */
export interface GeoPin {
  key: string;
  lat: number;
  lng: number;
  node: React.ReactNode;
  /** Lets the pin be dragged to a new position. */
  onDragEnd?: (p: { lat: number; lng: number }) => void;
  /** Which part of the content sits on the position. */
  anchor?: 'center' | 'bottom';
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
  shapes?: GeoShape[];
  pins?: GeoPin[];
  /** Content above the map, unscaled (controls, panels). */
  children?: React.ReactNode;
}

type Maplibre = typeof import('maplibre-gl');
let maplibrePromise: Promise<Maplibre> | null = null;
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

const r6 = (n: number) => Number(n.toFixed(6));

/** The live map, for content that adds its own pins (GeoPins) as a child of BasemapView. */
export const GeoMapContext = createContext<{ map: MlMap; ml: Maplibre } | null>(null);

/**
 * Pins on the enclosing BasemapView: one MapLibre marker per key, holding a
 * React portal, so content updates without recreating markers. Usable by any
 * child of BasemapView (for example the TAK module's live positions).
 */
export function GeoPins({ pins }: { pins: GeoPin[] }) {
  const ctx = useContext(GeoMapContext);
  const pinEls = useRef(new Map<string, { el: HTMLDivElement; marker: MlMarker | null }>());
  for (const pin of pins) {
    if (!pinEls.current.has(pin.key) && typeof document !== 'undefined') {
      const el = document.createElement('div');
      // Above the image overlay and shapes (later siblings of the map), like MapLibre's own controls.
      el.style.zIndex = '2';
      pinEls.current.set(pin.key, { el, marker: null });
    }
  }
  const handlers = useRef(new Map<string, GeoPin['onDragEnd']>());
  handlers.current = new Map(pins.map((p) => [p.key, p.onDragEnd]));
  useEffect(() => {
    if (!ctx) return;
    const keep = new Set(pins.map((p) => p.key));
    for (const [key, entry] of pinEls.current) {
      if (!keep.has(key)) {
        entry.marker?.remove();
        pinEls.current.delete(key);
      }
    }
    for (const pin of pins) {
      const entry = pinEls.current.get(pin.key);
      if (!entry) continue;
      if (!entry.marker) {
        entry.marker = new ctx.ml.Marker({ element: entry.el, anchor: pin.anchor ?? 'center' }).setLngLat([pin.lng, pin.lat]).addTo(ctx.map);
        entry.marker.on('dragend', () => {
          const ll = entry.marker!.getLngLat();
          handlers.current.get(pin.key)?.({ lat: ll.lat, lng: ll.lng });
        });
      } else {
        entry.marker.setLngLat([pin.lng, pin.lat]);
      }
      entry.marker.setDraggable(!!pin.onDragEnd);
    }
  });
  // On unmount (or the map going away), take the markers off the map but keep their elements, which the
  // portals below render into; a remount (React's development double mount included) adds them back.
  useEffect(
    () => () => {
      for (const entry of pinEls.current.values()) {
        entry.marker?.remove();
        entry.marker = null;
      }
    },
    [ctx],
  );
  return (
    <>
      {pins.map((pin) => {
        const entry = pinEls.current.get(pin.key);
        return entry ? createPortal(pin.node, entry.el, pin.key) : null;
      })}
    </>
  );
}


function markerElement(m: BasemapMarker): HTMLElement {
  const el = document.createElement('div');
  el.className = 'relative';
  // Above the image overlay, which is a later sibling of the map (like MapLibre's own controls).
  el.style.zIndex = '2';
  const dot = document.createElement('span');
  dot.className = `block rounded-full border-2 border-white shadow ${
    m.tone === 'pending' ? 'h-4 w-4 animate-pulse bg-accent' : 'h-3 w-3 bg-status-blue'
  }`;
  el.appendChild(dot);
  if (m.label) {
    const label = document.createElement('span');
    label.className = 'absolute left-4 top-[-2px] whitespace-nowrap rounded bg-surface-deepest/90 px-1 text-xs text-surface-light';
    label.textContent = m.label;
    el.appendChild(label);
  }
  return el;
}

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
  shapes,
  pins,
  children,
}: BasemapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const heatRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const mlRef = useRef<Maplibre | null>(null);
  const markerRefs = useRef<MlMarker[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Latest props for the per-frame handlers, which must not wait for React.
  const live = useRef({ image, heat, heatCellM, shapes, natural: null as { w: number; h: number } | null });
  live.current.image = image;
  live.current.heat = heat;
  live.current.shapes = shapes;
  live.current.heatCellM = heatCellM;
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const centerRef = useRef(onCenterChange);
  centerRef.current = onCenterChange;
  const dark = useIsDark();
  const option = resolveBasemap(basemapId, DEFAULT_BASEMAP_ID, BASEMAPS, dark);
  // MapLibre loads asynchronously; the map is created with whatever style is current by then.
  const styleRef = useRef(option.style);
  styleRef.current = option.style;
  const appliedStyle = useRef<typeof option.style | null>(null);

  /** Positions the image over the map with a CSS matrix from three projected corners. */
  const placeImage = () => {
    const map = mapRef.current;
    const el = imgRef.current;
    const { image: img, natural } = live.current;
    if (!el) return;
    if (!map || !img || !natural) {
      el.style.display = 'none';
      return;
    }
    const tl = map.project([img.corners[0].lon, img.corners[0].lat]);
    const tr = map.project([img.corners[1].lon, img.corners[1].lat]);
    const bl = map.project([img.corners[3].lon, img.corners[3].lat]);
    el.style.display = 'block';
    el.style.width = `${natural.w}px`;
    el.style.height = `${natural.h}px`;
    el.style.opacity = String(img.opacity);
    el.style.transform = `matrix(${r6((tr.x - tl.x) / natural.w)}, ${r6((tr.y - tl.y) / natural.w)}, ${r6((bl.x - tl.x) / natural.h)}, ${r6((bl.y - tl.y) / natural.h)}, ${r6(tl.x)}, ${r6(tl.y)})`;
  };

  /** Redraws heat cells on the canvas; a few thousand rectangles take well under a frame. */
  const drawHeat = () => {
    const map = mapRef.current;
    const canvas = heatRef.current;
    if (!map || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawShapes(map, ctx);
    const cells = live.current.heat;
    if (!cells?.length) return;
    let max = 0;
    for (const c of cells) max = Math.max(max, c.secs);
    const lat0 = cells[0]!.lat;
    const a = map.project([cells[0]!.lon, lat0]);
    const b = map.project([cells[0]!.lon + live.current.heatCellM / (111_195 * Math.cos((lat0 * Math.PI) / 180)), lat0]);
    const size = Math.max(2, Math.hypot(b.x - a.x, b.y - a.y));
    ctx.fillStyle = 'rgb(220, 38, 38)';
    for (const c of cells) {
      const p = map.project([c.lon, c.lat]);
      if (p.x < -size || p.y < -size || p.x > w + size || p.y > h + size) continue;
      ctx.globalAlpha = 0.15 + 0.7 * Math.sqrt(c.secs / max);
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
  };

  /** Zones, drawn areas and the shape being drawn. */
  const drawShapes = (map: MlMap, ctx: CanvasRenderingContext2D) => {
    for (const shape of live.current.shapes ?? []) {
      if (shape.coords.length === 0) continue;
      const pts = shape.coords.map((c) => map.project([c.lng, c.lat]));
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = shape.color;
      ctx.setLineDash(shape.dashed ? [6, 4] : []);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (shape.closed && pts.length > 2) {
        ctx.closePath();
        ctx.fillStyle = shape.color;
        ctx.globalAlpha = shape.fillOpacity ?? 0.2;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.stroke();
      if (!shape.closed) {
        ctx.fillStyle = shape.color;
        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  };

  const sync = () => {
    placeImage();
    drawHeat();
  };
  const syncRef = useRef(sync);
  syncRef.current = sync;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    void loadMaplibre().then((ml) => {
      if (cancelled || !containerRef.current) return;
      mlRef.current = ml;
      const map = new ml.Map({
        container: containerRef.current,
        style: styleRef.current,
        center: [0, 20],
        zoom: 1,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        cooperativeGestures,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;
      appliedStyle.current = styleRef.current;
      // 'move' fires inside the map's render frame, before it paints, so DOM
      // written here appears in the same frame as the map.
      map.on('move', () => syncRef.current());
      map.on('resize', () => syncRef.current());
      map.on('moveend', () => {
        const c = map.getCenter();
        centerRef.current?.({ lat: c.lat, lon: c.lng });
      });
      map.on('click', (e) => clickRef.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
      map.on('load', () => {
        setReady(true);
        setLoadError(null);
        syncRef.current();
      });
      map.on('error', (e) => {
        // Tile or style failures (often offline). The overlays still work on a blank map.
        if (!map.isStyleLoaded()) setLoadError(e.error?.message ?? 'The basemap could not be loaded.');
      });
    });
    return () => {
      cancelled = true;
      for (const m of markerRefs.current) m.remove();
      markerRefs.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The initial style and gesture mode only; style changes go through setStyle below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || appliedStyle.current === option.style) return;
    appliedStyle.current = option.style;
    setLoadError(null);
    mapRef.current.setStyle(option.style);
  }, [option.style, ready]);

  // Overlays follow prop changes immediately (not only on the next move).
  useEffect(() => {
    sync();
  });

  // Markers: MapLibre markers, recreated when the list changes (a handful at most).
  const markerKey = JSON.stringify(markers);
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    for (const m of markerRefs.current) m.remove();
    markerRefs.current = [];
    if (!map || !ml) return;
    markerRefs.current = markers.map((m) => new ml.Marker({ element: markerElement(m) }).setLngLat([m.lon, m.lat]).addTo(map));
    // markerKey stands in for the markers array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerKey, ready]);

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

  return (
    <div
      // Positioned relative unless the caller positions it (e.g. absolute inset-0); Tailwind's relative would win.
      className={`${/\b(absolute|fixed)\b/.test(className ?? '') ? '' : 'relative'} overflow-hidden ${styles.map} ${onMapClick && cursor === 'crosshair' ? styles.crosshair : ''} ${className ?? ''}`}
    >
      {/* Inline position: MapLibre's stylesheet sets position: relative on the map element. */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, cursor: onMapClick ? cursor : undefined }} />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- positioned by a CSS matrix from the map projection
          <img
            ref={imgRef}
            src={image.url}
            alt=""
            className="absolute left-0 top-0 max-w-none select-none"
            style={{ display: 'none', transformOrigin: '0 0', willChange: 'transform' }}
            onLoad={(e) => {
              live.current.natural = { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight };
              placeImage();
            }}
            draggable={false}
          />
        )}
        <canvas ref={heatRef} className="absolute inset-0 h-full w-full" />
      </div>
      <GeoMapContext.Provider value={ready && mapRef.current && mlRef.current ? { map: mapRef.current, ml: mlRef.current } : null}>
        {pins?.length ? <GeoPins pins={pins} /> : null}
        {children}
      </GeoMapContext.Provider>
      {loadError && (
        <p className="absolute bottom-8 left-2 right-2 rounded bg-surface-deepest/90 px-2 py-1 text-xs text-status-red">
          Basemap unavailable ({loadError}). You can still type coordinates, or pick &quot;No basemap&quot;.
        </p>
      )}
    </div>
  );
}
