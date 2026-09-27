'use client';

// Pieces shared by the mobile CallTrackingCard and ClinicTrackingCard (and the
// desktop call/clinic tables' dropdown animation). The two cards differ in
// their location field, status/team row and action menu; everything here
// used to be copy-pasted between them.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@heroui/react';
import type { Call, Event } from '@/app/types';
import TrackingTextEntry from '@/components/dispatch/trackingtextentry';
import DispatchMotionCell from '@/components/dispatch/motioncell';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { useMMSS } from '@/hooks/useMMSS';
import { textToLog } from '@/lib/logText';

/** Enter/exit animation for the dispatch tables' and cards' HeroUI dropdowns. */
export const dropdownMotionProps = {
  initial: { opacity: 0, y: -8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98 },
  transition: { duration: 0.16, ease: 'easeOut' },
} as const;

export const cardFieldClassNames = {
  input: 'text-surface-light bg-surface-deep outline-none focus:outline-none data-[focus=true]:outline-none',
  inputWrapper: 'bg-surface-deep shadow-none border border-surface-liner hover:bg-surface-liner group-data-[focus=true]:bg-surface-deep',
};

/** Enter commits a card field by blurring it (commit happens in onBlur). */
export const blurOnEnter = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
};

/** mm:ss since the call's first log entry (its creation). */
export function useCallTimer(call: Call): string {
  const callTimestamp = useMemo(() => (call.log && call.log.length > 0 ? call.log[0].timestamp : Date.now()), [call.log]);
  return useMMSS(callTimestamp);
}

/** Local edit state for a text field that re-syncs whenever the stored value changes. */
function useSyncedInput(value: string) {
  const [input, setInput] = useState(value);
  useEffect(() => {
    setInput(value);
  }, [value]);
  return [input, setInput] as const;
}

export function useSyncedLocationInput(call: Call) {
  return useSyncedInput(call.location || '');
}

/** Age/Sex (1/4 width) + Chief Complaint (3/4) row. */
export function CallAgeSexComplaintRow({
  call,
  formatAgeSex,
  onAgeSexChange,
  onChiefComplaintChange,
}: {
  call: Call;
  formatAgeSex: (age?: string | number, gender?: string) => string;
  onAgeSexChange: (callId: string, ageSex: string) => void;
  onChiefComplaintChange: (callId: string, chiefComplaint: string) => void;
}) {
  const { t } = useDispatchTerms();
  const [ageSexInput, setAgeSexInput] = useSyncedInput(formatAgeSex(call.age, call.gender) || '');
  const [chiefComplaintInput, setChiefComplaintInput] = useSyncedInput(call.chiefComplaint || '');

  return (
    <div className="flex gap-2">
      <Input
        label={t('Age/Sex')}
        labelPlacement="inside"
        value={ageSexInput}
        onChange={(e) => setAgeSexInput(e.target.value)}
        onBlur={() => {
          if (ageSexInput !== formatAgeSex(call.age, call.gender)) onAgeSexChange(call.id, ageSexInput);
        }}
        onKeyDown={blurOnEnter}
        variant="flat"
        classNames={cardFieldClassNames}
        className="w-1/4"
      />
      <Input
        label={t('Chief Complaint')}
        labelPlacement="inside"
        value={chiefComplaintInput}
        onChange={(e) => setChiefComplaintInput(e.target.value)}
        onBlur={() => {
          if (chiefComplaintInput !== call.chiefComplaint) onChiefComplaintChange(call.id, chiefComplaintInput);
        }}
        onKeyDown={blurOnEnter}
        variant="flat"
        classNames={cardFieldClassNames}
        className="flex-1"
      />
    </div>
  );
}

const joinLog = (log: Call['log']) => (log && log.length > 0 ? log.map(entry => entry.message).join('\n') : '');

/** Expandable Notes + editable Log section at the bottom of a call/clinic card. */
export function CallNotesAndLog({
  call,
  callDisplayNumber,
  event,
  updateEvent,
  expanded,
}: {
  call: Call;
  callDisplayNumber: number;
  event: Event;
  updateEvent: (updates: Partial<Event>) => Promise<void>;
  expanded: boolean;
}) {
  const { t } = useDispatchTerms();
  // Persistent local state for notes and log — never goes null to prevent
  // flicker, and doesn't re-sync from props while the field is focused.
  const [notesText, setNotesText] = useState(call.notes || '');
  const notesFocusedRef = useRef(false);
  const [logText, setLogText] = useState(() => joinLog(call.log));
  const logFocusedRef = useRef(false);

  useEffect(() => {
    if (!notesFocusedRef.current) setNotesText(call.notes || '');
  }, [call.notes]);

  useEffect(() => {
    if (!logFocusedRef.current) setLogText(joinLog(call.log));
  }, [call.log]);

  const saveCall = (updates: Partial<Call>) =>
    updateEvent({ calls: event.calls.map((c: Call) => (c.id === call.id ? { ...call, ...updates } : c)) });

  return (
    <DispatchMotionCell isOpen={expanded} animate overflowVisibleWhenOpen>
      <div
        className="pt-3 border-t border-surface-liner space-y-3"
        onClick={e => e.stopPropagation()}
        aria-hidden={!expanded}
      >
        {/* Notes - no log entry */}
        <div className="text-sm text-surface-light">
          <div className="font-semibold mb-1">{t('Notes')}</div>
          <TrackingTextEntry
            mode="note"
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            onBlur={async () => {
              notesFocusedRef.current = false;
              if ((call.notes || '') !== notesText) await saveCall({ notes: notesText });
            }}
            onFocus={() => {
              notesFocusedRef.current = true;
            }}
            minRows={2}
            maxRows={3}
            variant="flat"
            placeholder={t('Add notes')}
            className="min-w-0"
          />
        </div>

        {/* Log - editable textarea, one entry per line */}
        <div className="text-sm text-surface-light">
          <div className="font-semibold mb-1">{t('Log for Call')} #{callDisplayNumber}:</div>
          <TrackingTextEntry
            mode="log"
            value={logText}
            onChange={(e) => setLogText(e.target.value)}
            onBlur={async () => {
              logFocusedRef.current = false;
              // Keep unchanged lines' timestamps — the call timer counts from the first entry.
              const newLog = textToLog(logText, call.log);
              if (newLog) await saveCall({ log: newLog });
            }}
            onFocus={() => {
              logFocusedRef.current = true;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const now = new Date();
                const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
                setLogText(prev => prev + `\n${hhmm} - `);
              }
            }}
            minRows={4}
            maxRows={5}
            variant="flat"
            placeholder={t('No log entries')}
            className="min-w-0"
          />
        </div>
      </div>
    </DispatchMotionCell>
  );
}
