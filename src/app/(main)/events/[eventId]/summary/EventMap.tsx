'use client';

import React, { useMemo, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { Layers, Map as MapIcon, Users } from 'lucide-react';
import type { Event } from '@/app/types';
import type { SummaryMapLayer } from '@/extensions/types';
import { useZoomPan } from '@/hooks/useZoomPan';
import { MAP_CHECKER_BG } from '@/lib/mapStyles';
import { getEventVenueLayers } from '@/lib/zones';
import { isGeoLayer } from '@/lib/geo/layers';
import { basemapChoices, DEFAULT_BASEMAP_ID, validChoice } from '@/lib/geo/basemaps';
import { PREF, usePref } from '@/lib/geo/prefs';
import { callDisplayNumbers, callSpots, callsOfTeam, unplacedCallCount } from '@/lib/callMap';
import MapZoomControls from '@/components/ui/map-zoom-controls';
import { VenueMapWithPosts, type MapOverlay } from '@/components/modals/event/venuemapmodal';

// The live map, loaded only when the venue has a geo layer.
const GeoVenueMap = dynamic(() => import('@/components/dispatch/GeoVenueMap'), { ssr: false });

const NO_TIMERS: Record<string, number> = {};
const CALLS = 'calls';
const LOCATIONS = 'locations';
const ALL_TEAMS = '__all__';

/** What's behind an image map (a real map has a basemap instead). */
const IMAGE_BACKDROPS: { id: string; label: string; style: CSSProperties }[] = [
  { id: 'checker', label: 'Checkered', style: MAP_CHECKER_BG },
  { id: 'system', label: 'System', style: { backgroundColor: 'hsl(var(--surface-bg-1))' } },
  { id: 'light', label: 'Light', style: { backgroundColor: '#ffffff' } },
  { id: 'dark', label: 'Dark', style: { backgroundColor: '#1b1d22' } },
];

/**
 * The event's venue map, for every event with one (#94): every call, closed
 * ones included, with the dispatch map's call markers (calls at one place
 * share a marker with a count), the venue's locations, and the layers
 * extension packs add (`mapLayers`, e.g. a live-tracking heat map). Buttons opposite
 * the title pick the backdrop, what the map shows, and one team (only its
 * calls and its own layer data, `forTeam`). Calls that name no venue
 * location and have no pin can't be placed; they are counted under the map.
 */
export default function EventMap({ event, extraLayers = [], className }: { event: Event; extraLayers?: SummaryMapLayer[]; className?: string }) {
  const layers = useMemo(() => getEventVenueLayers(event), [event]);
  const [team, setTeam] = useState<string | null>(null);
  const teams = useMemo(() => [...new Set([...(event.staff ?? []), ...(event.supervisor ?? [])].map((u) => u.team).filter(Boolean))], [event.staff, event.supervisor]);
  const calls = useMemo(() => (team ? callsOfTeam(event.calls, team) : event.calls), [event.calls, team]);
  // Calls keep their numbers when a team leaves only some on the map.
  const callNumbers = useMemo(() => callDisplayNumbers(event.calls), [event.calls]);
  const packLayers = useMemo(
    () => (team ? extraLayers.flatMap((l) => (l.forTeam ? (l.forTeam(team) ?? []) : [l])) : extraLayers),
    [extraLayers, team]
  );
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
  const [basemapId, setBasemapId] = usePref<string>(PREF.alignBasemap, DEFAULT_BASEMAP_ID);
  const [imageBackdrop, setImageBackdrop] = useState(IMAGE_BACKDROPS[0]!.id);
  const current = maps.find((l) => l.index === picked) ?? maps[0];
  const unplaced = unplacedCallCount(calls, layers);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const zoom = useZoomPan({ minScale: 0.5, maxScale: 3 });

  // Extension layers are listed even when the team filter leaves them empty, so the menu doesn't jump.
  const options = [
    ...(event.calls.length ? [{ id: CALLS, label: 'Calls' }] : []),
    { id: LOCATIONS, label: 'Locations' },
    ...extraLayers.map(({ id, label }) => ({ id, label })),
  ];
  const shownLayers = packLayers.filter((l) => !hidden.has(l.id));
  const showCalls = calls.length > 0 && !hidden.has(CALLS);
  const showLocations = !hidden.has(LOCATIONS);
  const overlay = useMemo<MapOverlay | undefined>(() => {
    const withMarkers = shownLayers.filter((l) => l.overlay?.markers);
    if (!withMarkers.length) return undefined;
    return { markers: (ctx) => withMarkers.map((l) => <React.Fragment key={l.id}>{l.overlay!.markers!(ctx)}</React.Fragment>) };
  }, [shownLayers]);
  const heat = useMemo(() => shownLayers.flatMap((l) => l.heat ?? []), [shownLayers]);

  if (!current) return null;

  const geo = isGeoLayer(current.layer);
  const backdrops = geo ? basemapChoices() : IMAGE_BACKDROPS;
  const backdrop = geo ? validChoice(basemapId, DEFAULT_BASEMAP_ID) : imageBackdrop;
  const imageStyle = IMAGE_BACKDROPS.find((b) => b.id === imageBackdrop)?.style ?? MAP_CHECKER_BG;
  const shownIds = options.filter((o) => !hidden.has(o.id)).map((o) => o.id);

  return (
    <div className={className} data-testid="summary-event-map">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
        <div>
          <span className="font-semibold">Event map</span>
          {showCalls && (
            <div className="text-sm text-surface-faint">
              {calls.length - unplaced} of {calls.length} call{calls.length === 1 ? '' : 's'} on the map. Hover a marker for its calls.
            </div>
          )}
          {team && !calls.length && <div className="text-sm text-surface-faint">{team} worked no calls.</div>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {maps.length > 1 &&
            maps.map((l) => (
              <Button
                key={l.layer.id}
                size="sm"
                radius="lg"
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
          <Dropdown>
            <DropdownTrigger>
              <Button isIconOnly size="sm" radius="lg" variant="flat" aria-label="Backdrop" title="Backdrop" data-testid="summary-map-backdrop">
                <MapIcon className="h-4 w-4" />
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Backdrop"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={new Set([backdrop])}
              onSelectionChange={(keys) => {
                const id = Array.from(keys as Set<string>)[0];
                if (!id) return;
                if (geo) setBasemapId(id);
                else setImageBackdrop(id);
              }}
            >
              {backdrops.map((b) => (
                <DropdownItem key={b.id} data-testid={`summary-map-backdrop-${b.id}`}>
                  {b.label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
          <Dropdown>
            <DropdownTrigger>
              <Button isIconOnly size="sm" radius="lg" variant="flat" aria-label="Show on map" title="Show on map" className={hidden.size ? 'text-accent' : ''} data-testid="summary-map-show">
                <Layers className="h-4 w-4" />
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Show on map"
              selectionMode="multiple"
              closeOnSelect={false}
              selectedKeys={new Set(shownIds)}
              onSelectionChange={(keys) => {
                const shown = keys === 'all' ? new Set(options.map((o) => o.id)) : new Set(Array.from(keys as Set<string>));
                setHidden(new Set(options.filter((o) => !shown.has(o.id)).map((o) => o.id)));
              }}
            >
              {options.map((o) => (
                <DropdownItem key={o.id} data-testid={`summary-map-layer-${o.id}`}>
                  {o.label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
          {teams.length > 0 && (
            <Dropdown>
              <DropdownTrigger>
                <Button
                  size="sm"
                  radius="lg"
                  variant="flat"
                  isIconOnly={!team}
                  aria-label={team ? `Team: ${team}` : 'Team'}
                  title="Team"
                  className={team ? 'text-accent' : ''}
                  startContent={team ? <Users className="h-4 w-4" /> : undefined}
                  data-testid="summary-map-team"
                >
                  {team ?? <Users className="h-4 w-4" />}
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Team"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={new Set([team ?? ALL_TEAMS])}
                onSelectionChange={(keys) => {
                  const id = Array.from(keys as Set<string>)[0];
                  setTeam(!id || id === ALL_TEAMS ? null : id);
                }}
                items={[{ id: ALL_TEAMS, label: 'All teams' }, ...teams.map((t) => ({ id: t, label: t }))]}
              >
                {(t) => (
                  <DropdownItem key={t.id} data-testid={`summary-map-team-${t.id === ALL_TEAMS ? 'all' : t.id}`}>
                    {t.label}
                  </DropdownItem>
                )}
              </DropdownMenu>
            </Dropdown>
          )}
        </div>
      </div>
      <div className="space-y-2 px-4 pb-4">
        {geo ? (
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
              callNumbers={callNumbers}
              showPostPins={showLocations}
              heat={heat}
            />
          </div>
        ) : (
          <div className="relative h-[60vh] min-h-[320px] overflow-hidden border border-surface-liner" style={imageStyle}>
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
              callNumbers={callNumbers}
              showPostPins={showLocations}
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
