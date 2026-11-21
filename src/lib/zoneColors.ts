import type { Zone } from '@/app/types';

/** Preset palette offered when drawing a new zone — distinct, legible against both the checkerboard background and a typical venue map image. */
export const ZONE_COLOR_PALETTE: string[] = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
];

/** Cycles through the palette so each newly drawn zone defaults to a color distinct from the ones before it — the naming dialog still lets the user override via swatches. */
export function getNextZoneColor(existingZones: Zone[]): string {
  return ZONE_COLOR_PALETTE[existingZones.length % ZONE_COLOR_PALETTE.length];
}

/**
 * Dispatch zones are filled with thick 45° stripes alternating between the
 * zone's usual fill opacity and a little less, so they read apart from
 * plain areas on every map (canvas on the live map, CSS on image maps).
 */
export const ZONE_STRIPE = { widthPx: 6, lightRatio: 0.6 } as const;

function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The striped dispatch-zone fill as a CSS background, at a given full opacity. */
export function zoneStripeBackground(color: string, opacity: number): string {
  const rgb = hexRgb(color);
  const at = (a: number) => (rgb ? `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${a})` : color);
  const w = ZONE_STRIPE.widthPx;
  return `repeating-linear-gradient(135deg, ${at(opacity)} 0 ${w}px, ${at(opacity * ZONE_STRIPE.lightRatio)} ${w}px ${w * 2}px)`;
}
