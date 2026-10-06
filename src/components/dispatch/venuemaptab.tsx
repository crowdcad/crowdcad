'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete, AutocompleteItem, Button } from '@heroui/react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { Layer, Staff, Supervisor, Equipment, Call, Clinic, Post } from '@/app/types';
import { useZoomPan } from '@/hooks/useZoomPan';
import { MAP_CHECKER_BG } from '@/lib/mapStyles';
import MapZoomControls from '@/components/ui/map-zoom-controls';
import { VenueMapWithPosts, type MapOverlay } from '@/components/modals/event/venuemapmodal';

/** A request to jump to and highlight a specific team on the map. requestId
 *  must change (e.g. Date.now()) each time, including re-clicking the same
 *  team, since this tab may already be mounted and showing — a plain prop
 *  read on mount wouldn't re-fire in that case. */
export interface TeamFocusRequest {
  teamName: string;
  requestId: number;
}

/** Same as TeamFocusRequest, for a supervisor card's "view on map" button. */
export interface SupervisorFocusRequest {
  supervisorName: string;
  requestId: number;
}

/** Same as TeamFocusRequest, for an equipment card's "view on map" button — matched by name, the same identity equipment cards use elsewhere. */
export interface EquipmentFocusRequest {
  equipmentName: string;
  requestId: number;
}

interface VenueMapTabProps {
  layers: Layer[];
  staff: Staff[];
  supervisor?: Supervisor[];
  equipment: Equipment[];
  teamTimers: { [team: string]: number };
  calls: Call[];
  clinics: Clinic[];
  /** Clicking a post pin shows a small "Add Call" button under it prefilled with that location. */
  onAddCallAtPost?: (postName: string) => void;
  /** Clicking a team marker shows a small "Add Call" button under it prefilled with that team assigned. */
  onAddCallForTeam?: (teamName: string) => void;
  focusTeamRequest?: TeamFocusRequest | null;
  focusSupervisorRequest?: SupervisorFocusRequest | null;
  focusEquipmentRequest?: EquipmentFocusRequest | null;
  /** Called once a focus request above has been consumed (layer jumped, zoom
   *  reset, highlight started) so the parent can clear it. Without this, the
   *  request stays set after being handled, and since this tab unmounts
   *  whenever the user leaves the Map tab, simply navigating back to it
   *  remounts the component, re-runs the focus effect against the same
   *  stale request, and replays the highlight animation unprompted. */
  onTeamFocusHandled?: () => void;
  onSupervisorFocusHandled?: () => void;
  onEquipmentFocusHandled?: () => void;
  /** Optional add-on layer passed through to the map (see MapOverlay). */
  overlay?: MapOverlay;
}

function isCoordinatedPost(post: Post): post is { name: string; x: number; y: number } {
  return typeof post === 'object' && post !== null && typeof post.name === 'string' && typeof post.x === 'number';
}

interface SearchItem {
  key: string;
  label: string;
  layerIdx: number;
  postName: string;
}

