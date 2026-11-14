/**
 * The UI style switch: "condensed" (sharp, dense, Rajdhani) or "classic" (the
 * rounded look before it). It is the `data-ui` attribute on <html>; every
 * token it changes lives in src/styles/ui-style.css.
 *
 * - Default for a build: NEXT_PUBLIC_UI_STYLE=classic|condensed (condensed if unset).
 * - Per browser: setUiStyle('classic') (saved in localStorage; setUiStyle(null)
 *   returns to the build default). Admins get a switch for it in Profile >
 *   Preferences (components/profile/preferences-section.tsx).
 */
export type UiStyle = 'condensed' | 'classic';

export const UI_STYLE_STORAGE_KEY = 'ccad-ui-style';

export const DEFAULT_UI_STYLE: UiStyle = process.env.NEXT_PUBLIC_UI_STYLE === 'classic' ? 'classic' : 'condensed';

/** Runs before paint (inline in the root layouts) so a saved style never flashes the default. */
export const UI_STYLE_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${UI_STYLE_STORAGE_KEY}');if(s==='condensed'||s==='classic')document.documentElement.setAttribute('data-ui',s);}catch(e){}})();`;

export function getUiStyle(): UiStyle {
  return document.documentElement.getAttribute('data-ui') === 'classic' ? 'classic' : 'condensed';
}

export function setUiStyle(style: UiStyle | null) {
  try {
    if (style) localStorage.setItem(UI_STYLE_STORAGE_KEY, style);
    else localStorage.removeItem(UI_STYLE_STORAGE_KEY);
  } catch {
    // Storage unavailable: the change still applies to this page.
  }
  document.documentElement.setAttribute('data-ui', style ?? DEFAULT_UI_STYLE);
}
