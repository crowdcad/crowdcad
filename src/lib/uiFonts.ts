import localFont from 'next/font/local';

// The condensed style's fonts (src/styles/ui-style.css), exposed as CSS
// variables on <html>; the classic style ignores them.

// Rajdhani is bundled (src/fonts/rajdhani, OFL) rather than loaded from Google
// so its vertical metrics can be overridden: its own put text about 0.07em
// above center in buttons and inputs. The overrides move the baseline down
// that much while keeping the same total line height (93% + 34.6%).
// size-adjust draws it 15% larger than the font size asks for: Rajdhani's
// small x-height read a size or two smaller than the classic font at the same
// px. It scales the metric overrides too, so the centering above holds.
const rajdhani = localFont({
  src: [
    { path: '../fonts/rajdhani/rajdhani-500.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/rajdhani/rajdhani-600.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/rajdhani/rajdhani-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-rajdhani',
  display: 'swap',
  declarations: [
    { prop: 'ascent-override', value: '100%' },
    { prop: 'descent-override', value: '27.6%' },
    { prop: 'size-adjust', value: '115%' },
  ],
});
// JetBrains Mono (numbers and times) is bundled too (src/fonts/jetbrains-mono, OFL, the latin variable font)
// so its baseline can be put exactly where Rajdhani's is. In a box centered on its line, a font's baseline sits
// (ascent - descent) / 2 below the middle: Rajdhani's is (115% - 31.74%) / 2 = 41.63% of the font size; the
// overrides give JetBrains Mono the same (107.63% - 24.37%) / 2, keeping its own total height (132%).
// TO NUDGE BY HAND: raise ascent-override and lower descent-override by the same amount to move numbers
// down (each 1% moves them 0.5% of the font size, about 0.1px at 16px); the reverse moves them up.
const jetbrainsMono = localFont({
  src: [{ path: '../fonts/jetbrains-mono/jetbrains-mono-latin-wght.woff2', weight: '100 800', style: 'normal' }],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  declarations: [
    { prop: 'ascent-override', value: '107.63%' },
    { prop: 'descent-override', value: '24.37%' },
  ],
});

export const UI_FONT_VARIABLES = `${rajdhani.variable} ${jetbrainsMono.variable}`;
