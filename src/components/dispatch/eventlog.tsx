'use client';

import React, { useMemo, useState } from 'react';
import { Button, Input } from '@heroui/react';
import { CornerDownLeft } from 'lucide-react';
import type { Event } from '@/app/types';
import { addEventNote, eventLogRows } from '@/lib/eventLog';
import { currentLog, isMciActive, undoneIds } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { describeMciEntry } from './mci/mcilogdrawer';
import { MCI_INPUT_CLASSNAMES, formatClock } from './mci/mciparts';

type UpdateEvent = (updates: Partial<Event> | ((current: Event) => Partial<Event>)) => Promise<void>;

interface Row {
  key: string;
  t: number;
  source: string;
  text: string;
  /** An MCI entry that can still be undone. */
  undoId?: string;
  undone?: boolean;
}

/**
 * The left panel's Log view: one running timeline, newest first, of every team, supervisor and call log
 * entry, every MCI log entry (with Undo while the MCI is active) and the notes typed here. Built from those
 * logs each time (src/lib/eventLog.ts), so edits in a team's or call's own log show here too. Enter adds a
 * note.
 */
export default function EventLog({ event, updateEvent, onUndoMci, readOnly = false }: { event: Event; updateEvent: UpdateEvent; onUndoMci: (entryId: string) => void; readOnly?: boolean }) {
  const { t } = useDispatchTerms();
  const [note, setNote] = useState('');
  const { staff, supervisor, calls, eventLog, mci } = event;

  const rows = useMemo(() => {
    const out: Row[] = eventLogRows({ staff, supervisor, calls, eventLog });
    if (mci) {
      const log = currentLog(mci);
      const undone = undoneIds(log);
      const active = isMciActive({ mci });
      for (const entry of log) {
        if (entry.kind === 'noted' && !entry.note) continue;
        const isUndone = undone.has(entry.id);
        out.push({
          key: `mci:${entry.id}`,
          t: entry.t,
          source: entry.byUnit ?? 'MCI',
          text: describeMciEntry(mci, entry),
          ...(active && entry.kind !== 'undo' && !isUndone ? { undoId: entry.id } : {}),
          ...(isUndone ? { undone: true } : {}),
        });
      }
    }
    return out.sort((a, b) => b.t - a.t);
  }, [staff, supervisor, calls, eventLog, mci]);

  const submit = () => {
    if (!note.trim()) return;
    const text = note;
    setNote('');
    void updateEvent((current) => addEventNote(current, text, Date.now()));
  };

  return (
    <div className="flex flex-col gap-2 px-2 py-2" data-testid="event-log">
      {!readOnly && (
        <Input
          aria-label="Add a note to the log"
          placeholder="Add a note…"
          size="sm"
          radius="lg"
          value={note}
          onValueChange={setNote}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          classNames={MCI_INPUT_CLASSNAMES}
          endContent={<CornerDownLeft className={`h-4 w-4 shrink-0 ${note.trim() ? 'text-surface-light' : 'text-surface-faint'}`} aria-hidden />}
          data-testid="event-log-input"
        />
      )}
      {rows.length === 0 && <p className="px-1 text-sm italic text-surface-faint">{t('No log entries')}</p>}
      <ul className="flex flex-col divide-y divide-surface-liner">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[auto_minmax(4.5rem,auto)_minmax(0,1fr)_auto] items-baseline gap-x-2 py-1.5 text-sm" data-testid="event-log-row">
            <span className="font-mono text-xs text-surface-faint">{formatClock(r.t)}</span>
            <span className="truncate font-bold text-surface-light">{r.source}</span>
            <span className={`min-w-0 break-words ${r.undone ? 'text-surface-faint line-through' : 'text-surface-light'}`}>{r.text}</span>
            {r.undoId ? (
              <Button size="sm" variant="flat" radius="lg" className="h-6 min-w-0 px-2 text-xs" onPress={() => onUndoMci(r.undoId!)} data-testid="event-log-undo">
                {t('Undo')}
              </Button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
