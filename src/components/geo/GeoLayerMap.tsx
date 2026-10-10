'use client';

import React, { useMemo, useState } from 'react';
import { Hospital, MapPin } from 'lucide-react';
import type { Layer } from '@/app/types';
import { imageCorners } from '@/lib/geo/basemapFrame';
import { DEFAULT_BASEMAP_ID, validChoice } from '@/lib/geo/basemaps';
import { areaBounds, layerAlignment, layerArea } from '@/lib/geo/layers';
import { boundsOf, postLatLng, zoneLatLngs, type LatLng } from '@/lib/geo/positions';
import { PREF, usePref } from '@/lib/geo/prefs';
import BasemapToolbar from './BasemapToolbar';
import BasemapView, { type BasemapViewRequest, type GeoPin, type GeoShape } from './BasemapView';

const DEFAULT_GEO_IMAGE_OPACITY = 0.7;

/** The basemap choice and, for an aligned layer, the image's opacity: for a toolbar above the map. */
export function GeoLayerMapControls({ layer }: { layer: Layer }) {
  const [basemapId, setBasemapId] = usePref<string>(PREF.alignBasemap, DEFAULT_BASEMAP_ID);
  const [opacity, setOpacity] = usePref<number>(PREF.imageOpacity, DEFAULT_GEO_IMAGE_OPACITY);
  const aligned = !!layerAlignment(layer) && !!layer.mapUrl;
  return (
    <BasemapToolbar
      value={validChoice(basemapId, DEFAULT_BASEMAP_ID)}
      onChange={setBasemapId}
      omit={['none']}
      opacity={aligned ? opacity : undefined}
      onOpacityChange={setOpacity}
    />
  );
}

/**
 * A venue layer on the live map (P8, D64): the layer's image warped onto the
 * real map when it is aligned, a drawn area's outline, posts as pins and
 * zones as shapes, all by coordinates. Used by venue setup's Locations step,
 * read-only map panels and the dispatch live map.
 */
export interface GeoLayerMapProps {
  /** The layer to show (with a just-chosen image's preview URL as mapUrl). */
  layer: Layer;
  className?: string;
  /** Clicks on the map (placing a post, drawing a zone). */
  onMapClick?: (p: LatLng) => void;
  /** Makes posts draggable. */
  onPostMove?: (postIdx: number, p: LatLng) => void;
  onPostClick?: (postIdx: number) => void;
  /** A zone being drawn. */
  draftZone?: { coords: LatLng[]; color: string } | null;
  /** More pins (team and equipment markers on the dispatch map). */
  extraPins?: GeoPin[];
  /** Name of a post to call out. */
  selectedPostName?: string | null;
  cursor?: 'crosshair' | 'grab';
  /** Content above the map (panels, badges). */
  children?: React.ReactNode;
  /** Show the basemap and image-opacity controls. */
  showControls?: boolean;
  /** Draw the layer's posts as simple pins (off where the caller draws its own post markers). */
  showPosts?: boolean;
  /** Fly to a position; change `key` to fly again. */
  focus?: { key: number; lat: number; lng: number } | null;
}

export default function GeoLayerMap({
  layer,
  className,
  onMapClick,
  onPostMove,
  onPostClick,
  draftZone,
  extraPins,
  selectedPostName,
  cursor = 'grab',
  children,
  showControls = true,
  showPosts = true,
  focus,
}: GeoLayerMapProps) {
  const [basemapId] = usePref<string>(PREF.alignBasemap, DEFAULT_BASEMAP_ID);
  const [opacity] = usePref<number>(PREF.imageOpacity, DEFAULT_GEO_IMAGE_OPACITY);
  const alignment = layerAlignment(layer);
  const area = layerArea(layer);

  // Fit the view once per layer: to the image, the drawn area, or the posts.
  const fitKey = `${layer.id}:${layer.mapUrl ?? ''}:${alignment?.updatedAt ?? ''}:${area ? area.polygon.length : 0}`;
  const [view, setView] = useState<{ key: string; req: BasemapViewRequest } | null>(null);
  if (!view || view.key !== fitKey) {
    let bounds: [number, number, number, number] | null = null;
    if (alignment) bounds = boundsOf(imageCorners(alignment).map((c) => ({ lat: c.lat, lng: c.lon })));
    else if (area) bounds = areaBounds(area);
    else bounds = boundsOf(layer.posts.flatMap((p) => postLatLng(p, layer) ?? []));
    if (bounds) setView({ key: fitKey, req: { key: (view?.req.key ?? 0) + 1, bounds } });
  }

  const shapes = useMemo<GeoShape[]>(() => {
    const out: GeoShape[] = [];
    if (area) out.push({ id: 'area', coords: area.polygon, color: '#3eb1fd', closed: true, fillOpacity: 0.04, dashed: true });
    for (const zone of layer.zones ?? []) {
      const coords = zoneLatLngs(zone, layer);
      if (coords) out.push({ id: zone.id, coords, color: zone.color, closed: true, fillOpacity: 0.2 });
    }
    if (draftZone?.coords.length) out.push({ id: 'draft', coords: draftZone.coords, color: draftZone.color, closed: false });
    return out;
  }, [area, layer, draftZone]);

  // A focus request overrides the fitted view until the layer changes.
  const focusView: BasemapViewRequest | undefined = focus ? { key: 100_000 + focus.key, center: { lat: focus.lat, lon: focus.lng }, zoom: 18 } : undefined;

  const postPins: GeoPin[] = !showPosts ? [] : layer.posts.flatMap((post, idx) => {
    if (typeof post === 'string' || !post.name) return [];
    const at = postLatLng(post, layer);
    if (!at) return [];
    const selected = selectedPostName === post.name;
    const Icon = post.isClinic ? Hospital : MapPin;
    return [
      {
        key: `post:${idx}:${post.name}`,
        lat: at.lat,
        lng: at.lng,
        anchor: 'bottom' as const,
        onDragEnd: onPostMove ? (p: LatLng) => onPostMove(idx, p) : undefined,
        node: (
          <button
            type="button"
            className="flex flex-col items-center"
            onClick={(e) => {
              e.stopPropagation();
              onPostClick?.(idx);
            }}
            title={post.name}
          >
            <span
              className={`whitespace-nowrap rounded px-1 text-[11px] font-medium shadow ${
                selected ? 'bg-accent text-surface-light' : 'bg-surface-deepest/90 text-surface-light'
              }`}
            >
              {post.name}
            </span>
            <Icon className={`h-6 w-6 drop-shadow ${post.isClinic ? 'text-status-red' : 'text-status-blue'} ${selected ? 'animate-bounce' : ''}`} />
          </button>
        ),
      },
    ];
  });

  return (
    <BasemapView
      className={className}
      basemapId={validChoice(basemapId, DEFAULT_BASEMAP_ID)}
      onMapClick={onMapClick ? (p) => onMapClick({ lat: p.lat, lng: p.lon }) : undefined}
      cursor={cursor}
      image={alignment && layer.mapUrl ? { url: layer.mapUrl, corners: imageCorners(alignment), opacity } : null}
      shapes={shapes}
      pins={[...postPins, ...(extraPins ?? [])]}
      view={focusView && (!view || focusView.key > view.req.key) ? focusView : view?.req}
    >
      {showControls && (
        <div className="absolute left-2 top-2 z-10">
          <GeoLayerMapControls layer={layer} />
        </div>
      )}
      {children}
    </BasemapView>
  );
}
