/**
 * Single source of truth for status colors and their card opacities.
 *
 * Consumed by:
 *  - tailwind.config.js, which builds the `status-*`, `status-card-*` (fill)
 *    and `status-card-ring-*` (border/ring) Tailwind color palettes from
 *    these values, and injects STATUS_CARD_FILL_OPACITY / STATUS_CARD_RING_
 *    OPACITY as CSS custom properties (`--status-card-fill-opacity-*` /
 *    `--status-card-ring-opacity-*`) on `:root` / `.dark` so the same class
 *    renders a different opacity per theme automatically.
 *  - components that need raw RGB values outside of Tailwind's class-based
 *    system (e.g. availabilitysurgestrip.tsx, which continuously interpolates
 *    between colors and can't express that with a fixed set of classes).
 *
 * To change a status color, edit STATUS_COLORS_HEX. To change how strong a
 * status card's tinted background reads, edit STATUS_CARD_FILL_OPACITY. To
 * change how strong its border/ring reads, edit STATUS_CARD_RING_OPACITY —
 * both Tailwind classes and any component importing these constants pick
 * them up automatically, with nothing to keep in sync by hand.
 */

const STATUS_COLORS_HEX = {
  red: '#e56a6a',
  green: '#51c355',
  blue: '#5eaae8',
  orange: '#e2c93d',
  // True orange (distinct from the gold/amber 'orange' above, which is
  // already used by En Route Eq / Assisting / Delivered Eq). Used for the
  // pending-call blinking alarm.
  alarm: '#e8823c',
};

// Opacity (0-1) of each status card's tinted background (card fills, chip
// backgrounds, the status <Select> trigger fill, etc), independently
// tunable per theme. Keyed by the same palette used in STATUS_COLORS_HEX.
//
// Previously named CARD_BACKGROUND_OPACITY and consumed as a flat number;
// renamed because that version only ever reached border/ring classes
// (`border-status-card-*`, no opacity modifier) — the fill classes applied
// an extra hardcoded Tailwind opacity modifier (e.g. `bg-status-card-red/20`)
// on top of this already-translucent color, so changing the constant never
// visibly moved the actual background. Fill classes no longer add that
// modifier; this value is now the only thing controlling fill opacity.
const STATUS_CARD_FILL_OPACITY = {
  red:    { light: 0.72, dark: 0.40 },
  blue:   { light: 0.72, dark: 0.40 },
  green:  { light: 0.72, dark: 0.40 },
  yellow: { light: 0.72, dark: 0.40 }, // used for the orange/amber status-card color
};

// Opacity (0-1) of each status card's border/ring, independently tunable per
// theme and independent of STATUS_CARD_FILL_OPACITY above — borders used to
// silently share the fill's opacity value (both read the same `status-card-*`
// color), so there was no way to make a ring read stronger or weaker than its
// fill. Consumed via the separate `status-card-ring-*` Tailwind colors.
const STATUS_CARD_RING_OPACITY = {
  red:    { light: 0.45, dark: 0.55 },
  blue:   { light: 0.45, dark: 0.55 },
  green:  { light: 0.45, dark: 0.55 },
  yellow: { light: 0.35, dark: 0.45 }, // used for the orange/amber status-card color
};

// Map marker fills (src/components/geo/mapSymbol.tsx): saturated versions of
// the status colors, so a pin reads on light, dark and satellite basemaps.
// Each holds 3:1 contrast against its glyph (white, or near-black on the
// light ones).
const MAP_INK = {
  available: '#2e9e3e',
  committed: '#d92b2b',
  equipment: '#e2c93d',
  onBreak: '#6b7280',
  other: '#3b37d0',
  pending: '#e8823c',
  place: '#3fb0fc',
  select: '#f97316',
};

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

module.exports = {
  STATUS_COLORS_HEX,
  STATUS_CARD_FILL_OPACITY,
  STATUS_CARD_RING_OPACITY,
  MAP_INK,
  hexToRgb,
};
