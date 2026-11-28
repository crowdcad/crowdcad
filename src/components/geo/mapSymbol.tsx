import React from 'react';
import { MAP_INK } from '@/lib/colorTokens';
import { getStatusColor } from '@/lib/statusColors';
import type { EquipmentIconType } from '@/lib/equipmentIcon';

/**
 * Map symbols: one sharp-cornered SVG per thing on the venue map. The frame's
 * shape says what it is (decagon: a unit; square: equipment; diamond: a call;
 * a flag pointing at its spot: a post or clinic), its fill says its status,
 * and the glyph inside says its type. A 1px white edge over a 1px dark one
 * keeps it readable on any basemap.
 *
 * Every symbol is drawn in a 64px box centered on its anchor: a unit's,
 * equipment's or call's center, or a post's tip. A marker scaled about the
 * box's center therefore grows from the spot it marks.
 */

export const SYMBOL_BOX = 64;

const INK = '#0b0e13';
const KEY = 'rgba(5,7,10,0.92)';
const MONO = 'JetBrains Mono, ui-monospace, monospace';

/** A unit's fill: the same status groups as its card. */
export function unitInk(status: string): string {
  if (getStatusColor(status).textClass === 'text-status-orange') return MAP_INK.equipment;
  if (status === 'Available') return MAP_INK.available;
  if (status === 'On Break') return MAP_INK.onBreak;
  if (status === 'En Route' || status === 'On Scene' || status === 'Transporting') return MAP_INK.committed;
  return MAP_INK.other;
}

/** An equipment item's fill, from its own status. */
export function equipmentInk(status: string | undefined): string {
  const s = status || '';
  if (s.startsWith('Call ') || s === 'In Use') return MAP_INK.committed;
  if (s === 'In Clinic') return MAP_INK.onBreak;
  if (s === 'Available') return MAP_INK.available;
  return MAP_INK.other;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** White, or near-black on a light fill (equipment yellow, pending orange). */
const glyphOn = (fill: string) => (luminance(fill) > 0.3 ? INK : '#ffffff');

const r2 = (n: number) => Math.round(n * 100) / 100;
/** A unit's frame: ten sides, flat top and bottom, points left and right (an octagon read as a stop sign). */
function decagon(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    pts.push(`${r2(r * Math.cos(a))} ${r2(r * Math.sin(a))}`);
  }
  return `M${pts.join(' L')}Z`;
}
function octagonAt(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    pts.push(`${r2(cx + r * Math.cos(a))} ${r2(cy + r * Math.sin(a))}`);
  }
  return `M${pts.join(' L')}Z`;
}

export type MapSymbolKind = 'unit' | 'supervisor' | 'equipment' | 'call' | 'post' | 'clinic';

const FRAMES: Record<MapSymbolKind, string> = {
  unit: decagon(14),
  supervisor: decagon(14),
  equipment: 'M-10 -10 H10 V10 H-10 Z',
  call: 'M0 -15 L15 0 L0 15 L-15 0 Z',
  post: 'M-9 -23 H9 V-9 L0 0 L-9 -9 Z',
  clinic: 'M-11 -28 H11 V-11 L0 0 L-11 -11 Z',
};
/** Each frame's bounds: [left, top, right, bottom]. */
const BOUNDS: Record<MapSymbolKind, [number, number, number, number]> = {
  unit: [-14, -13.3, 14, 13.3],
  supervisor: [-14, -13.3, 14, 13.3],
  equipment: [-10, -10, 10, 10],
  call: [-15, -15, 15, 15],
  post: [-9, -23, 9, 0],
  clinic: [-11, -28, 11, 0],
};

/** The top of a symbol's frame above its anchor, in px (for placing things above it). */
export const symbolTop = (kind: MapSymbolKind) => -BOUNDS[kind][1];

const line = (d: string, w: number, c: string) => (
  <path d={d} fill="none" stroke={c} strokeWidth={w} strokeLinejoin="miter" strokeLinecap="butt" />
);
/** A white line with a dark keyline around it, like a frame's edge. */
const keyed = (d: string, w = 1.5) => (
  <>
    <path d={d} fill="none" stroke={KEY} strokeWidth={w + 2} strokeLinejoin="miter" strokeLinecap="square" />
    <path d={d} fill="none" stroke="#fff" strokeWidth={w} strokeLinejoin="miter" strokeLinecap="square" />
  </>
);
const keyedFill = (d: string, fill = '#fff') => (
  <>
    <path d={d} fill="none" stroke={KEY} strokeWidth={2} strokeLinejoin="miter" />
    <path d={d} fill={fill} />
  </>
);

