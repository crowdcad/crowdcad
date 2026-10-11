// Shared design-system scales for BOTH Tailwind configs (core's and the
// hosted site's, which require() this file like colorTokens.js). Every value
// here reads a CSS variable set in src/styles/ui-style.css, so the UI style
// (data-ui="tactical" | "classic" on <html>, see src/lib/uiStyle.ts) changes
// corners, padding density and fonts everywhere without touching components.

// Tailwind's default stacks, kept as the fallback after each --ui-* font.
const SANS_FALLBACK = ['ui-sans-serif', 'system-ui', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'];
const MONO_FALLBACK = ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'];

// Every rounded-* tier (and HeroUI's small/medium/large) resolves to one
// --ui-radius, so all corners match; `full` (pills, HeroUI radius="full") is
// its own token so the tactical style can square pills too. `rounded-circle`
// is for shapes that must stay round in every style (map pins, vertices).
const BORDER_RADIUS = {
  DEFAULT: 'var(--ui-radius-default)',
  sm: 'var(--ui-radius)',
  md: 'var(--ui-radius)',
  lg: 'var(--ui-radius)',
  xl: 'var(--ui-radius)',
  '2xl': 'var(--ui-radius)',
  '3xl': 'var(--ui-radius)',
  full: 'var(--ui-radius-pill)',
  circle: '9999px',
};

const HEROUI_RADIUS = {
  small: 'var(--ui-radius)',
  medium: 'var(--ui-radius)',
  large: 'var(--ui-radius)',
};

const FONT_FAMILY = {
  sans: ['var(--ui-font)', ...SANS_FALLBACK],
  mono: ['var(--ui-font-data)', ...MONO_FALLBACK],
};

// p-*/px-*/py-*/... scaled by --ui-pad-scale (the style's density). Only
// padding: margins, gaps and sizes (w-*/h-*) keep the plain spacing scale.
const scaledPadding = ({ theme }) =>
  Object.fromEntries(
    Object.entries(theme('spacing')).map(([key, value]) => [
      key,
      parseFloat(value) === 0 ? value : `calc(${value} * var(--ui-pad-scale, 1))`,
    ])
  );

module.exports = { BORDER_RADIUS, HEROUI_RADIUS, FONT_FAMILY, scaledPadding };
