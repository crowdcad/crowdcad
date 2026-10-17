'use client';

import React, { useMemo } from 'react';
import type { Event } from '@/app/types';
import { mciAvailability } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';

type Props = { event: Event };

function CountPill({ colorClass, count, label }: { colorClass: string; count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`min-w-7 h-6 px-1.5 inline-flex items-center justify-center rounded-md border text-sm font-semibold leading-none text-surface-light tabular-nums ${colorClass}`}
        aria-label={`${count} ${label}`}
      >
        <span className="inline-block -translate-y-px">{count}</span>
      </span>
      <span className="text-xs text-surface-faint">{label}</span>
    </span>
  );
}

/** The availability strip while an MCI is active: Available, Triage, Treatment and Unavailable counts. */
export default function MciAvailabilityStrip({ event }: Props) {
  const { t } = useDispatchTerms();
  const counts = useMemo(() => mciAvailability(event), [event]);
  return (
    <div
      className="w-full flex items-center gap-4 pl-2 pr-3 py-2 border-b border-surface-liner"
      data-testid="availability-surge-strip"
      data-mci="true"
    >
      <CountPill colorClass="border-status-card-ring-green bg-status-card-green" count={counts.available} label={t('Available')} />
      <CountPill colorClass="border-status-card-ring-red bg-status-card-red" count={counts.triage} label={t('Triage')} />
      <CountPill colorClass="border-status-card-ring-blue bg-status-card-blue" count={counts.treatment} label={t('Treatment')} />
      <CountPill colorClass="border-surface-liner bg-surface-liner/50" count={counts.unavailable} label={t('Unavailable')} />
    </div>
  );
}
