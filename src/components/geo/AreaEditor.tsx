'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { Trash2, Undo2 } from 'lucide-react';
import { areaBounds } from '@/lib/geo/layers';
import { DEFAULT_BASEMAP_ID, validChoice } from '@/lib/geo/basemaps';
import { PREF, usePref } from '@/lib/geo/prefs';
import type { LatLon, MapArea } from '@/lib/geo/types';
import BasemapPicker from './BasemapPicker';
import BasemapView, { type BasemapViewRequest } from './BasemapView';
import HelpTip from './HelpTip';
import PlaceSearch from './PlaceSearch';

/**
 * Draws a venue layer's area of interest on the live map (P8, D64): the
 * Map step's alternative to an image. Click points around the area; three or
 * more make it. The area is kept as it is drawn and saved with the venue.
 */
export default function AreaEditor({
  area,
  onChange,
  heightClassName = 'h-[55vh] min-h-[320px]',
}: {
  area: MapArea | undefined;
  onChange: (area: MapArea | null) => void;
  heightClassName?: string;
}) {
  const [points, setPoints] = useState<{ lat: number; lng: number }[]>(area?.polygon ?? []);
  const [basemapId, setBasemapId] = usePref<string>(PREF.alignBasemap, DEFAULT_BASEMAP_ID);
  const [view, setView] = useState<BasemapViewRequest | undefined>(() =>
    area && area.polygon.length >= 3 ? { key: 1, bounds: areaBounds(area) } : undefined,
  );
  const centerRef = useRef<LatLon | undefined>(undefined);

  // Report every change (not the initial area).
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const initial = useRef(points);
  useEffect(() => {
    if (points === initial.current) return;
    changeRef.current(points.length >= 3 ? { polygon: points } : null);
  }, [points]);

  const done = points.length >= 3;
  return (
    <div className="flex flex-col gap-3 text-surface-light">
      <div className="flex flex-wrap items-end gap-2">
        <BasemapPicker value={validChoice(basemapId, DEFAULT_BASEMAP_ID)} onChange={setBasemapId} omit={['none']} />
        <PlaceSearch
          className="flex-1"
          near={() => centerRef.current}
          onPick={(r) =>
            setView((v) => ({ key: (v?.key ?? 0) + 1, ...(r.bbox ? { bounds: r.bbox } : { center: { lat: r.lat, lon: r.lon }, zoom: 17 }) }))
          }
        />
      </div>
      <p className="inline-flex items-center gap-1 text-sm font-medium" role="status">
        {done
          ? `Area drawn with ${points.length} points. Click to add more, or continue.`
          : `Click around the area you are working in. ${3 - points.length} more point${points.length === 2 ? '' : 's'} needed.`}
        <HelpTip text="Find the place with the search box, then click points around the area your event covers, in order. The event's map is centered on this area, and you can place posts and draw zones anywhere on it." />
      </p>
      <BasemapView
        className={`rounded-lg border border-surface-liner ${heightClassName}`}
        basemapId={validChoice(basemapId, DEFAULT_BASEMAP_ID)}
        onMapClick={(p) => setPoints((prev) => [...prev, { lat: p.lat, lng: p.lon }])}
        shapes={points.length ? [{ id: 'area', coords: points, color: '#3eb1fd', closed: done, fillOpacity: 0.15 }] : []}
        view={view}
        onCenterChange={(c) => (centerRef.current = c)}
      />
      <div className="flex gap-2">
        <Button size="sm" variant="flat" startContent={<Undo2 className="h-4 w-4" />} isDisabled={!points.length} onPress={() => setPoints((p) => p.slice(0, -1))}>
          Undo last point
        </Button>
        <Button size="sm" variant="light" startContent={<Trash2 className="h-4 w-4" />} isDisabled={!points.length} onPress={() => setPoints([])}>
          Clear
        </Button>
      </div>
    </div>
  );
}
