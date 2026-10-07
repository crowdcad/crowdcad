'use client';

import React from 'react';
import { Select, SelectItem } from '@heroui/react';
import { BASEMAPS } from '../lib/basemaps';

/** Basemap style choice (D55). */
export default function BasemapPicker({
  value,
  onChange,
  label = 'Basemap',
  className = 'w-48',
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  className?: string;
}) {
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
      {BASEMAPS.map((o) => (
        <SelectItem key={o.id}>{o.label}</SelectItem>
      ))}
    </Select>
  );
}
