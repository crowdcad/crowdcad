'use client';

import React from 'react';
import type { Layer } from '@/app/types';
import { useTakEvent } from '../data/hub';
import { alignmentFor } from '../data/alignmentStore';
import { PREF, usePref } from '@/lib/geo/prefs';
import { BASEMAPS, DEFAULT_UNDERLAY_ID, NO_BASEMAP_ID, resolveBasemap, validChoice } from '@/lib/geo/basemaps';
import { useIsDark } from '@/lib/geo/ui';
import BasemapToolbar from '@/components/geo/BasemapToolbar';
import { DEFAULT_IMAGE_OPACITY } from './TakBasemapUnderlay';

/**
 * The dispatch map's basemap underlay choice and image opacity (touchpoint j),
 * in the Map tab's top bar. Shown only for a layer with a current alignment.
 */
export interface TakBasemapToolbarProps {
  eventId: string;
  layer: Layer | undefined;
}

export default function TakBasemapToolbar({ eventId, layer }: TakBasemapToolbarProps) {
  const tak = useTakEvent(eventId);
  const [underlayId, setUnderlayId] = usePref<string>(PREF.underlayBasemap, DEFAULT_UNDERLAY_ID);
  const [imageOpacity, setImageOpacity] = usePref<number>(PREF.imageOpacity, DEFAULT_IMAGE_OPACITY);
  const dark = useIsDark();
  if (!alignmentFor(layer, tak.alignments, tak.venueAlignments)) return null;
  const underlay = resolveBasemap(underlayId, DEFAULT_UNDERLAY_ID, BASEMAPS, dark);
  return (
    <BasemapToolbar
      value={validChoice(underlayId, DEFAULT_UNDERLAY_ID)}
      onChange={setUnderlayId}
      opacity={underlay.id !== NO_BASEMAP_ID ? imageOpacity : undefined}
      onOpacityChange={setImageOpacity}
      minOpacity={0.2}
    />
  );
}
