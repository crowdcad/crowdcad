'use client';

import React from 'react';
import { Select, SelectItem } from '@heroui/react';
import { basemapChoices } from '@/lib/geo/basemaps';

/** Basemap style choice (D55). "Match light/dark mode" is the default where Light and Dark both exist. */
export default function BasemapPicker({
  value,
  onChange,
  label = 'Basemap',
  className = 'w-48',
  omit = [],
}: {
  value: string;
  onChange: (id: string) => void;
  label?: React.ReactNode;
  className?: string;
  /** Choices to leave out, e.g. "none" where a basemap is the point. */
  omit?: string[];
}) {
  const choices = basemapChoices().filter((c) => !omit.includes(c.id));
  return (
    <Select
      size="sm"
      label={label}
      className={className}
      selectedKeys={[value]}
      disallowEmptySelection
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
