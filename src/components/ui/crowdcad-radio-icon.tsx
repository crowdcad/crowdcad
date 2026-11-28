import React from 'react';
import { EquipmentGlyph } from '@/components/geo/mapSymbol';

/**
 * CrowdCAD's radio icon, in the current text color. Classic: public/crowdcad_radio_icon.svg used as a mask over
 * `currentColor`, so it follows the theme and selected states like the icons beside it (root's public/ needs the
 * same file; see root CLAUDE.md). Condensed: the map's radio glyph, like the other equipment icons. Both are
 * rendered; src/styles/ui-style.css shows the one for the style.
 */
export default function CrowdcadRadioIcon({ className }: { className?: string }) {
  const mask = 'url(/crowdcad_radio_icon.svg) center / contain no-repeat';
  return (
    <>
      <span aria-hidden className={`ui-classic-only inline-block bg-current ${className ?? ''}`} style={{ mask, WebkitMask: mask }} />
      <svg aria-hidden viewBox="0 0 24 24" className={`ui-condensed-only ${className ?? ''}`}>
        <EquipmentGlyph type="radio" />
      </svg>
    </>
  );
}
