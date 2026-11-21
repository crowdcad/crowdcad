'use client';

import React from 'react';
import { Select, SelectItem } from '@heroui/react';
import { Map as MapIcon } from 'lucide-react';
import { basemapChoices } from '@/lib/geo/basemaps';

/**
 * Basemap style choice (D55), with a map icon in place of a label (as on the
 * dispatch map). "System" (Light or Dark, following the theme) is the default
 * where Light and Dark both exist.
 */
export default function BasemapPicker({
  value,
  onChange,
  className = 'w-48',
  omit = [],
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
  /** Choices to leave out, e.g. "none" where a basemap is the point. */
  omit?: string[];
}) {
  const choices = basemapChoices().filter((c) => !omit.includes(c.id));
  return (
    <Select
      size="sm"
      aria-label="Basemap"
      className={className}
      selectedKeys={[value]}
      disallowEmptySelection
      startContent={<MapIcon className="h-4 w-4 shrink-0 text-surface-faint" />}
      onSelectionChange={(keys) => {
        const id = Array.from(keys)[0];
        if (typeof id === 'string') onChange(id);
      }}
    >
      {choices.map((o) => (
        <SelectItem key={o.id}>{o.label}</SelectItem>
      ))}
    </Select>
  );
}
