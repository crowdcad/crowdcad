'use client';

import React, { useEffect, useRef } from 'react';
import { MIN_POINTS } from '@/lib/polygonDraft';
import type { GeoPin, GeoShape } from './BasemapView';

/**
 * A vertex of an area being drawn, shared by every area-drawing surface (a
 * venue's drawn map area, zones on an image map, zones on the live map). The
 * first point is a large open circle and the rest are smaller filled dots.
 * Clicking the open circle once three or more points are placed completes the
 * area; nothing else does.
 */

/** Points needed before the open circle completes the area. */
export const MIN_AREA_POINTS = MIN_POINTS;

/**
 * Clicking a vertex: the first point's open circle completes the area once it
 * can (`onClose`); any other point, or the first one when the area can't be
 * completed yet, is selected (`onSelect`) so Delete or Backspace removes it.
 */
export default function AreaVertex({
  color,
  first,
  onClose,
  onSelect,
  selected = false,
}: {
  color: string;
  first: boolean;
  /** Set on the first point once the area can be completed. */
  onClose?: () => void;
  /** Selects this point (usePolygonDraft). Without it, only the first point is clickable. */
  onSelect?: () => void;
  selected?: boolean;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const interactive = first || !!onSelect;

  // A native listener, so the click stops here before the map underneath sees
  // it: MapLibre listens on its own container (below React's root), and an
  // image map's own click handler would otherwise add a point on top.
  useEffect(() => {
    const el = ref.current;
    if (!el || !interactive) return;
    const stop = (e: Event) => {
      e.stopPropagation();
      if (e.type !== 'click') return;
      if (closeRef.current) closeRef.current();
      else selectRef.current?.();
    };
    el.addEventListener('click', stop);
    el.addEventListener('dblclick', stop);
    return () => {
      el.removeEventListener('click', stop);
      el.removeEventListener('dblclick', stop);
    };
  }, [interactive]);

  const ring = selected ? '0 0 0 2px white, 0 0 0 4px ' + color + ', 0 1px 3px rgb(0 0 0 / 0.6)' : undefined;

  if (!first) {
    return (
      <span
        ref={ref}
        role={onSelect ? 'button' : undefined}
        aria-label={onSelect ? (selected ? 'Selected point (press Delete to remove)' : 'Select point') : undefined}
        aria-pressed={onSelect ? selected : undefined}
        title={onSelect ? (selected ? 'Press Delete to remove this point' : 'Click to select this point') : undefined}
        // Padding widens the click target around the small dot.
        className={`block p-1 ${onSelect ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
      >
        <span
          className={`block rounded-circle border-2 border-white transition-transform ${selected ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'} ${onSelect ? 'hover:scale-125' : ''}`}
          style={{ backgroundColor: selected ? 'white' : color, boxShadow: ring ?? '0 1px 3px rgb(0 0 0 / 0.6)' }}
        />
      </span>
    );
  }

  const closable = !!onClose;
  return (
    <span
      ref={ref}
      role={closable || onSelect ? 'button' : undefined}
      aria-label={closable ? 'Complete the area' : selected ? 'Selected first point (press Delete to remove)' : 'First point'}
      title={closable ? 'Click to complete the area' : onSelect ? (selected ? 'Press Delete to remove this point' : 'Click to select this point') : undefined}
      className={`pointer-events-auto block h-5 w-5 rounded-circle transition-transform ${closable || onSelect ? 'cursor-pointer hover:scale-125' : 'cursor-default'}`}
      style={{
        border: `3px solid ${color}`,
        boxShadow: ring ?? '0 0 0 1.5px white, 0 1px 3px rgb(0 0 0 / 0.6)',
        backgroundColor: selected ? 'white' : 'transparent',
      }}
    />
  );
}

/**
 * An area being drawn on the live map, as shapes: an open outline with a
 * dashed guide back to the first point while drawing, then filled once
 * completed. Pair with areaVertexPins while drawing.
 */
export function areaDraftShapes(id: string, coords: { lat: number; lng: number }[], color: string, closed: boolean, fillOpacity = 0.25): GeoShape[] {
  if (!coords.length) return [];
  if (closed) return [{ id, coords, color, closed: true, fillOpacity }];
  const shapes: GeoShape[] = [{ id, coords, color, closed: false, vertices: false }];
  if (coords.length >= 2) shapes.push({ id: `${id}:guide`, coords: [coords[coords.length - 1]!, coords[0]!], color, closed: false, dashed: true, vertices: false });
  return shapes;
}

/**
 * The vertices of an area being drawn on the live map, as pins (the first one
 * last, so it stacks on top). `onSelect` makes every point selectable.
 */
export function areaVertexPins(
  coords: { lat: number; lng: number }[],
  color: string,
  onClose?: () => void,
  select?: { selected: number | null; onSelect: (index: number) => void },
): GeoPin[] {
  const closable = coords.length >= MIN_AREA_POINTS && onClose ? onClose : undefined;
  return coords
    .map((c, i) => ({
      key: `area-vertex:${i}`,
      lat: c.lat,
      lng: c.lng,
      node: (
        <AreaVertex
          color={color}
          first={i === 0}
          onClose={i === 0 ? closable : undefined}
          onSelect={select ? () => select.onSelect(i) : undefined}
          selected={select?.selected === i}
        />
      ),
    }))
    .reverse();
}
