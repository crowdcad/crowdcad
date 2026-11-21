"use client";

import React, { useState } from 'react';
import { getLocalTimeZone, parseDate, Time, today } from '@internationalized/date';
import { DatePicker, Input, TimeInput, Tooltip } from '@heroui/react';
import { ChevronDown, CircleHelp } from 'lucide-react';
import type { Event } from '@/app/types';
import SurgeCriteriaSection from './SurgeCriteriaSection';
import { EVENT_INPUT_CLASSNAMES } from './fieldClassNames';

/** The event's date for the date picker; today when unset or unreadable. */
function calendarDateOf(date: string | undefined) {
  try {
    if (date) return parseDate(date);
  } catch {
    // fall through
  }
  return today(getLocalTimeZone());
}

type Props = {
  eventData: Partial<Event>;
  setEventData: React.Dispatch<React.SetStateAction<Partial<Event> & { eventEquipment: Event['eventEquipment'] }>>;
  scheduleFrom: Time;
  setScheduleFrom: (time: Time) => void;
  scheduleTo: Time;
  setScheduleTo: (time: Time) => void;
  inputClassNames?: {
    label: string;
    inputWrapper: string;
    input: string;
  };
};

export default function MetadataSection({
  eventData,
  setEventData,
  scheduleFrom,
  setScheduleFrom,
  scheduleTo,
  setScheduleTo,
  inputClassNames = EVENT_INPUT_CLASSNAMES,
}: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const crossesMidnight =
    scheduleTo.hour * 60 + scheduleTo.minute <= scheduleFrom.hour * 60 + scheduleFrom.minute;

  return (
    <div className="space-y-4">
      <div>
        <Input
          label="Event Name"
          labelPlacement="outside"
          variant="flat"
          color="default"
          placeholder="Enter event name"
          value={eventData.name || ''}
          onValueChange={(value) => setEventData((prev) => ({ ...prev, name: value }))}
          isRequired
          classNames={inputClassNames}
          size="lg"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <DatePicker
          label="Event Date"
          labelPlacement="outside"
          variant="flat"
          color="default"
          value={calendarDateOf(eventData.date)}
          onChange={(date) => {
            if (date) {
              setEventData((prev) => ({ ...prev, date: date.toString() }));
            }
          }}
          isRequired
          classNames={inputClassNames}
          size="lg"
        />
        <TimeInput
          label={
            <span className="inline-flex items-center gap-1">
              Start Time
              <Tooltip content="When the event's scheduled window begins. The event itself goes active as soon as you create it, not at this time." placement="top">
                <CircleHelp className="w-3.5 h-3.5 text-surface-faint" />
              </Tooltip>
            </span>
          }
          labelPlacement="outside"
          variant="flat"
          color="default"
          value={scheduleFrom}
          onChange={(value) => value && setScheduleFrom(value)}
          hourCycle={24}
          isRequired
          classNames={inputClassNames}
          size="lg"
        />
        <TimeInput
          label={
            <span className="inline-flex items-center gap-1">
              End Time
              <Tooltip content="Doesn't end the event automatically. The event stays open until you mark it finished, or until an hour passes with no activity after this time." placement="top">
                <CircleHelp className="w-3.5 h-3.5 text-surface-faint" />
              </Tooltip>
            </span>
          }
          labelPlacement="outside"
          variant="flat"
          color="default"
          value={scheduleTo}
          onChange={(value) => value && setScheduleTo(value)}
          hourCycle={24}
          isRequired
          classNames={inputClassNames}
          size="lg"
        />
      </div>
      {crossesMidnight && (
        <p className="text-xs text-surface-faint">Ends the next day, past midnight.</p>
      )}

      <div className="pt-2 border-t border-surface-liner">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          className="flex items-center gap-1.5 text-sm text-surface-faint hover:text-surface-light py-2"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          Advanced settings
        </button>
        {advancedOpen && (
          <div className="pt-1">
            <SurgeCriteriaSection
              eventData={eventData}
              setEventData={setEventData}
              inputClassNames={inputClassNames}
            />
          </div>
        )}
      </div>
    </div>
  );
}
