'use client';

import React, { useEffect, useRef } from 'react';
import type { GeoPin, GeoShape } from './BasemapView';

/**
 * A vertex of an area being drawn, shared by every area-drawing surface (a
 * venue's drawn map area, zones on an image map, zones on the live map). The
 * first point is a large open circle and the rest are smaller filled dots.
 * Clicking the open circle once three or more points are placed completes the
 * area; nothing else does.
 */

/** Points needed before the open circle completes the area. */
export const MIN_AREA_POINTS = 3;

export default function AreaVertex({
  color,
  first,
  onClose,
}: {
  color: string;
  first: boolean;
  /** Set on the first point once the area can be completed. */
  onClose?: () => void;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // A native listener, so the click stops here before the map underneath sees
  // it: MapLibre listens on its own container (below React's root), and an
  // image map's own click handler would otherwise add a point on top.
  useEffect(() => {
    const el = ref.current;
    if (!el || !first) return;
    const stop = (e: Event) => {
      e.stopPropagation();
      if (e.type === 'click') closeRef.current?.();
    };
    el.addEventListener('click', stop);
    el.addEventListener('dblclick', stop);
    return () => {
      el.removeEventListener('click', stop);
      el.removeEventListener('dblclick', stop);
    };
  }, [first]);

  if (!first) {
    return (
      <span
        className="pointer-events-none block h-2.5 w-2.5 rounded-full border-2 border-white"
        style={{ backgroundColor: color, boxShadow: '0 1px 3px rgb(0 0 0 / 0.6)' }}
      />
    );
  }

  const closable = !!onClose;
  return (
    <span
      ref={ref}
      role={closable ? 'button' : undefined}
      aria-label={closable ? 'Complete the area' : 'First point'}
      title={closable ? 'Click to complete the area' : undefined}
      className={`pointer-events-auto block h-5 w-5 rounded-full transition-transform ${closable ? 'cursor-pointer hover:scale-125' : 'cursor-default'}`}
      style={{
        border: `3px solid ${color}`,
        boxShadow: '0 0 0 1.5px white, 0 1px 3px rgb(0 0 0 / 0.6)',
        backgroundColor: 'transparent',
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

/** The vertices of an area being drawn on the live map, as pins (the first one last, so it stacks on top). */
export function areaVertexPins(coords: { lat: number; lng: number }[], color: string, onClose?: () => void): GeoPin[] {
  const closable = coords.length >= MIN_AREA_POINTS && onClose ? onClose : undefined;
  return coords
    .map((c, i) => ({
      key: `area-vertex:${i}`,
      lat: c.lat,
      lng: c.lng,
      node: <AreaVertex color={color} first={i === 0} onClose={i === 0 ? closable : undefined} />,
    }))
    .reverse();
}