type GlyphName = EquipmentIconType | 'cross' | 'chevrons' | 'dot' | 'check';

/** Glyphs on a 14px grid centered on 0,0, drawn in `c`. Straight runs, flat ends, square dots. */
function Glyph({ name, c }: { name: GlyphName; c: string }) {
  switch (name) {
    case 'cross':
      return <path d="M-1.6 -6.4h3.2v4.8h4.8v3.2h-4.8v4.8h-3.2v-4.8h-4.8v-3.2h4.8z" fill={c} />;
    case 'chevrons':
      return line('M-6.5 0.5 L0 -4.5 L6.5 0.5 M-6.5 5.5 L0 0.5 L6.5 5.5', 2.3, c);
    case 'wheelchair':
      // A chair on a wheel: push handle, back, seat, armrest and footrest. No figure.
      return (
        <>
          {line('M-7 -6.6 H-4.2 V1 H5 V6.2 H7.2 M-4.2 -2.4 H3', 1.8, c)}
          {line(octagonAt(-1.2, 2.6, 4.4), 1.6, c)}
        </>
      );
    case 'stretcher':
      return (
        <>
          <rect x={-7.2} y={-2.6} width={14.4} height={2.8} fill={c} />
          {line('M-7.2 -2.6 V-6 M-4.8 0.2 L4.8 6 M4.8 0.2 L-4.8 6', 1.6, c)}
          <rect x={-6.4} y={5.4} width={2.6} height={2.6} fill={c} />
          <rect x={3.8} y={5.4} width={2.6} height={2.6} fill={c} />
        </>
      );
    case 'radio':
      return (
        <>
          {line('M-6 -2.6 H6 V3 H5 V8.2 H-5 V3 H-6 Z', 1.6, c)}
          {line('M-3.4 -2.6 V-8.4 M3.6 -2.6 V-4.6', 1.6, c)}
          <rect x={-3.2} y={-0.6} width={6.4} height={1.8} fill={c} />
          {line('M-3 3.6 H3 M-3 6 H3', 1.3, c)}
        </>
      );
    case 'aed':
      return <path d="M1.6 -7.6 L-4.6 1 H-0.6 L-1.6 7.6 L4.6 -1 H0.6 Z" fill={c} />;
    case 'briefcase':
      // A medical bag; the cross sits on the body's center.
      return (
        <>
          {line('M-7 -3.5 H7 V6.5 H-7 Z M-2.8 -3.5 V-6.8 H2.8 V-3.5', 1.6, c)}
          <path d="M-1 -1.5h2v2h2v2h-2v2h-2v-2h-2v-2h2z" fill={c} />
        </>
      );
    case 'dot':
      return <rect x={-2.4} y={-2.4} width={4.8} height={4.8} fill={c} />;
    case 'check':
      return line('M-4.6 0 L-1.4 3.2 L4.6 -3.2', 2.2, c);
  }
}

/**
 * An equipment type's map glyph in a 24px icon box, drawn in currentColor: the condensed style's equipment icons
 * (EquipmentTypeIcon, CrowdcadRadioIcon), so a team card shows the same wheelchair, gurney or radio as the map.
 */
export function EquipmentGlyph({ type }: { type: EquipmentIconType }) {
  return (
    <g transform="translate(12 12) scale(1.4)">
      <Glyph name={type} c="currentColor" />
    </g>
  );
}

/**
 * Thin keyed lines from a marker's anchor out to things spread around it
 * (a stack opened up, a unit's equipment). In a SYMBOL_BOX-sized layer
 * centered on the anchor; `from` and `short` trim each end, in px.
 */
export function LeaderLines({ points, from = 0, short = 11 }: { points: { dx: number; dy: number }[]; from?: number; short?: number }) {
  return (
    <svg
      width={SYMBOL_BOX}
      height={SYMBOL_BOX}
      viewBox="-32 -32 64 64"
      overflow="visible"
      aria-hidden
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
    >
      {points.map(({ dx, dy }, i) => {
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const d = `M${r2(ux * from)} ${r2(uy * from)} L${r2(dx - ux * short)} ${r2(dy - uy * short)}`;
        return <React.Fragment key={i}>{keyed(d, 1)}</React.Fragment>;
      })}
    </svg>
  );
}

