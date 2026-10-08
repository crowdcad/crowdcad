'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Layer } from '@/app/types';
import { useTakEvent } from '../data/hub';
import { alignmentFor } from '../data/alignmentStore';
import { PREF, usePref } from '../data/prefs';
import { snapshotFrame, type BasemapFrame } from '../lib/basemapFrame';
import { BASEMAPS, DEFAULT_UNDERLAY_ID, NO_BASEMAP_ID, resolveBasemap } from '../lib/basemaps';
import { useIsDark } from '../lib/ui';
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
/** Gives up on a render that hasn't finished loading tiles by then. */
const RENDER_TIMEOUT_MS = 20_000;
/** Tries again after a failed render (e.g. offline), this many times. */
const RETRY_DELAY_MS = 5_000;
const MAX_ATTEMPTS = 5;

interface Snapshot {
  url: string;
  frame: BasemapFrame;
}

export default function TakBasemapUnderlay({ eventId, layer, rect, setImageOpacity }: TakBasemapUnderlayProps) {
  const tak = useTakEvent(eventId);
  const [basemapId] = usePref<string>(PREF.underlayBasemap, DEFAULT_UNDERLAY_ID);
  const [opacity] = usePref<number>(PREF.imageOpacity, DEFAULT_IMAGE_OPACITY);
  const dark = useIsDark();
  const option = resolveBasemap(basemapId, DEFAULT_UNDERLAY_ID, BASEMAPS, dark);
  const alignment = alignmentFor(layer, tak.alignments, tak.venueAlignments);
  const active = option.id !== NO_BASEMAP_ID && !!alignment;

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
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const renderRef = useRef<HTMLDivElement | null>(null);
  const urls = useRef<string[]>([]);

  // The map can be mounted while hidden (another dispatch tab is showing). A
  // hidden element has no size, so MapLibre would load nothing: wait until
  // the map is on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const check = () => setVisible(el.clientWidth > 0 && el.clientHeight > 0);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  // A new frame or basemap starts over.
  useEffect(() => setAttempt(0), [frame, option.style]);

  // Ask for a new picture when the frame or basemap changes, after a short pause.
  useEffect(() => {
    if (!frame || !visible || attempt >= MAX_ATTEMPTS) {
      setRendering(null);
      return;
    }
    const t = setTimeout(() => setRendering(frame), attempt === 0 ? RENDER_DELAY_MS : RETRY_DELAY_MS);
    return () => clearTimeout(t);
  }, [frame, option.style, visible, attempt]);

  // Render it off-screen once, keep the pixels, discard the map.
  useEffect(() => {
    if (!rendering) return;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let map: import('maplibre-gl').Map | null = null;
    // A failed or incomplete render keeps the previous picture and tries again later.
    const fail = () => {
      done = true;
      clearTimeout(timer);
      map?.remove();
      setRendering(null);
      // A browser tab in the background doesn't draw, so the render can't finish: try again once it is
      // shown, without using up an attempt.
      if (document.hidden) {
        const onShow = () => {
          if (document.hidden) return;
          document.removeEventListener('visibilitychange', onShow);
          setAttempt((a) => a);
          setRendering(rendering);
        };
        document.addEventListener('visibilitychange', onShow);
        return;
      }
      setAttempt((a) => a + 1);
    };
    const finish = () => {
      if (done || !map) return;
      const m = map;
      // Only keep a complete picture: never a blank or half-loaded one.
      if (!m.isStyleLoaded() || !m.areTilesLoaded()) return fail();
      done = true;
      clearTimeout(timer);
      m.getCanvas().toBlob((blob) => {
        m.remove();
        if (!blob) return fail();
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        setSnapshot({ url, frame: rendering });
        setRendering(null);
      });
    };
    void loadMaplibre().then((ml) => {
      if (done || !renderRef.current) return;
      if (renderRef.current.clientWidth === 0) return fail();
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
        if (!done && map && !map.isStyleLoaded()) fail();
      });
      map.once('idle', finish);
      timer = setTimeout(() => !done && fail(), RENDER_TIMEOUT_MS);
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

  const shown = active && snapshot ? snapshot : null;
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
    <div ref={rootRef} className="pointer-events-none absolute inset-0" data-tak-module={TAK_MODULE_MARKER} aria-hidden>
      {shown && (
        // eslint-disable-next-line @next/next/no-img-element -- a rendered picture from a blob URL
        <img
          src={shown.url}
          alt=""
          draggable={false}
          className="max-w-none select-none"
          style={box(shown.frame)}
        />
      )}
      {rendering && (
        // Off-screen render target: laid out at full size so WebGL draws it, but never visible.
        <div ref={renderRef} style={{ ...box(rendering), opacity: 0, transform: 'none' }} />
      )}
    </div>
  );
}
