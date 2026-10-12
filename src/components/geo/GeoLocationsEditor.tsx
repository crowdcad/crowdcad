'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { Layer, Post, Zone } from '@/app/types';
import { randomId } from '@/lib/utils';
import { getNextZoneColor } from '@/lib/zoneColors';
import type { LatLng } from '@/lib/geo/positions';
import MarkerModeToggleButton from '@/components/venue-management/MarkerModeToggleButton';
import AreaModeToggleButton from '@/components/venue-management/AreaModeToggleButton';
import PendingMarkerDialog from '@/components/venue-management/PendingMarkerDialog';
import PendingZoneDialog from '@/components/venue-management/PendingZoneDialog';
import { MIN_AREA_POINTS } from './AreaVertex';
import TutorialTip from '@/components/ui/TutorialTip';
import GeoLayerMap from './GeoLayerMap';

type PostObject = Exclude<Post, string>;

/**
 * Places locations and draws areas on a geo layer with no image (Lite mode's
 * map), with the same controls, dialogs and area drawing (AreaVertex) as venue
 * setup's Locations step. The caller keeps the layer; this reports additions.
 * The marker/area buttons head a side column (under `heading`, above
 * `children`, e.g. the location list), so the map fills the height beside it.
 */
export default function GeoLocationsEditor({
  layer,
  onAddPost,
  onMovePost,
  onAddZone,
  heading,
  children,
  tutorial = false,
  className,
}: {
  layer: Layer;
  /** Returns an error to show (e.g. a duplicate name), or null once added. */
  onAddPost: (post: PostObject) => string | null;
  onMovePost: (postIdx: number, p: LatLng) => void;
  /** Returns an error to show, or null once added. */
  onAddZone: (zone: Zone) => string | null;
  heading?: React.ReactNode;
  children?: React.ReactNode;
  /** Lite's tutorial tips: add a marker, then optionally an area. */
  tutorial?: boolean;
  className?: string;
}) {
  const [mode, setMode] = useState<'none' | 'marker' | 'area'>('none');
  const [pendingMarker, setPendingMarker] = useState<LatLng | null>(null);
  const [markerName, setMarkerName] = useState('');
  const [markerIsClinic, setMarkerIsClinic] = useState(false);
  const markerInputRef = useRef<HTMLInputElement | null>(null);

  const [pendingZone, setPendingZone] = useState<{ coords: LatLng[]; isDrawing: boolean } | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [zoneColor, setZoneColor] = useState('');
  const [zoneIsDispatch, setZoneIsDispatch] = useState(false);
  const zoneInputRef = useRef<HTMLInputElement | null>(null);

  const cancelMarker = () => {
    setPendingMarker(null);
    setMarkerName('');
    setMarkerIsClinic(false);
  };
  const cancelZone = () => {
    setPendingZone(null);
    setZoneName('');
    setZoneColor('');
    setZoneIsDispatch(false);
  };

  useEffect(() => {
    if (pendingMarker) markerInputRef.current?.focus();
  }, [pendingMarker]);
  useEffect(() => {
    if (pendingZone && !pendingZone.isDrawing) zoneInputRef.current?.focus();
  }, [pendingZone]);

  // Escape cancels an area being drawn; only the open circle completes one.
  useEffect(() => {
    if (!pendingZone) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelZone();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingZone]);

  const handleMapClick = (p: LatLng) => {
    if (mode === 'area') {
      if (!pendingZone) {
        setZoneColor(getNextZoneColor(layer.zones || []));
        setPendingZone({ coords: [p], isDrawing: true });
      } else if (pendingZone.isDrawing) {
        setPendingZone({ ...pendingZone, coords: [...pendingZone.coords, p] });
      }
      return;
    }
    if (mode === 'marker' && !pendingMarker) setPendingMarker(p);
  };

  const confirmMarker = () => {
    if (!pendingMarker) return;
    const name = markerName.trim();
    if (!name) {
      cancelMarker();
      return;
    }
    const error = onAddPost({
      name,
      x: null,
      y: null,
      lat: pendingMarker.lat,
      lng: pendingMarker.lng,
      ...(markerIsClinic ? { isClinic: true, clinicId: randomId() } : {}),
    });
    if (error) {
      alert(error);
      return;
    }
    cancelMarker();
  };

  const confirmZone = () => {
    if (!pendingZone) return;
    const name = zoneName.trim();
    if (!name || pendingZone.coords.length < MIN_AREA_POINTS) {
      cancelZone();
      return;
    }
    const error = onAddZone({
      id: randomId(),
      name,
      color: zoneColor || getNextZoneColor(layer.zones || []),
      points: [],
      coords: pendingZone.coords,
      isDispatchZone: zoneIsDispatch,
    });
    if (error) {
      alert(error);
      return;
    }
    cancelZone();
  };

  const count = pendingZone?.coords.length ?? 0;
  const hint =
    mode === 'marker'
      ? 'Click anywhere on the map to place a location. Drag a location to move it.'
      : mode === 'area'
        ? !pendingZone
          ? "Click on the map to place the area's first point."
          : !pendingZone.isDrawing
            ? ''
            : count >= MIN_AREA_POINTS
              ? `${count} points placed. Click the open circle at the first point to complete the area.`
              : `${count} point${count === 1 ? '' : 's'} placed. Add at least ${MIN_AREA_POINTS - count} more, then click the open circle to complete the area.`
        : 'Drag a location to move it.';

  const tutorialTip = !tutorial
    ? null
    : layer.posts.length === 0
      ? <TutorialTip className="top-full mt-2 inset-x-0 max-w-none" arrowClassName="left-[calc(25%-10px)]">Add a location marker to the map.</TutorialTip>
      : (layer.zones ?? []).length === 0
        ? <TutorialTip className="top-full mt-2 inset-x-0 max-w-none" arrowClassName="right-[calc(25%-10px)]">Optionally, label different areas of your map.</TutorialTip>
        : null;

  return (
    <div className={`flex gap-4 ${className ?? ''}`}>
      <div className="flex w-[320px] flex-shrink-0 flex-col min-h-0">
        {heading}
        <div className="relative grid flex-shrink-0 grid-cols-2 gap-2">
          <MarkerModeToggleButton
            className="w-full"
            isAddMarkerMode={mode === 'marker'}
            onToggle={() => {
              cancelZone();
              setMode(mode === 'marker' ? 'none' : 'marker');
            }}
          />
          <AreaModeToggleButton
            className="w-full"
            isAddAreaMode={mode === 'area'}
            onToggle={() => {
              cancelMarker();
              cancelZone();
              setMode(mode === 'area' ? 'none' : 'area');
            }}
          />
          {tutorialTip}
        </div>
        {hint && <p className="flex-shrink-0 pt-2 pb-3 text-xs leading-snug text-surface-faint">{hint}</p>}
        {children}
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-sm">
        <GeoLayerMap
          className="absolute inset-0"
          layer={layer}
          onMapClick={mode !== 'none' ? handleMapClick : undefined}
          cursor={mode !== 'none' ? 'crosshair' : 'grab'}
          onPostMove={onMovePost}
          draftZone={
            pendingZone
              ? { coords: pendingZone.coords, color: zoneColor || '#3eb1fd', closed: !pendingZone.isDrawing, onClose: () => setPendingZone((z) => (z ? { ...z, isDrawing: false } : z)) }
              : null
          }
          extraPins={
            pendingMarker
              ? [{ key: 'pending-post', lat: pendingMarker.lat, lng: pendingMarker.lng, anchor: 'bottom', node: <MapPin className="h-6 w-6 animate-pulse text-accent drop-shadow" /> }]
              : []
          }
        />
        {pendingMarker && (
          <PendingMarkerDialog
            markerNameInput={markerName}
            markerInputRef={markerInputRef}
            setMarkerNameInput={setMarkerName}
            markerIsClinicInput={markerIsClinic}
            setMarkerIsClinicInput={setMarkerIsClinic}
            onConfirm={confirmMarker}
            onCancel={cancelMarker}
          />
        )}
        {pendingZone && !pendingZone.isDrawing && (
          <PendingZoneDialog
            zoneNameInput={zoneName}
            zoneNameInputRef={zoneInputRef}
            setZoneNameInput={setZoneName}
            zoneColorInput={zoneColor}
            setZoneColorInput={setZoneColor}
            zoneIsDispatchZoneInput={zoneIsDispatch}
            setZoneIsDispatchZoneInput={setZoneIsDispatch}
            onConfirm={confirmZone}
            onCancel={cancelZone}
          />
        )}
      </div>
    </div>
  );
}