/** The exact spot under an opened stack: a small white square. */
export function AnchorDot() {
  return (
    <svg width={SYMBOL_BOX} height={SYMBOL_BOX} viewBox="-32 -32 64 64" overflow="visible" aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      <g pointerEvents="visiblePainted">{keyedFill('M-3 -3 H3 V3 H-3 Z')}</g>
    </svg>
  );
}

/** Points spread evenly on a ring around an anchor, starting up and to the right. */
export function ringPoints(count: number, radius: number): { dx: number; dy: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const a = ((-60 + (i * 360) / count) * Math.PI) / 180;
    return { dx: r2(radius * Math.cos(a)), dy: r2(radius * Math.sin(a)) };
  });
}

/** Points on an arc below an anchor (a unit's equipment). */
export function fanPoints(count: number, radius = 36): { dx: number; dy: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const a = ((90 + (i - (count - 1) / 2) * 40) * Math.PI) / 180;
    return { dx: r2(radius * Math.cos(a)), dy: r2(radius * Math.sin(a)) };
  });
}

/** True when the user asked for less motion (the OS setting or CrowdCAD's own preference). */
function motionReduced(): boolean {
  if (typeof window === 'undefined') return false;
  return document.documentElement.classList.contains('reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** The search arrow: one closed shape, so its dark edge runs only around the outside. */
const ARROW = 'M-2.8 -17 H2.8 V-8 H8 L0 0 L-8 -8 H-2.8 Z';

export interface MapSymbolProps {
  kind: MapSymbolKind;
  /** Frame fill (unitInk, equipmentInk, MAP_INK.*). */
  fill: string;
  /** Equipment: which glyph. Posts: 'dot' (default), 'briefcase' for a medical post. */
  glyph?: GlyphName;
  /** Calls: the call number shown inside. */
  number?: number;
  /** Units: how many pieces of equipment the unit has (a white pip on its corner). */
  carrying?: number;
  /** Several things in one spot, collapsed: how many, and the fills of up to two behind the top one. */
  stack?: { count: number; fills: string[] };
  /** Units: crewing a vehicle (a bar under the frame). */
  vehicle?: boolean;
  /** Units: direction of travel on screen, in degrees clockwise from up. */
  heading?: number;
  /** A live position that hasn't been updated for a while: dashed edge. */
  stale?: boolean;
  /** Calls: waiting for a unit (pulses). */
  pending?: boolean;
  /** Calls: priority (a second frame). */
  priority?: boolean;
  /** Calls: closed (dark fill and a check). */
  resolved?: boolean;
  /** Found by search or "view on map": corner brackets and a bouncing arrow. */
  searched?: boolean;
  title?: string;
}

export function MapSymbol({
  kind,
  fill,
  glyph,
  number,
  carrying = 0,
  stack,
  vehicle,
  heading,
  stale,
  pending,
  priority,
  resolved,
  searched,
  title,
}: MapSymbolProps) {
  const d = FRAMES[kind];
  const frameFill = resolved ? 'rgba(11,14,19,0.62)' : fill;
  const gc = resolved ? '#ffffff' : kind === 'post' || kind === 'clinic' ? '#ffffff' : glyphOn(fill);
  const animate = !motionReduced();
  const [bx0, by0, bx1, by1] = BOUNDS[kind];

  const frame = (dashed = false, f = frameFill) => (
    <>
      <path d={d} fill="none" stroke={KEY} strokeWidth={4} strokeLinejoin="miter" strokeMiterlimit={8} />
      <path d={d} fill={f} />
      <path d={d} fill="none" stroke="#fff" strokeWidth={2} strokeLinejoin="miter" strokeMiterlimit={8} strokeDasharray={dashed ? '4 3' : undefined} />
    </>
  );

  let content: React.ReactNode;
  if (kind === 'call') {
    content = resolved ? (
      <Glyph name="check" c={gc} />
    ) : (
      <text x={0} y={0.6} textAnchor="middle" dominantBaseline="central" fontFamily={MONO} fontWeight={700} fontSize={String(number ?? '').length > 2 ? 8 : 9.5} fill={gc}>
        {number ?? ''}
      </text>
    );
  } else if (kind === 'unit') {
    content = <Glyph name="cross" c={gc} />;
  } else if (kind === 'supervisor') {
    content = <Glyph name="chevrons" c={gc} />;
  } else if (kind === 'equipment') {
    content = (
      <g transform="scale(0.86)">
        <Glyph name={glyph ?? 'briefcase'} c={gc} />
      </g>
    );
  } else if (kind === 'clinic') {
    content = (
      <g transform="translate(0 -18)">
        <Glyph name="cross" c={gc} />
      </g>
    );
  } else {
    content = (
      <g transform="translate(0 -14.5) scale(0.82)">
        <Glyph name={glyph ?? 'dot'} c={gc} />
      </g>
    );
  }

  const chip = stack && stack.count > 1 ? { x: bx1 + 6, y: by0 - 4 } : null;
  const bracket = (() => {
    const x0 = bx0 - 4, y0 = by0 - 4, x1 = bx1 + 4, y1 = by1 + 4, L = 5;
    return `M${x0} ${y0 + L} V${y0} H${x0 + L} M${x1 - L} ${y0} H${x1} V${y0 + L} M${x1} ${y1 - L} V${y1} H${x1 - L} M${x0 + L} ${y1} H${x0} V${y1 - L}`;
  })();

  return (
    <svg
      width={SYMBOL_BOX}
      height={SYMBOL_BOX}
      viewBox="-32 -32 64 64"
      overflow="visible"
      role="img"
      aria-label={title}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <g pointerEvents="visiblePainted" opacity={stale ? 0.7 : 1}>
        {stack?.fills.slice(0, 2).map((f, i) => ({ f, k: (i + 1) * 4 })).reverse().map(({ f, k }) => (
          <g key={k} transform={`translate(${k} ${-k})`}>
            {frame(false, f)}
          </g>
        ))}
        {pending && (
          <path d={d} fill="none" stroke={MAP_INK.pending} strokeWidth={2.5} strokeLinejoin="miter" opacity={animate ? undefined : 0.6}>
            {animate && (
              <>
                <animateTransform attributeName="transform" type="scale" from="1" to="1.75" dur="1.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.95" to="0" dur="1.4s" repeatCount="indefinite" />
              </>
            )}
          </path>
        )}
        {heading != null && (
          <g transform={`rotate(${r2(heading - 90)})`}>
            {keyed('M0 0 H23')}
            {keyedFill('M22 -4 L28.5 0 L22 4 Z')}
          </g>
        )}
        {vehicle && keyedFill('M-9 17.5 H9 V20.5 H-9 Z')}
        {priority && (
          <>
            <path d="M0 -20 L20 0 L0 20 L-20 0 Z" fill="none" stroke={KEY} strokeWidth={3.5} strokeLinejoin="miter" />
            <path d="M0 -20 L20 0 L0 20 L-20 0 Z" fill="none" stroke="#fff" strokeWidth={1.5} strokeLinejoin="miter" />
          </>
        )}
        {frame(stale)}
        {content}
        {carrying > 0 && (
          <>
            <rect x={6} y={-16} width={10} height={10} fill="none" stroke={KEY} strokeWidth={2.5} />
            <rect x={6} y={-16} width={10} height={10} fill="#fff" />
            <text x={11} y={-10.6} textAnchor="middle" dominantBaseline="central" fontFamily={MONO} fontWeight={700} fontSize={8} fill={INK}>
              {carrying > 9 ? '9+' : carrying}
            </text>
          </>
        )}
        {chip && (
          <>
            <rect x={chip.x - 9} y={chip.y - 6} width={18} height={12} fill={INK} stroke="#fff" strokeWidth={1} />
            <text x={chip.x} y={chip.y + 0.5} textAnchor="middle" dominantBaseline="central" fontFamily={MONO} fontWeight={700} fontSize={8.5} fill="#fff">
              ×{stack!.count}
            </text>
          </>
        )}
      </g>
      {searched && (
        <g pointerEvents="none">
          {keyed(bracket)}
          <g transform={`translate(0 ${by0 - 7})`}>
            <g>
              {animate && (
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="0 -6; 0 0; 0 -6"
                  keyTimes="0; 0.5; 1"
                  calcMode="spline"
                  keySplines="0.8 0 1 1; 0 0 0.2 1"
                  dur="1s"
                  repeatCount="indefinite"
                />
              )}
              <path d={ARROW} fill={MAP_INK.select} stroke={KEY} strokeWidth={2.5} strokeLinejoin="miter" paintOrder="stroke" />
            </g>
          </g>
        </g>
      )}
    </svg>
  );
}
