'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { Trash2, Undo2 } from 'lucide-react';
import { areaBounds } from '@/lib/geo/layers';
import { DEFAULT_BASEMAP_ID, validChoice } from '@/lib/geo/basemaps';
import { PREF, usePref } from '@/lib/geo/prefs';
import type { LatLon, MapArea } from '@/lib/geo/types';
import AreaVertex, { areaDraftShapes, areaVertexPins, MIN_AREA_POINTS } from './AreaVertex';
import BasemapPicker from './BasemapPicker';
import BasemapView, { type BasemapViewRequest } from './BasemapView';
import HelpTip from './HelpTip';
import PlaceSearch from './PlaceSearch';
import TutorialTip from '@/components/ui/TutorialTip';

/**
 * Draws a venue layer's area of interest on the live map (P8, D64): the
 * Map step's alternative to an image. Click points around the area, then the
 * first point's open circle to complete it (AreaVertex). Only a completed
 * area is reported and saved with the venue.
 */
export default function AreaEditor({
  area,
  onChange,
  heightClassName = 'h-[55vh] min-h-[320px]',
  tutorial = false,
  className,
}: {
  area: MapArea | undefined;
  onChange: (area: MapArea | null) => void;
  /** The map's height; e.g. "min-h-0 flex-1" with a `className` of "h-full" to fill the parent. */
  heightClassName?: string;
  /** Lite's tutorial tips, one at a time: map format, then place, then the area. */
  tutorial?: boolean;
  className?: string;
}) {
  const [points, setPoints] = useState<{ lat: number; lng: number }[]>(area?.polygon ?? []);
  const [closed, setClosed] = useState(() => (area?.polygon.length ?? 0) >= MIN_AREA_POINTS);
  const [basemapId, setBasemapId] = usePref<string>(PREF.alignBasemap, DEFAULT_BASEMAP_ID);
  const [view, setView] = useState<BasemapViewRequest | undefined>(() =>
    area && area.polygon.length >= 3 ? { key: 1, bounds: areaBounds(area) } : undefined,
  );
  const centerRef = useRef<LatLon | undefined>(undefined);
  // Tutorial progress: a picked format or place moves past its tip (so does
  // placing points, for anyone who skips ahead). A tip hides while its
  // control has focus, so it doesn't cover the open menu or search results.
  const [formatPicked, setFormatPicked] = useState(false);
  const [placePicked, setPlacePicked] = useState(false);
  const [focused, setFocused] = useState<'format' | 'search' | null>(null);
  const tutorialStep = !tutorial || closed ? 0 : points.length > 0 || placePicked ? 3 : formatPicked ? 2 : 1;

  // Report every change (not the initial area).
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const initial = useRef({ points, closed });
  useEffect(() => {
    if (points === initial.current.points && closed === initial.current.closed) return;
    changeRef.current(closed && points.length >= MIN_AREA_POINTS ? { polygon: points } : null);
  }, [points, closed]);

  // Undo reopens a completed area before it removes points.
  const undo = () => {
    if (closed) setClosed(false);
    else setPoints((p) => p.slice(0, -1));
  };
  const clear = () => {
    setClosed(false);
    setPoints([]);
  };
  const remaining = Math.max(0, MIN_AREA_POINTS - points.length);
  return (
    <div className={`flex flex-col gap-3 text-surface-light ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative" onFocusCapture={() => setFocused('format')} onBlurCapture={() => setFocused(null)}>
          <BasemapPicker
            value={validChoice(basemapId, DEFAULT_BASEMAP_ID)}
            onChange={(id) => {
              setBasemapId(id);
              setFormatPicked(true);
            }}
            omit={['none']}
          />
          {tutorialStep === 1 && focused !== 'format' && (
            <TutorialTip floating step={1} className="left-0 w-[240px]">
              Select your preferred map format.
            </TutorialTip>
          )}
        </div>
        <div className="relative flex-1" onFocusCapture={() => setFocused('search')} onBlurCapture={() => setFocused(null)}>
          <PlaceSearch
            near={() => centerRef.current}
            onPick={(r) => {
              setPlacePicked(true);
              setView((v) => ({ key: (v?.key ?? 0) + 1, ...(r.bbox ? { bounds: r.bbox } : { center: { lat: r.lat, lon: r.lon }, zoom: 17 }) }));
            }}
          />
          {tutorialStep === 2 && focused !== 'search' && (
            <TutorialTip floating step={2} className="left-0 w-[260px]">
              Enter the location you will be working from.
            </TutorialTip>
          )}
        </div>
      </div>
      {/* Status at the left and the undo/clear buttons at the right, on one line under the search box. */}
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex flex-wrap items-center gap-1 text-sm font-medium" role="status">
          {closed ? (
            `Area complete with ${points.length} points.`
          ) : points.length === 0 ? (
            'Click on the map to place the first point of the area you are working in.'
          ) : remaining > 0 ? (
            `Keep clicking around the area. ${remaining} more point${remaining === 1 ? '' : 's'} needed.`
          ) : (
            <>
              Click the open circle
              <span className="inline-flex px-0.5" aria-hidden>
                <AreaVertex color="#3eb1fd" first />
              </span>
              to complete the area.
            </>
          )}
          <HelpTip text="Find the place with the search box, then click points around the area your event covers, in order, and click the first point's open circle to complete it. The event's map is centered on this area, and you can place posts and draw zones anywhere on it." />
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="flat" startContent={<Undo2 className="h-4 w-4" />} isDisabled={!points.length} onPress={undo}>
            {closed ? 'Reopen area' : 'Undo last point'}
          </Button>
          <Button size="sm" variant="light" startContent={<Trash2 className="h-4 w-4" />} isDisabled={!points.length} onPress={clear}>
            Clear
          </Button>
        </div>
        {tutorialStep === 3 && (
          <TutorialTip floating step={3} className="left-0 w-[280px]">
            Click around the area you will be working in to outline it, then click the first point to finish.
          </TutorialTip>
        )}
      </div>
      <BasemapView
        className={`rounded-lg border border-surface-liner ${heightClassName}`}
        basemapId={validChoice(basemapId, DEFAULT_BASEMAP_ID)}
        onMapClick={closed ? undefined : (p) => setPoints((prev) => [...prev, { lat: p.lat, lng: p.lon }])}
        cursor={closed ? 'grab' : 'crosshair'}
        shapes={areaDraftShapes('area', points, '#3eb1fd', closed, 0.15)}
        pins={closed ? [] : areaVertexPins(points, '#3eb1fd', () => setClosed(true))}
        view={view}
        onCenterChange={(c) => (centerRef.current = c)}
      />
    </div>
  );
}
