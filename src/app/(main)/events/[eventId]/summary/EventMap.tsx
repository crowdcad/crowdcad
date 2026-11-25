'use client';

import React, { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button, Checkbox } from '@heroui/react';
import type { Event } from '@/app/types';
import type { SummaryMapLayer } from '@/extensions/types';
import { useZoomPan } from '@/hooks/useZoomPan';
import { MAP_CHECKER_BG } from '@/lib/mapStyles';
import { getEventVenueLayers } from '@/lib/zones';
import { isGeoLayer } from '@/lib/geo/layers';
import { callSpots, unplacedCallCount } from '@/lib/callMap';
import MapZoomControls from '@/components/ui/map-zoom-controls';
import { VenueMapWithPosts, type MapOverlay } from '@/components/modals/event/venuemapmodal';

// The live map, loaded only when the venue has a geo layer.
const GeoVenueMap = dynamic(() => import('@/components/dispatch/GeoVenueMap'), { ssr: false });

const NO_TIMERS: Record<string, number> = {};
const CALLS = 'calls';

/**
 * The event's venue map, for every event with one, with a checkbox per layer
 * of data on it: every call (#94), closed ones included, with the dispatch
 * map's call markers (calls at one place share a marker with a count), and
 * the layers extension packs add (`mapLayers`, e.g. TAK's heat map). Calls
 * that name no venue location and have no pin can't be placed; they are
 * counted under the map.
 */
export default function EventMap({ event, extraLayers = [], className }: { event: Event; extraLayers?: SummaryMapLayer[]; className?: string }) {
  const layers = useMemo(() => getEventVenueLayers(event), [event]);
  const calls = event.calls;
  // Layers with a map, with how many calls each shows, most first.
  const maps = useMemo(
    () =>
      layers
        .map((layer, index) => ({ layer, index, count: callSpots(calls, layer, isGeoLayer(layer)).reduce((n, s) => n + s.calls.length, 0) }))
        .filter((l) => isGeoLayer(l.layer) || !!l.layer.mapUrl)
        .sort((a, b) => b.count - a.count),
    [layers, calls]
  );
  const [picked, setPicked] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const current = maps.find((l) => l.index === picked) ?? maps[0];
  const unplaced = unplacedCallCount(calls, layers);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const zoom = useZoomPan({ minScale: 0.5, maxScale: 3 });

  const options = [...(calls.length ? [{ id: CALLS, label: 'Call locations' }] : []), ...extraLayers];
  const shownLayers = extraLayers.filter((l) => !hidden.has(l.id));
  const showCalls = calls.length > 0 && !hidden.has(CALLS);
  const overlay = useMemo<MapOverlay | undefined>(() => {
    const withMarkers = shownLayers.filter((l) => l.overlay?.markers);
    if (!withMarkers.length) return undefined;
    return { markers: (ctx) => withMarkers.map((l) => <React.Fragment key={l.id}>{l.overlay!.markers!(ctx)}</React.Fragment>) };
  }, [shownLayers]);
  const heat = useMemo(() => shownLayers.flatMap((l) => l.heat ?? []), [shownLayers]);

  if (!current) return null;

  const toggle = (id: string, on: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={className} data-testid="summary-event-map">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <span className="font-semibold">Event map</span>
          {showCalls && (
            <div className="text-sm text-surface-faint">
              {calls.length - unplaced} of {calls.length} call{calls.length === 1 ? '' : 's'} on the map. Hover a marker for its calls.
            </div>
          )}
        </div>
        {maps.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {maps.map((l) => (
              <Button
                key={l.layer.id}
                size="sm"
                variant={l.index === current.index ? 'solid' : 'flat'}
                color={l.index === current.index ? 'primary' : 'default'}
                onPress={() => {
                  setPicked(l.index);
                  zoom.resetZoom();
                }}
              >
                {l.layer.name}
                {calls.length > 0 && ` (${l.count})`}
              </Button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2 px-4 pb-4">
        {options.length > 0 && (
          <div className="flex flex-wrap gap-4">
            {options.map((o) => (
              <Checkbox key={o.id} size="sm" isSelected={!hidden.has(o.id)} onValueChange={(on) => toggle(o.id, on)} data-testid={`summary-map-layer-${o.id}`}>
                {o.label}
              </Checkbox>
            ))}
          </div>
        )}
        {isGeoLayer(current.layer) ? (
          <div className="relative h-[60vh] min-h-[320px] overflow-hidden border border-surface-liner">
            <GeoVenueMap
              className="absolute inset-0"
              layer={current.layer}
              layerIndex={current.index}
              staff={[]}
              supervisor={[]}
              equipment={[]}
              teamTimers={NO_TIMERS}
              calls={calls}
              clinics={[]}
              showCalls={showCalls ? 'all' : false}
              heat={heat}
            />
          </div>
        ) : (
          <div className="relative h-[60vh] min-h-[320px] overflow-hidden border border-surface-liner" style={MAP_CHECKER_BG}>
            <VenueMapWithPosts
              layers={layers}
              currentLayer={current.index}
              staff={[]}
              teamTimers={NO_TIMERS}
              calls={calls}
              scale={zoom.scale}
              position={zoom.position}
              isPanning={zoom.isPanning}
              onMouseDown={zoom.handleMouseDown}
              onMouseMove={zoom.handleMouseMove}
              onMouseUp={zoom.handleMouseUp}
              onWheel={zoom.handleWheel}
              onTouchStart={zoom.handleTouchStart}
              onTouchMove={zoom.handleTouchMove}
              onTouchEnd={zoom.handleTouchEnd}
              imgRef={imgRef}
              imageRadiusClassName="rounded-none"
              isOpen
              showCalls={showCalls ? 'all' : false}
              overlay={overlay}
            />
            <MapZoomControls onZoomIn={() => zoom.zoomIn(0.25)} onZoomOut={() => zoom.zoomOut(0.25)} onReset={zoom.resetZoom} />
          </div>
        )}
        {shownLayers.map((l) => (l.legend ? <React.Fragment key={l.id}>{l.legend}</React.Fragment> : null))}
        {showCalls && unplaced > 0 && (
          <p className="text-sm text-surface-faint" data-testid="summary-calls-unplaced">
            {unplaced} call{unplaced === 1 ? '' : 's'} without a map position (a location that isn&apos;t on the venue map, and no dropped pin).
          </p>
        )}
      </div>
    </div>
  );
}
