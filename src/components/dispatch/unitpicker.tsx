'use client';
/**
 * A call's Add Team / Add Supervisor rows: the unit, then where it is and how far from the call (a green dot when
 * that comes from a live position). Units on break or in clinic are tinted, as before. Options come from
 * unitOptions (src/lib/unitDistance.ts).
 */
import React from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { formatMeters } from '@/lib/geo/distance';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import type { UnitOption } from '@/lib/unitDistance';

const ITEM = 'text-surface-light hover:bg-surface-liner focus:bg-surface-liner cursor-pointer';

/** One row's content: name (and status when not available), then location and meters. */
export function UnitPickerLabel({ option }: { option: UnitOption }) {
  const { t } = useDispatchTerms();
  return (
    <span className="flex w-full min-w-[13rem] items-center gap-2" data-testid={`unit-option-${option.name}`}>
      <span className="font-semibold">{option.label}</span>
      {option.inactive && <span className="text-xs text-surface-light/80">({t(option.status)})</span>}
      <span className="ml-auto flex items-center gap-1.5 pl-2 text-xs text-surface-faint">
        {option.live && <span className="h-1.5 w-1.5 shrink-0 rounded-circle bg-status-green" title="Live position" aria-label="Live position" />}
        {option.location && <span className="max-w-[9rem] truncate">{option.location}</span>}
        {option.distance !== undefined && (
          <span className="font-mono tabular-nums text-surface-light" data-testid={`unit-distance-${option.name}`}>
            {formatMeters(option.distance)}
          </span>
        )}
      </span>
    </span>
  );
}

/** The rows for a list of units; `emptyLabel` when none is free. */
export function UnitPickerItems({
  options,
  onPick,
  emptyLabel,
  testIdPrefix,
}: {
  options: UnitOption[];
  onPick: (unit: string) => void;
  emptyLabel: string;
  testIdPrefix?: string;
}) {
  if (!options.length) {
    return (
      <DropdownMenuItem disabled className="text-surface-faint">
        {emptyLabel}
      </DropdownMenuItem>
    );
  }
  return (
    <>
      {options.map((o) => (
        <DropdownMenuItem
          key={o.name}
          data-testid={testIdPrefix ? `${testIdPrefix}-${o.name}` : undefined}
          className={`${ITEM} ${o.inactive ? 'bg-status-card-blue' : ''}`}
          onClick={() => onPick(o.name)}
        >
          <UnitPickerLabel option={o} />
        </DropdownMenuItem>
      ))}
    </>
  );
}
