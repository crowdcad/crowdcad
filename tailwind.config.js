/** @type {import('tailwindcss').Config} */
const { heroui } = require("@heroui/react");
const {
  STATUS_COLORS_HEX,
  STATUS_CARD_FILL_OPACITY,
  STATUS_CARD_RING_OPACITY,
  hexToRgb,
} = require("./src/lib/colorTokens");

// "r g b" triplet for the space-separated rgb() syntax Tailwind expects.
function rgbTriplet(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

// Turns an opacity map's { light, dark } pairs (STATUS_CARD_FILL_OPACITY,
// STATUS_CARD_RING_OPACITY) into CSS custom properties named
// `--{varPrefix}-{key}`, read via var() by the corresponding status-card-*
// / status-card-ring-* Tailwind colors, declared once on :root and
// overridden on .dark — same light/dark pattern globals.css uses for the
// surface-* tokens.
function themedOpacityVars(varPrefix, opacityMap) {
  const root = {};
  const dark = {};
  for (const [key, { light, dark: darkValue }] of Object.entries(opacityMap)) {
    // String, not number — addBase appends "px" to bare numeric values,
    // which would make these invalid as an rgb() alpha component.
    root[`--${varPrefix}-${key}`] = String(light);
    dark[`--${varPrefix}-${key}`] = String(darkValue);
  }
  return { root, dark };
}

function statusCardOpacityBase() {
  const fill = themedOpacityVars('status-card-fill-opacity', STATUS_CARD_FILL_OPACITY);
  const ring = themedOpacityVars('status-card-ring-opacity', STATUS_CARD_RING_OPACITY);
  return {
    ':root': { ...fill.root, ...ring.root },
    '.dark': { ...fill.dark, ...ring.dark },
  };
}

module.exports = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./core/src/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ── App Design Tokens ─────────────────────────────────── */

        // Surface palette — dark-mode background & text hierarchy
        surface: {
          DEFAULT:  'hsl(var(--surface-text) / <alpha-value>)',
          light:    'hsl(var(--surface-text-strong) / <alpha-value>)',
          faint:    'hsl(var(--surface-text-muted) / <alpha-value>)',
          liner:    'hsl(var(--surface-border) / <alpha-value>)',
          deep:     'hsl(var(--surface-bg-1) / <alpha-value>)',
          deeper:   'hsl(var(--surface-bg-2) / <alpha-value>)',
          deeperer: 'hsl(var(--surface-bg-3) / <alpha-value>)',
          deepest:  'hsl(var(--surface-bg-0) / <alpha-value>)',
          base:     'hsl(var(--surface-bg-2) / <alpha-value>)',
        },

        // Accent — primary action & brand highlight colour
        accent: {
          DEFAULT:    '#3eb1fd',  // buttons, links, active markers
          foreground: '#ffffff',  // text on accent backgrounds
        },

        // Semantic status colours — see src/lib/colorTokens.js for the
        // central place to adjust these hex values and their card opacities.
        // The 'card-*' fills and 'card-ring-*' borders each read their own
        // opacity from a CSS custom property (see the statusCardOpacityBase
        // plugin below) so the same classes render different fill/ring
        // opacities, independently, in light vs. dark mode.
        status: {
          red:    STATUS_COLORS_HEX.red,     // errors, danger, destructive actions
          green:  STATUS_COLORS_HEX.green,   // success, active indicators
          blue:   STATUS_COLORS_HEX.blue,    // informational, selected states
          orange: STATUS_COLORS_HEX.orange,  // non-lead members, equipment runs (gold/amber)
          alarm:  STATUS_COLORS_HEX.alarm,   // true orange — pending-call blinking alarm
          'card-red': `rgb(${rgbTriplet(STATUS_COLORS_HEX.red)} / var(--status-card-fill-opacity-red))`,
          'card-blue': `rgb(${rgbTriplet(STATUS_COLORS_HEX.blue)} / var(--status-card-fill-opacity-blue))`,
          'card-green': `rgb(${rgbTriplet(STATUS_COLORS_HEX.green)} / var(--status-card-fill-opacity-green))`,
          'card-yellow': `rgb(${rgbTriplet(STATUS_COLORS_HEX.orange)} / var(--status-card-fill-opacity-yellow))`,
          'card-ring-red': `rgb(${rgbTriplet(STATUS_COLORS_HEX.red)} / var(--status-card-ring-opacity-red))`,
          'card-ring-blue': `rgb(${rgbTriplet(STATUS_COLORS_HEX.blue)} / var(--status-card-ring-opacity-blue))`,
          'card-ring-green': `rgb(${rgbTriplet(STATUS_COLORS_HEX.green)} / var(--status-card-ring-opacity-green))`,
          'card-ring-yellow': `rgb(${rgbTriplet(STATUS_COLORS_HEX.orange)} / var(--status-card-ring-opacity-yellow))`,
        },

        /* ── Radix / shadcn-ui primitives (CSS-variable based) ── */
        // These power the few shadcn components still in use
        // (dropdown-menu, resizable)
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input:  'hsl(var(--input))',
        ring:   'hsl(var(--ring))',
      },

      /* ── Border Radius ───────────────────────────────────── */
      // Every non-none/non-full radius tier (sm/md/lg/xl/2xl/3xl) resolves to
      // the same value — the one HeroUI's Button renders at by default
      // (size="md" → rounded-medium). Components used to reach for whichever
      // tier they liked (Cards defaulted to "lg", inputs were hardcoded to
      // "large", a few dispatch cards used Tailwind's own xl/2xl) and the
      // corners visibly didn't match across the app. Collapsing the scale
      // here — instead of hunting down every call site — makes every
      // existing (and future) rounded-* usage converge on the button's
      // corner automatically; `rounded-none` and `rounded-full` are
      // deliberately untouched since those are a different shape choice, not
      // a scale mismatch.
      borderRadius: {
        sm: 'calc(var(--radius) - 2px)',
        md: 'calc(var(--radius) - 2px)',
        lg: 'calc(var(--radius) - 2px)',
        xl: 'calc(var(--radius) - 2px)',
        '2xl': 'calc(var(--radius) - 2px)',
        '3xl': 'calc(var(--radius) - 2px)',
      },

      /* ── Animations ──────────────────────────────────────── */
      animation: {
        aurora: 'aurora 92s linear infinite',
        'pending-alarm': 'pending-alarm 1.1s ease-in-out infinite',
      },
      keyframes: {
        aurora: {
          from: { transform: 'translate3d(0, 0, 0) scale(1.06)' },
          to:   { transform: 'translate3d(-14%, 0, 0) scale(1.06)' },
        },
        // Fast fade between the default grey liner and the alarm orange —
        // used by the Pending call chip once it's been waiting 2+ minutes.
        'pending-alarm': {
          '0%, 100%': {
            borderColor: 'hsl(var(--surface-border))',
            backgroundColor: 'hsl(var(--surface-border) / 0.3)',
          },
          '50%': {
            borderColor: `rgb(${rgbTriplet(STATUS_COLORS_HEX.alarm)})`,
            backgroundColor: `rgb(${rgbTriplet(STATUS_COLORS_HEX.alarm)} / 0.45)`,
          },
        },
      },
    },
  },
  plugins: [
    function ({ addBase }) {
      addBase(statusCardOpacityBase());
    },
    heroui({
      layout: {
        // Ties every HeroUI component's corners to the same shadcn `--radius`
        // token (see globals.css) used by the plain Tailwind rounded-lg/md/sm
        // utilities and shadcn/radix components (e.g. dropdown-menu.tsx) —
        // one shared lever instead of a second, independently-tuned scale.
        // small/medium/large all resolve to the same value (see the plain
        // borderRadius block above for why) so every HeroUI component's
        // corners match Button's regardless of which tier — or none at all —
        // it happens to request.
        radius: {
          small: "calc(var(--radius) - 2px)",
          medium: "calc(var(--radius) - 2px)",
          large: "calc(var(--radius) - 2px)",
        },
      },
      themes: {
        light: {
          colors: {
            // Derived from the `accent` token above (#3eb1fd) rather than an
            // arbitrary unrelated blue — mirrors dark mode's rationale below
            // (HeroUI's flat/light/etc. variants read the numbered shades,
            // not just DEFAULT, or they silently fall back to HeroUI's own
            // built-in blue scale).
            primary: {
              50: "#f5fbfe",
              100: "#e2f3fe",
              200: "#bbe4fe",
              300: "#95d4fe",
              400: "#65c1fd",
              500: "#3eb1fd",
              600: "#3596d7",
              700: "#2b7cb1",
              800: "#22618b",
              900: "#194765",
              DEFAULT: "#3eb1fd",
              foreground: "#ffffff",
            },
            background: "#f4f7fb",
            foreground: "#111827",
          },
        },
        dark: {
          colors: {
            // Matches --surface-bg-1 (hsl(240 3% 9%)) — the same dark grey
            // used by the dispatch call rows' hover state
            // (TEAM_CARD_ROW_HOVER_CLASS = 'hover:bg-surface-deep').
            // HeroUI's flat/light/etc. variants read the numbered shades
            // (bg-primary-100, hover:bg-primary-50, ...), not just DEFAULT —
            // without them, those variants silently fall back to HeroUI's
            // built-in blue scale. Reuses HeroUI's own dark-mode zinc/grey
            // ramp (its "default" color) so every shade stays visually
            // consistent with the rest of the dark theme.
            primary: {
              50: "#18181b",
              100: "#27272a",
              200: "#3f3f46",
              300: "#52525b",
              400: "#71717a",
              500: "#a1a1aa",
              600: "#d4d4d8",
              700: "#e4e4e7",
              800: "#f4f4f5",
              900: "#fafafa",
              DEFAULT: "#161618",
              foreground: "#f4f4f5",
            },
            background: "#0d0d0e",
            foreground: "#faf9f5",
          },
        },
      },
    }),
  ],
};
