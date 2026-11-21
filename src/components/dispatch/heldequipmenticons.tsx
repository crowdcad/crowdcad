'use client';

import React, { useMemo } from 'react';
import { Tooltip } from '@heroui/react';
import type { Event } from '@/app/types';
import { fleetOf, heldBy } from '@/lib/equipmentCustody';
import { getEquipmentIconType } from '@/lib/equipmentIcon';
import EquipmentTypeIcon from './equipmenttypeicon';

/**
 * Small icons for the equipment a unit has in hand (a bag, a wheelchair...),
 * next to the unit on its calls (#139), so a dispatcher sees at a glance what
 * the responding team carries. A tooltip names each item.
 */
export default function HeldEquipmentIcons({ event, unit }: { event: Event; unit: string }) {
  const held = useMemo(() => heldBy(fleetOf(event), event, unit), [event, unit]);
  if (!held.length) return null;
  return (
    <Tooltip content={held.map((eq) => eq.name).join(', ')} placement="top">
      <span className="inline-flex items-center gap-0.5" aria-label={`Carrying ${held.map((eq) => eq.name).join(', ')}`} data-testid={`held-equipment-${unit}`}>
        {held.map((eq) => (
          <EquipmentTypeIcon key={eq.id} type={getEquipmentIconType(eq.name)} className="h-3.5 w-3.5 shrink-0" />
        ))}
      </span>
    </Tooltip>
  );
}
