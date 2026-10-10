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

export default function BasemapToolbar({
  value,
  onChange,
  omit = [],
  opacity,
  onOpacityChange,
  minOpacity = 0,
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
}) {
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
        startContent={<MapIcon className="h-4 w-4 shrink-0 text-surface-faint" />}
        onSelectionChange={(keys) => {
          const id = Array.from(keys)[0];
          if (typeof id === 'string') onChange(id);
        }}
        classNames={{ trigger: PILL, value: 'text-surface-light' }}
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
            inputWrapper: PILL,
            input: 'bg-surface-deep text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none',
          }}
        />
      )}
    </div>
  );
}
