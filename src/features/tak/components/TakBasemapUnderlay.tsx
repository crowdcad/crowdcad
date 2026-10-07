'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MlMap } from 'maplibre-gl';
import type { Layer } from '@/app/types';
import { useTakEvent } from '../data/hub';
import { alignmentMatches } from '../data/alignmentStore';
import { PREF, usePref } from '../data/prefs';
import { basemapFrame } from '../lib/basemapFrame';
import { NO_BASEMAP_ID, resolveBasemap } from '../lib/basemaps';
import { TAK_MODULE_MARKER } from '../marker';
import { loadMaplibre } from './BasemapView';

/**
 * A basemap under the dispatch map image (touchpoint j, D56), drawn in the
 * image's frame from its alignment. Off by default; each viewer picks a
 * basemap and the image's opacity in the TAK panel. Nothing renders for a
 * layer without a current alignment.
 */
export interface TakBasemapUnderlayProps {
  eventId: string;
  layer: Layer | undefined;
  rect: { x: number; y: number; width: number; height: number };
  container: { width: number; height: number };
  scale: number;
  setImageOpacity: (opacity: number) => void;
}

/** Re-render sharper only at these zoom steps, not on every wheel tick. */
const quantize = (scale: number) => 2 ** (Math.floor(Math.log2(Math.max(1, scale)) * 2) / 2);

export const DEFAULT_IMAGE_OPACITY = 0.7;

export default function TakBasemapUnderlay({ eventId, layer, rect, container, scale, setImageOpacity }: TakBasemapUnderlayProps) {
  const tak = useTakEvent(eventId);
  const [basemapId] = usePref<string>(PREF.underlayBasemap, NO_BASEMAP_ID);
  const [opacity] = usePref<number>(PREF.imageOpacity, DEFAULT_IMAGE_OPACITY);
  const option = resolveBasemap(basemapId, NO_BASEMAP_ID);
  const alignment = layer ? tak.alignments[layer.id] : undefined;
  const active = option.id !== NO_BASEMAP_ID && !!layer && alignmentMatches(alignment, layer.mapUrl);

  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const q = quantize(scale);
  const frame = useMemo(
    () => (active ? basemapFrame(alignment!, rect, container, q, 4096 / dpr) : null),
    // rect and container are new objects each render; compare their values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, alignment, rect.x, rect.y, rect.width, rect.height, container.width, container.height, q, dpr],
  );

  useEffect(() => {
    setImageOpacity(frame ? opacity : 1);
  }, [frame, opacity, setImageOpacity]);
  useEffect(() => () => setImageOpacity(1), [setImageOpacity]);

  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [failed, setFailed] = useState(false);
  const show = !!frame;

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    void loadMaplibre().then((ml) => {
      if (cancelled || !elRef.current) return;
      const map = new ml.Map({
        container: elRef.current,
        style: option.style,
        interactive: false,
        attributionControl: false,
        center: [0, 0],
        zoom: 1,
        fadeDuration: 0,
      });
      map.on('error', () => !map.isStyleLoaded() && setFailed(true));
      map.on('load', () => setFailed(false));
      mapRef.current = map;
      setTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The style is applied below; the map is recreated only when it is shown again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    mapRef.current?.setStyle(option.style);
  }, [option.style]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !frame) return;
    map.resize();
    map.jumpTo({ center: [frame.center.lon, frame.center.lat], zoom: frame.zoom, bearing: frame.bearing });
  }, [frame, tick]);

  if (!frame) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" data-tak-module={TAK_MODULE_MARKER} aria-hidden>
      <div
        ref={elRef}
        style={{
          // Inline position: MapLibre's stylesheet sets position: relative on the map element.
          position: 'absolute',
          left: frame.box.x,
          top: frame.box.y,
          width: frame.box.width,
          height: frame.box.height,
          transform: frame.transform,
          transformOrigin: 'center center',
          opacity: failed ? 0 : 1,
        }}
      />
    </div>
  );
}
