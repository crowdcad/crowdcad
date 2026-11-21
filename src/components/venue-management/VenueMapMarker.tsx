'use client';

import React from 'react';
import { MapPin, HousePlus } from 'lucide-react';

// The single post/incident marker pin rendered on a venue map — extracted
// from VenueManagementPageClient's inline renderMarkers() so it's one
// component shared by every map that shows markers (venue management's own
// Locations/Map steps today; anywhere else that needs the same pin, like
// the marketing site's features-page demo, going forward). Editing this
// file is the one place to change how a marker looks or behaves anywhere
// it's used.
export interface VenueMapMarkerProps {
  x: number; // percent, left edge of the map image
  y: number; // percent, top edge of the map image
  name?: string;
  isClinic?: boolean;
  isHover?: boolean;
  isPending?: boolean;
  isDragging?: boolean;
  /** Pin size in px at scale 1. Defaults to 24, matching the original inline h-6 w-6 marker. */
  size?: number;
  /** Ambient zoom level of the map this marker sits on. The pin counter-scales against it so it stays a constant on-screen size instead of growing/shrinking as the map zooms. Defaults to 1 (no ambient zoom). */
  scale?: number;
  showTooltip?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export default function VenueMapMarker({
  x,
  y,
  name,
  isClinic,
  isHover,
  isPending,
  isDragging,
  size = 24,
  scale = 1,
  showTooltip = true,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onClick,
}: VenueMapMarkerProps) {
  const Icon = isClinic ? HousePlus : MapPin;
  const emphasis = isPending ? 1.3 : isHover || isDragging ? 1.15 : 1;

  return (
    <>
      <div style={{ left: `${x}%`, top: `${y}%` }} className="absolute z-10">
        <div
          style={{ transform: `translate(-50%, -50%) scale(${emphasis / scale})` }}
          className={`relative transition-transform ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onMouseDown={onMouseDown}
          onClick={onClick}
        >
          {isPending && (
            <span
              className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-circle"
              style={{ backgroundColor: 'hsl(var(--map-marker) / 0.6)' }}
            />
          )}
          <Icon
            size={size}
            strokeWidth={1.5}
            stroke="white"
            fill="hsl(var(--map-marker))"
            style={{ filter: 'drop-shadow(0 1px 3px rgb(0 0 0 / 0.6))' }}
          />
        </div>
      </div>
      {showTooltip && isHover && !isPending && name && (
        <div
          style={{ left: `calc(${x}% - 50px)`, top: `calc(${y}% - 40px)` }}
          className="pointer-events-none absolute z-20 rounded-md bg-surface-deepest/95 px-2 py-1 text-xs text-surface-light shadow-lg border border-default whitespace-nowrap"
        >
          {name}
        </div>
      )}
    </>
  );
}
