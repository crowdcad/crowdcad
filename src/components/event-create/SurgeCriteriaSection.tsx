"use client";

import React from 'react';
import { Input, Tooltip } from '@heroui/react';
import { CircleHelp } from 'lucide-react';
import type { Event } from '@/app/types';

type Props = {
  eventData: Partial<Event>;
  setEventData: React.Dispatch<React.SetStateAction<Partial<Event> & { eventEquipment: Event['eventEquipment'] }>>;
  inputClassNames: {
    label: string;
    inputWrapper: string;
    input: string;
  };
};

// A single label style shared by all three columns below, rendered above the
// input(s) as a plain block rather than via HeroUI's `Input` `label` prop.
// The Unassigned Call Time column needs one label spanning two inputs, which
// `label`/`labelPlacement="outside"` can't do — rendering all three columns'
// labels this same way (instead of mixing HeroUI's label for two columns and
// a hand-rolled one for the third) keeps the spacing identical everywhere,
// so the columns line up without needing per-column offset tweaks.
function FieldLabel({
  text,
  tooltip,
  className,
}: {
  text: string;
  tooltip: string;
  className: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1 text-medium mb-1.5 ${className}`}>
      {text}
      <Tooltip content={tooltip} placement="top">
        <CircleHelp className="w-3.5 h-3.5 text-surface-faint" />
      </Tooltip>
    </div>
  );
}

export default function SurgeCriteriaSection({ eventData, setEventData, inputClassNames }: Props) {
  const unassignedCallSurgeSeconds = eventData.unassignedCallSurgeSeconds ?? 120;
  const unassignedMinutes = Math.floor(unassignedCallSurgeSeconds / 60);
  const unassignedSeconds = unassignedCallSurgeSeconds % 60;

  const setUnassignedCallSurgeSeconds = (minutes: number, seconds: number) => {
    const clampedMinutes = Number.isFinite(minutes) ? Math.max(0, minutes) : unassignedMinutes;
    const clampedSeconds = Number.isFinite(seconds) ? Math.min(59, Math.max(0, seconds)) : unassignedSeconds;
    const total = clampedMinutes * 60 + clampedSeconds;
    setEventData((prev) => ({
      ...prev,
      unassignedCallSurgeSeconds: total > 0 ? total : prev.unassignedCallSurgeSeconds,
    }));
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <FieldLabel
          text="Surge Limit"
          tooltip="Percent of teams on calls at which the dispatch board's surge display turns red."
          className={inputClassNames.label}
        />
        <Input
          type="number"
          data-testid="surge-limit-input"
          variant="flat"
          color="default"
          placeholder="70"
          min={1}
          max={100}
          value={String(eventData.surgeLimitPercent ?? 70)}
          onValueChange={(value) => {
            const parsed = Number(value);
            setEventData((prev) => ({
              ...prev,
              surgeLimitPercent: Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : prev.surgeLimitPercent,
            }));
          }}
          endContent={<span className="text-surface-faint text-sm">%</span>}
          classNames={inputClassNames}
          size="lg"
        />
      </div>

      <div>
        <FieldLabel
          text="Patients Pending Transport"
          tooltip="Number of patients marked Pending transport (combining Calls and Clinic) at which a surge alert fires."
          className={inputClassNames.label}
        />
        <Input
          type="number"
          data-testid="pending-transport-surge-input"
          variant="flat"
          color="default"
          placeholder="3"
          min={1}
          value={String(eventData.pendingTransportSurgeThreshold ?? 3)}
          onValueChange={(value) => {
            const parsed = Number(value);
            setEventData((prev) => ({
              ...prev,
              pendingTransportSurgeThreshold: Number.isFinite(parsed) && parsed >= 1 ? Math.round(parsed) : prev.pendingTransportSurgeThreshold,
            }));
          }}
          classNames={inputClassNames}
          size="lg"
        />
      </div>

      <div>
        <FieldLabel
          text="Unassigned Call Time"
          tooltip="How long a call can sit with no team assigned before a surge alert fires. Default 2:00 (minutes:seconds)."
          className={inputClassNames.label}
        />
        <div className="flex items-center gap-2">
          <Input
            type="number"
            aria-label="Unassigned call surge minutes"
            data-testid="unassigned-call-surge-minutes-input"
            variant="flat"
            color="default"
            min={0}
            value={String(unassignedMinutes)}
            onValueChange={(value) => setUnassignedCallSurgeSeconds(Number(value), unassignedSeconds)}
            endContent={<span className="text-surface-faint text-sm">min</span>}
            classNames={inputClassNames}
            size="lg"
          />
          <Input
            type="number"
            aria-label="Unassigned call surge seconds"
            data-testid="unassigned-call-surge-seconds-input"
            variant="flat"
            color="default"
            min={0}
            max={59}
            value={String(unassignedSeconds)}
            onValueChange={(value) => setUnassignedCallSurgeSeconds(unassignedMinutes, Number(value))}
            endContent={<span className="text-surface-faint text-sm">sec</span>}
            classNames={inputClassNames}
            size="lg"
          />
        </div>
      </div>
    </div>
  );
}