// The dispatch board's own venue map — the Map tab beside Calls/Clinic,
// occupying the whole panel below the tab strip. Replaces the old
// click-to-open VenueMapModal so the map, layer navigation, and location
// search are always one click away instead of a full-screen overlay.
export default function VenueMapTab({
  layers,
  staff,
  supervisor = [],
  equipment,
  teamTimers,
  calls,
  clinics,
  onAddCallAtPost,
  onAddCallForTeam,
  focusTeamRequest,
  focusSupervisorRequest,
  focusEquipmentRequest,
  onTeamFocusHandled,
  onSupervisorFocusHandled,
  onEquipmentFocusHandled,
  overlay,
}: VenueMapTabProps) {
  const [currentLayer, setCurrentLayer] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [selectedPostName, setSelectedPostName] = useState<string | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(null);
  const [selectedSupervisorName, setSelectedSupervisorName] = useState<string | null>(null);
  const [selectedEquipmentName, setSelectedEquipmentName] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const {
    scale,
    position,
    isPanning,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useZoomPan({ minScale: 0.5, maxScale: 3 });

  // Clamp in case the venue's layer count shrank out from under an already-selected index.
  const safeCurrentLayer = Math.min(currentLayer, Math.max(0, layers.length - 1));
  const currentLayerData = layers[safeCurrentLayer];

  // The attention arrow on a search result fades on its own rather than
  // sticking around until something else clears it.
  useEffect(() => {
    if (!selectedPostName) return;
    const timeout = setTimeout(() => setSelectedPostName(null), 4000);
    return () => clearTimeout(timeout);
  }, [selectedPostName]);

  useEffect(() => {
    if (!selectedTeamName) return;
    const timeout = setTimeout(() => setSelectedTeamName(null), 4000);
    return () => clearTimeout(timeout);
  }, [selectedTeamName]);

  useEffect(() => {
    if (!selectedSupervisorName) return;
    const timeout = setTimeout(() => setSelectedSupervisorName(null), 4000);
    return () => clearTimeout(timeout);
  }, [selectedSupervisorName]);

  useEffect(() => {
    if (!selectedEquipmentName) return;
    const timeout = setTimeout(() => setSelectedEquipmentName(null), 4000);
    return () => clearTimeout(timeout);
  }, [selectedEquipmentName]);

  // A team card's "view on map" button. requestId (not just the team name)
  // is the dependency so re-clicking the same team while this tab is
  // already open still re-triggers the jump/highlight.
  useEffect(() => {
    if (!focusTeamRequest) return;
    const team = staff.find((s) => s.team === focusTeamRequest.teamName);
    const location = team?.location;
    if (location) {
      const layerIdx = layers.findIndex((layer) =>
        (layer.posts || []).some((post) => isCoordinatedPost(post) && post.name === location)
      );
      if (layerIdx >= 0) setCurrentLayer(layerIdx);
    }
    setSelectedTeamName(focusTeamRequest.teamName);
    resetZoom();
    onTeamFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTeamRequest?.requestId]);

  // Same as the team focus effect above, for a supervisor card's "view on map" button.
  useEffect(() => {
    if (!focusSupervisorRequest) return;
    const sup = supervisor.find((s) => s.team === focusSupervisorRequest.supervisorName);
    const location = sup?.location;
    if (location) {
      const layerIdx = layers.findIndex((layer) =>
        (layer.posts || []).some((post) => isCoordinatedPost(post) && post.name === location)
      );
      if (layerIdx >= 0) setCurrentLayer(layerIdx);
    }
    setSelectedSupervisorName(focusSupervisorRequest.supervisorName);
    resetZoom();
    onSupervisorFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSupervisorRequest?.requestId]);

  // Same as the team focus effect above, for an equipment card's "view on map" button.
  useEffect(() => {
    if (!focusEquipmentRequest) return;
    const equip = equipment.find((e) => e.name === focusEquipmentRequest.equipmentName);
    const location = equip?.location;
    if (location) {
      const layerIdx = layers.findIndex((layer) =>
        (layer.posts || []).some((post) => isCoordinatedPost(post) && post.name === location)
      );
      if (layerIdx >= 0) setCurrentLayer(layerIdx);
    }
    setSelectedEquipmentName(focusEquipmentRequest.equipmentName);
    resetZoom();
    onEquipmentFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusEquipmentRequest?.requestId]);

  const searchItems = useMemo(() => {
    const items: SearchItem[] = [];
    layers.forEach((layer, layerIdx) => {
      (layer.posts || []).forEach((post) => {
        if (!isCoordinatedPost(post)) return;
        items.push({
          key: `${layerIdx}::${post.name}`,
          label: layers.length > 1 ? `${post.name} (${layer.name})` : post.name,
          layerIdx,
          postName: post.name,
        });
      });
    });
    return items;
  }, [layers]);

  const goToLayer = (idx: number) => {
    setCurrentLayer(idx);
    setSelectedPostName(null);
    resetZoom();
  };

  const handleSelectLocation = (key: React.Key | null) => {
    if (!key) return;
    const item = searchItems.find((i) => i.key === key);
    if (!item) return;
    setCurrentLayer(item.layerIdx);
    setSelectedPostName(item.postName);
    resetZoom();
    setSearchInput('');
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        {layers.length > 1 ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              isIconOnly
              size="sm"
              radius="full"
              variant="flat"
              isDisabled={safeCurrentLayer <= 0}
              onPress={() => goToLayer(safeCurrentLayer - 1)}
              aria-label="Previous layer"
              title="Previous layer"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[110px] truncate text-center text-sm font-medium text-surface-light">
              {currentLayerData?.name || 'Venue Map'}
            </span>
            <Button
              isIconOnly
              size="sm"
              radius="full"
              variant="flat"
              isDisabled={safeCurrentLayer >= layers.length - 1}
              onPress={() => goToLayer(safeCurrentLayer + 1)}
              aria-label="Next layer"
              title="Next layer"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <span className="shrink-0 text-sm font-medium text-surface-light">
            {currentLayerData?.name || 'Venue Map'}
          </span>
        )}

        <div className="ml-auto w-full max-w-xs">
          <Autocomplete
            aria-label="Search locations"
            placeholder="Find a location..."
            size="sm"
            startContent={<Search className="h-4 w-4 text-surface-faint" />}
            inputValue={searchInput}
            onInputChange={setSearchInput}
            onSelectionChange={handleSelectLocation}
            classNames={{
              base: 'min-w-0 data-[focus-visible=true]:outline-none data-[focus=true]:outline-none',
              // See teamcard.tsx's Location Autocomplete for why: HeroUI's
              // clear (x) button reserves real flex width next to the input
              // even while invisible pre-hover, cutting text off well short
              // of the dropdown chevron. Overlaying it instead frees that
              // space for text.
              clearButton: 'absolute end-6 top-1/2 -translate-y-1/2',
            }}
            inputProps={{
              classNames: {
                inputWrapper:
                  'bg-surface-deep text-surface-light border border-surface-liner rounded-full group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0 data-[focus-visible=true]:ring-0 data-[focus-visible=true]:ring-offset-0 focus-within:ring-0 focus:ring-0',
                input: 'bg-surface-deep text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none pe-0 !pe-0 data-[has-end-content=true]:pe-0 group-data-[has-end-content=true]:pe-0',
              },
            }}
          >
            {searchItems.map((item) => (
              <AutocompleteItem key={item.key}>{item.label}</AutocompleteItem>
            ))}
          </Autocomplete>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg" style={MAP_CHECKER_BG}>
        <VenueMapWithPosts
          layers={layers}
          currentLayer={safeCurrentLayer}
          staff={staff}
          supervisor={supervisor}
          equipment={equipment}
          teamTimers={teamTimers}
          calls={calls}
          clinics={clinics}
          scale={scale}
          position={position}
          isPanning={isPanning}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          imgRef={imgRef}
          imageRadiusClassName="rounded-lg"
          selectedPostName={selectedPostName}
          selectedTeamName={selectedTeamName}
          selectedSupervisorName={selectedSupervisorName}
          selectedEquipmentName={selectedEquipmentName}
          onAddCallAtPost={onAddCallAtPost}
          onAddCallForTeam={onAddCallForTeam}
          overlay={overlay}
        />
        <MapZoomControls onZoomIn={() => zoomIn(0.25)} onZoomOut={() => zoomOut(0.25)} onReset={resetZoom} />
      </div>
    </div>
  );
}
