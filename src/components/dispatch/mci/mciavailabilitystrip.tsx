'use client';

import React, { useMemo } from 'react';
import type { Event } from '@/app/types';
import { mciAvailability } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { CountPill } from '../availabilitysurgestrip';

type Props = { event: Event };

/** The availability strip while an MCI is active: Available, Triage, Treatment and Unavailable counts (numbers only; the label is the hover title). */
export default function MciAvailabilityStrip({ event }: Props) {
  const { t } = useDispatchTerms();
  const { staff, calls } = event;
  const counts = useMemo(() => mciAvailability({ staff, calls }), [staff, calls]);
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
