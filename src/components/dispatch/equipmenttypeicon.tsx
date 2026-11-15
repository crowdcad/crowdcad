// equipmenttypeicon.tsx
'use client';

import React from 'react';
import { Briefcase } from 'lucide-react';
import type { EquipmentIconType } from '@/lib/equipmentIcon';

type Props = {
  type: EquipmentIconType;
  className?: string;
};

/**
 * An equipment type's icon: a wheelchair, a gurney, or a medical briefcase
 * for 'aed' and anything else. All three are drawn in `currentColor`, so they
 * take the color of the text around them (a team card's status color, a
 * pill's text, white on the map's badges).
 */
export default function EquipmentTypeIcon({ type, className = 'w-4 h-4 shrink-0' }: Props) {
  if (type === 'wheelchair') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} role="img" aria-label="Wheelchair">
        <path d="M12 16a5 5 0 1 1-10 0a5 5 0 0 1 10 0Zm6 3.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0Z" />
        <path d="M7.008 16h-.009" />
        <path d="m6 11l-.628-5.023c-.145-1.159-.217-1.738-.522-2.155a2 2 0 0 0-.647-.572C3.751 3 3.167 3 2 3m4 4h5.5c2.357 0 3.536 0 4.268.732S16.5 9.643 16.5 12v6" />
        <path d="M12 14h4.024c.885 0 1.328 0 1.713.189q.14.068.267.158c.356.25.601.659 1.092 1.474c.393.653.59.98.884 1.107q.105.044.215.063c.312.052.629-.124 1.263-.475l.542-.3" />
      </svg>
    );
  }
  if (type === 'stretcher') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} role="img" aria-label="Gurney">
        <path d="M18 4.5h3a1 1 0 0 0 0-2h-3a1 1 0 0 0 0 2m3 2H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1.55l5.11 2.56l-2.58 1.29A3 3 0 0 0 5 15.5a3 3 0 1 0 3 3a2 2 0 0 0 0-.36l3.94-2l4.06 2.1a2 2 0 0 0 0 .26a3 3 0 1 0 3-3a3 3 0 0 0-2.15.92l-2.72-1.36l5.11-2.56H21a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1m-16 13a1 1 0 1 1 1-1a1 1 0 0 1-1 1m14-2a1 1 0 1 1-1 1a1 1 0 0 1 1-1m-7.1-3.56L9 12.5h5.75ZM20 10.5H4v-2h16Z" />
      </svg>
    );
  }
  return <Briefcase className={className} aria-hidden="true" />;
}

/**
 * Word shown in place of an equipment-run status's "Eq" suffix, deliberately
 * NOT routed through the dispatch vocabulary's t() — 'Delivered Eq'/
 * 'En Route Eq' still translate to their plain, unmodified selves everywhere
 * else (the sidebar team card's status Select shows the same two keys and
 * has no equipment-icon/name context to complete this phrasing with). Scoped
 * to the call tracker's per-call chip, which does have that context.
 */
export function getEquipmentStatusWord(status: string): string {
  if (status === 'Retrieving Eq') return 'Retrieving';
  if (status === 'Delivered Eq') return 'Delivered';
  if (status === 'En Route Eq') return 'En Route';
  if (status === 'Returning Eq') return 'Returning';
  return status;
}

/** Equipment statuses whose "Eq" suffix is swapped for the equipment's icon, or its name in menus. */
export function isEquipmentIconStatus(status: string): boolean {
  return status === 'Retrieving Eq' || status === 'En Route Eq' || status === 'Delivered Eq' || status === 'Returning Eq';
}

/** Menu label naming the equipment: "Retrieving - Wheelchair 1", "Delivered Wheelchair 1". */
export function getEquipmentStatusMenuLabel(status: string, equipmentNames: string): string {
  if (status === 'Retrieving Eq' || status === 'En Route Eq') return `${getEquipmentStatusWord(status)} - ${equipmentNames}`;
  return `${getEquipmentStatusWord(status)} ${equipmentNames}`;
}
