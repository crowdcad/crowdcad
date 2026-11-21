import React from 'react';

/**
 * CrowdCAD's radio icon (public/crowdcad_radio_icon.svg), drawn in the current
 * text color: the SVG is used as a mask over `currentColor`, so it follows the
 * theme and selected states like the lucide icons beside it. Root's public/
 * needs the same file (see root CLAUDE.md).
 */
export default function CrowdcadRadioIcon({ className }: { className?: string }) {
  const mask = 'url(/crowdcad_radio_icon.svg) center / contain no-repeat';
  return <span aria-hidden className={`inline-block bg-current ${className ?? ''}`} style={{ mask, WebkitMask: mask }} />;
}
