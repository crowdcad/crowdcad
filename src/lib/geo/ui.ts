import { useEffect, useState } from 'react';

/**
 * CrowdCAD's bright accent for HeroUI controls. Their default "primary" is
 * near-black in the dark theme, so sliders and switches set the accent
 * explicitly to stay bright blue in both themes.
 */
export const ACCENT_SLIDER_CLASSNAMES = {
  filler: 'bg-accent',
  thumb: 'bg-accent after:bg-white',
} as const;
export const ACCENT_SWITCH_CLASSNAMES = { wrapper: 'group-data-[selected=true]:bg-accent' } as const;

/** True while CrowdCAD shows its dark theme (the `dark` class on <html>, see app/layout.tsx). */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains('dark'));
    read();
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}
