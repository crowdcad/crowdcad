import { JetBrains_Mono } from 'next/font/google';
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
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono', display: 'swap' });

export const UI_FONT_VARIABLES = `${rajdhani.variable} ${jetbrainsMono.variable}`;
