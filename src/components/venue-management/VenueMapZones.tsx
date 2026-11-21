"use client";

import React from "react";
import type { Zone } from "@/app/types";
import { zoneStripeBackground } from "@/lib/zoneColors";

// Renders a venue map layer's zone polygons as a percent-coordinate SVG
// overlay — shared by every map surface that already renders post pins
// (venue management's own map, VenueMapWithPosts) so zones look identical
// everywhere. Deliberately rendered with no z-index of its own beyond
// `absolute inset-0`: callers place this element before pins in DOM order
// (and pins carry their own z-10/z-20), which is what keeps zones sitting
// below every pin without this component needing to know about them.
export interface VenueMapZonesProps {
  zones: Zone[];
  hoverZoneId?: string | null;
  onZoneMouseEnter?: (zone: Zone) => void;
  onZoneMouseLeave?: (zone: Zone) => void;
  onZoneClick?: (zone: Zone) => void;
  /** Fill/stroke opacity out of 1. Editing surfaces want these easy to see; read-only dispatch/event maps can dial it down so pins stay the focal point. */
  opacity?: number;
}

export default function VenueMapZones({
  zones,
  hoverZoneId,
  onZoneMouseEnter,
  onZoneMouseLeave,
  onZoneClick,
  opacity = 0.28,
}: VenueMapZonesProps) {
  if (zones.length === 0) return null;

  return (
    <>
      {/* Dispatch zones' striped fill (ZONE_STRIPE): CSS clipped to the polygon, so the
          stripes stay 45° and evenly spaced however the image's aspect stretches the SVG. */}
      {zones.map((zone) =>
        zone.isDispatchZone && zone.points.length >= 3 ? (
          <div
            key={`stripes:${zone.id}`}
            className="absolute inset-0"
            style={{
              pointerEvents: "none",
              clipPath: `polygon(${zone.points.map((p) => `${p.x}% ${p.y}%`).join(", ")})`,
              background: zoneStripeBackground(
                zone.color,
                hoverZoneId === zone.id ? opacity + 0.15 : opacity,
              ),
            }}
          />
        ) : null,
      )}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ pointerEvents: "none" }}
      >
        {zones.map((zone) => {
          if (zone.points.length < 3) return null;
          const isHover = hoverZoneId === zone.id;
          return (
            <polygon
              key={zone.id}
              points={zone.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={zone.color}
              fillOpacity={
                zone.isDispatchZone ? 0 : isHover ? opacity + 0.15 : opacity
              }
              stroke={zone.color}
              strokeWidth={isHover ? 2.5 : 2}
              vectorEffect="non-scaling-stroke"
              style={{
                pointerEvents:
                  onZoneClick || onZoneMouseEnter ? "auto" : "none",
                cursor: onZoneClick ? "pointer" : undefined,
              }}
              onMouseEnter={() => onZoneMouseEnter?.(zone)}
              onMouseLeave={() => onZoneMouseLeave?.(zone)}
              onClick={() => onZoneClick?.(zone)}
            >
              <title>{zone.name}</title>
            </polygon>
          );
        })}
      </svg>
    </>
  );
}
