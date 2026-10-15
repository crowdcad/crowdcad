'use client';

import React, { useEffect, useState } from 'react';
import { Input, Select, SelectItem } from '@heroui/react';
import { Map as MapIcon } from 'lucide-react';
import { basemapChoices } from '@/lib/geo/basemaps';

/**
 * Compact basemap controls for a map's top bar: a pill-shaped basemap choice
 * with a map icon (styled like the dispatch map's "Find a location" search)
 * and, when given, the map image's opacity as a percentage.
 */

// Same look as the dispatch map's location search (venuemaptab.tsx).
const PILL = 'bg-surface-deep text-surface-light border border-surface-liner rounded-full data-[focus-visible=true]:ring-0 data-[focus-visible=true]:ring-offset-0';
// On the map itself: the same square corners, colors and edge as MapLibre's zoom buttons (basemap.module.css).
const MAP_CONTROL =
  'h-[29px] min-h-0 rounded-[4px] bg-white/[0.92] text-[#1f2328] shadow-[0_0_0_2px_rgb(0_0_0/0.1)] data-[hover=true]:bg-[#f2f2f2] dark:bg-[rgb(24_26_31/0.92)] dark:text-[#e6e8eb] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.12)] dark:data-[hover=true]:bg-[rgb(40_42_47/0.92)] data-[focus-visible=true]:ring-0 data-[focus-visible=true]:ring-offset-0';

export default function BasemapToolbar({
  value,
  onChange,
  omit = [],
  opacity,
  onOpacityChange,
  minOpacity = 0,
  variant = 'pill',
}: {
  value: string;
  onChange: (id: string) => void;
  /** Choices to leave out, e.g. "none" where a basemap is the point. */
  omit?: string[];
  /** Map image opacity, 0 to 1. Omit to hide the opacity field. */
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
  /** Lowest allowed opacity, 0 to 1. */
  minOpacity?: number;
  /** "map" when drawn over the map, beside its zoom buttons. */
  variant?: 'pill' | 'map';
}) {
  const trigger = variant === 'map' ? MAP_CONTROL : PILL;
  const text = variant === 'map' ? 'text-inherit' : 'text-surface-light';
  const choices = basemapChoices().filter((c) => !omit.includes(c.id));
  const min = Math.round(minOpacity * 100);
  const percent = opacity === undefined ? undefined : Math.round(opacity * 100);
  // Typing is kept as text so a half-typed value (empty, "4") isn't clamped mid-edit.
  const [draft, setDraft] = useState(percent === undefined ? '' : String(percent));
  useEffect(() => {
    if (percent !== undefined) setDraft(String(percent));
  }, [percent]);

  const commit = (text: string) => {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) {
      setDraft(String(percent ?? 100));
      return;
    }
    const clamped = Math.min(100, Math.max(min, Math.round(n)));
    setDraft(String(clamped));
    onOpacityChange?.(clamped / 100);
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Select
        aria-label="Basemap"
        size="sm"
        className="w-36"
        selectedKeys={[value]}
        disallowEmptySelection
        startContent={<MapIcon className={`h-4 w-4 shrink-0 ${variant === 'map' ? 'opacity-70' : 'text-surface-faint'}`} />}
        onSelectionChange={(keys) => {
          const id = Array.from(keys)[0];
          if (typeof id === 'string') onChange(id);
        }}
        classNames={{ trigger: trigger, value: text, selectorIcon: variant === 'map' ? 'text-inherit' : undefined }}
      >
        {choices.map((o) => (
          <SelectItem key={o.id}>{o.label}</SelectItem>
        ))}
      </Select>
      {percent !== undefined && onOpacityChange && (
        <Input
          type="number"
          aria-label="Map image opacity (%)"
          title="Map image opacity"
          size="sm"
          className="w-[4.5rem]"
          min={min}
          max={100}
          step={5}
          value={draft}
          onValueChange={(v) => {
            setDraft(v);
            const n = Number(v);
            if (v.trim() !== '' && Number.isFinite(n) && n >= min && n <= 100) onOpacityChange(n / 100);
          }}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(draft);
          }}
          endContent={<span className="text-xs text-surface-faint">%</span>}
          classNames={{
            inputWrapper: trigger,
            input: `bg-transparent ${text} outline-none focus:outline-none data-[focus=true]:outline-none`,
          }}
        />
      )}
    </div>
  );
}
