import React from 'react';
import { HEAT_GRADIENT_CSS } from '@/lib/geo/heat';

/** The heat map's color scale. */
export default function HeatLegend() {
  return (
    <div className="flex items-center gap-2 text-xs text-surface-faint" aria-label="Heat map scale">
      <span>Less time</span>
      <span className="h-2 w-40 rounded" style={{ background: HEAT_GRADIENT_CSS }} />
      <span>More time</span>
    </div>
  );
}
