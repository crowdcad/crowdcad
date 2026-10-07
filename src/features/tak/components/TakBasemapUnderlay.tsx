'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Layer } from '@/app/types';
import { useTakEvent } from '../data/hub';
import { alignmentMatches } from '../data/alignmentStore';
import { PREF, usePref } from '../data/prefs';
import { snapshotFrame, type BasemapFrame } from '../lib/basemapFrame';
import { NO_BASEMAP_ID, resolveBasemap } from '../lib/basemaps';
import { TAK_MODULE_MARKER } from '../marker';
import { loadMaplibre } from './BasemapView';

/**
 * A basemap under the dispatch map image (touchpoint j, D56, D60).
 *
 * The basemap is rendered once, in the image's frame, covering the image plus
 * a wide margin, then kept as a plain picture and the live map discarded. It
 * sits inside the same zoomed and panned container as the event map, so it
 * moves with it exactly and costs nothing during the event. It is rendered
 * again only when the alignment, the basemap or the map's size changes; the
 * previous picture stays until the new one is ready.
 *
 * Off by default; each viewer picks a basemap and the image's opacity in the
 * TAK panel. Nothing renders for a layer without a current alignment.
 */
export interface TakBasemapUnderlayProps {
  eventId: string;
  layer: Layer | undefined;
  rect: { x: number; y: number; width: number; height: number };
  container: { width: number; height: number };
  scale: number;
  setImageOpacity: (opacity: number) => void;
}

export const DEFAULT_IMAGE_OPACITY = 0.7;
/** Basemap beyond the image on every side, as a multiple of the image's longer side. */
export const UNDERLAY_MARGIN = 1;
/** Waits this long after a change (e.g. window resizing) before rendering again. */
const RENDER_DELAY_MS = 300;
/** Uses whatever has loaded by then if some tiles never arrive. */
const RENDER_TIMEOUT_MS = 20_000;

interface Snapshot {
  url: string;
  frame: BasemapFrame;
}

export default function TakBasemapUnderlay({ eventId, layer, rect, setImageOpacity }: TakBasemapUnderlayProps) {
  const tak = useTakEvent(eventId);
  const [basemapId] = usePref<string>(PREF.underlayBasemap, NO_BASEMAP_ID);
  const [opacity] = usePref<number>(PREF.imageOpacity, DEFAULT_IMAGE_OPACITY);
  const option = resolveBasemap(basemapId, NO_BASEMAP_ID);
  const alignment = layer ? tak.alignments[layer.id] : undefined;
  const active = option.id !== NO_BASEMAP_ID && !!layer && alignmentMatches(alignment, layer.mapUrl);

  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  // Rounded so sub-pixel layout changes don't trigger a new render.
  const rw = Math.round(rect.width);
  const rh = Math.round(rect.height);
  const frame = useMemo(
    () =>
      active
        ? snapshotFrame(alignment!, { x: rect.x, y: rect.y, width: rw, height: rh }, { margin: UNDERLAY_MARGIN, detail: Math.max(2, dpr) })
        : null,
    // rect is a new object each render; its rounded size and position decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, alignment, Math.round(rect.x), Math.round(rect.y), rw, rh, dpr],
  );

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [rendering, setRendering] = useState<BasemapFrame | null>(null);
  const [failed, setFailed] = useState(false);
  const renderRef = useRef<HTMLDivElement | null>(null);
  const urls = useRef<string[]>([]);

  // Ask for a new picture when the frame or basemap changes, after a short pause.
  useEffect(() => {
    if (!frame) {
      setRendering(null);
      return;
    }
    const t = setTimeout(() => setRendering(frame), RENDER_DELAY_MS);
    return () => clearTimeout(t);
  }, [frame, option.style]);

  // Render it off-screen once, keep the pixels, discard the map.
  useEffect(() => {
    if (!rendering) return;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let map: import('maplibre-gl').Map | null = null;
    const finish = () => {
      if (done || !map) return;
      done = true;
      clearTimeout(timer);
      const m = map;
      m.getCanvas().toBlob((blob) => {
        m.remove();
        if (!blob) return setFailed(true);
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        setFailed(false);
        setSnapshot({ url, frame: rendering });
        setRendering(null);
      });
    };
    void loadMaplibre().then((ml) => {
      if (done || !renderRef.current) return;
      map = new ml.Map({
        container: renderRef.current,
        style: option.style,
        interactive: false,
        attributionControl: false,
        center: [rendering.center.lon, rendering.center.lat],
        zoom: rendering.zoom,
        bearing: rendering.bearing,
        fadeDuration: 0,
        // The frame already includes the detail factor.
        pixelRatio: 1,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      map.on('error', () => {
        if (map && !map.isStyleLoaded()) {
          done = true;
          clearTimeout(timer);
          map.remove();
          setFailed(true);
        }
      });
      map.once('idle', finish);
      timer = setTimeout(finish, RENDER_TIMEOUT_MS);
    });
    return () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        map?.remove();
      }
    };
  }, [rendering, option.style]);

  // Drop pictures no longer shown.
  useEffect(() => {
    const keep = snapshot?.url;
    urls.current = urls.current.filter((u) => {
      if (u === keep) return true;
      URL.revokeObjectURL(u);
      return false;
    });
  }, [snapshot]);
  useEffect(
    () => () => {
      for (const u of urls.current) URL.revokeObjectURL(u);
      urls.current = [];
    },
    [],
  );

  const shown = active && snapshot && !failed ? snapshot : null;
  useEffect(() => {
    setImageOpacity(shown ? opacity : 1);
  }, [shown, opacity, setImageOpacity]);
  useEffect(() => () => setImageOpacity(1), [setImageOpacity]);

  if (!active) return null;
  const box = (f: BasemapFrame): React.CSSProperties => ({
    position: 'absolute',
    left: f.box.x,
    top: f.box.y,
    width: f.box.width,
    height: f.box.height,
    transform: f.transform,
    transformOrigin: 'center center',
  });
  return (
    <div className="pointer-events-none absolute inset-0" data-tak-module={TAK_MODULE_MARKER} aria-hidden>
      {shown && (
        // eslint-disable-next-line @next/next/no-img-element -- a rendered picture from a blob URL
        <img src={shown.url} alt="" draggable={false} className="max-w-none select-none" style={box(shown.frame)} />
      )}
      {rendering && (
        // Off-screen render target: laid out at full size so WebGL draws it, but never visible.
        <div ref={renderRef} style={{ ...box(rendering), opacity: 0, transform: 'none' }} />
      )}
    </div>
  );
}
