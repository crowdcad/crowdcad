'use client';

import React from 'react';
import { Chip } from '@heroui/react';
import { useElapsedSeconds, formatMMSS } from '@/hooks/useMMSS';
import { useSurgeFlashing, surgeAlarmClass } from '@/hooks/useSurgeFlashing';

const ALARM_THRESHOLD_SECONDS = 60;

type Props = {
  since?: number;
  label: string;
};

/** The chip shown in place of a team before any team is assigned to a call. Ticks a live mm:ss timer and, once pending 1+ minute, blinks between grey and the status-alarm orange until a team is assigned (or holds a steady orange when surge flashing is disabled in Preferences). */
export default function PendingCallChip({ since, label }: Props) {
  const elapsed = useElapsedSeconds(since);
  const isAlarming = elapsed >= ALARM_THRESHOLD_SECONDS;
  const { flashingDisabled } = useSurgeFlashing();

  return (
    <Chip
      size="lg"
      variant="flat"
      color="default"
      className={`text-surface-light h-8 shrink-0 border tabular-nums ${
        isAlarming
          ? surgeAlarmClass(flashingDisabled)
          : 'border-surface-liner bg-surface-liner/30'
      }`}
    >
      {label} {formatMMSS(elapsed)}
    </Chip>
  );
}
