'use client';

import React from 'react';
import { Select, SelectItem } from '@heroui/react';

/**
 * Event setup: which team or supervisor starts the event holding an item, like handing it over on the
 * board (src/lib/equipmentCustody.ts setupEquipmentHolder). "No team" leaves it at its default location.
 */
export default function EquipmentTeamSelect({
  itemName,
  units,
  value,
  onChange,
  classNames,
}: {
  itemName: string;
  /** Team and supervisor names in the event so far. */
  units: string[];
  value: string;
  onChange: (unit: string) => void;
  classNames?: Record<string, string>;
}) {
  if (units.length === 0) return null;
  // A holder no longer in the event still shows, so it can be cleared.
  const options = value && !units.includes(value) ? [...units, value] : units;
  return (
    <Select
      aria-label={`Team holding ${itemName}`}
      placeholder="No team"
      size="sm"
      variant="flat"
      selectedKeys={new Set([value || '__none'])}
      onSelectionChange={(keys) => {
        const key = Array.from(keys as Set<string>)[0];
        onChange(!key || key === '__none' ? '' : key);
      }}
      classNames={{ ...classNames, base: 'w-40' }}
      data-testid={`equipment-team-${itemName}`}
    >
      {[<SelectItem key="__none">No team</SelectItem>, ...options.map((u) => <SelectItem key={u}>{u}</SelectItem>)]}
    </Select>
  );
}
