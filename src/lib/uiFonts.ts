import { JetBrains_Mono, Rajdhani } from 'next/font/google';

// The tactical style's fonts (src/styles/ui-style.css), exposed as CSS
// variables on <html>; the classic style ignores them.
const rajdhani = Rajdhani({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-rajdhani', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono', display: 'swap' });

export const UI_FONT_VARIABLES = `${rajdhani.variable} ${jetbrainsMono.variable}`;
