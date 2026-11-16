'use client';

import React, { useMemo, useState } from 'react';
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownSection, DropdownTrigger, Input } from '@heroui/react';
import { ListFilter, Search } from 'lucide-react';
import type { Event } from '@/app/types';
import { ALL_EVENT_LOG, EVENT_LOG_KINDS, EVENT_LOG_WINDOWS, eventLogRows, filterEventLog, type EventLogFilter, type EventLogKind } from '@/lib/eventLog';
import { currentLog, isMciActive, mciPeriodEntries, undoneIds } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { describeMciEntry } from './mci/mcilogdrawer';
import { MCI_INPUT_CLASSNAMES, formatClock } from './mci/mciparts';

interface Row {
  key: string;
  t: number;
  source: string;
  kind: EventLogKind;
  text: string;
  /** An MCI entry that can still be undone. */
  undoId?: string;
  undone?: boolean;
}

/**
 * The Log view's filter (beside the panel's section picker): which kinds of entries, and how recent.
 */
export function EventLogFilterButton({ filter, onChange }: { filter: EventLogFilter; onChange: (filter: EventLogFilter) => void }) {
  const narrowed = filter.kinds.length < EVENT_LOG_KINDS.length || filter.windowMinutes > 0;
  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button isIconOnly size="sm" variant="flat" radius="full" aria-label="Filter the log" className={narrowed ? 'bg-accent/30 text-surface-light' : ''} data-testid="event-log-filter">
          <ListFilter className="h-4 w-4" />
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Filter the log"
        closeOnSelect={false}
        selectionMode="multiple"
        selectedKeys={new Set([...filter.kinds, `window:${filter.windowMinutes}`])}
        onAction={(key) => {
          const k = String(key);
          if (k.startsWith('window:')) return onChange({ ...filter, windowMinutes: Number(k.slice(7)) });
          const kind = k as EventLogKind;
          const kinds = filter.kinds.includes(kind) ? filter.kinds.filter((x) => x !== kind) : [...filter.kinds, kind];
          onChange({ ...filter, kinds });
        }}
      >
        <DropdownSection title="Show" showDivider>
          {EVENT_LOG_KINDS.map((k) => (
            <DropdownItem key={k.key}>{k.label}</DropdownItem>
          ))}
        </DropdownSection>
        <DropdownSection title="When">
          {EVENT_LOG_WINDOWS.map((w) => (
            <DropdownItem key={`window:${w.minutes}`}>{w.label}</DropdownItem>
          ))}
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
  );
}

/**
 * The left panel's Log view: one running timeline, newest first, of every team, supervisor and call log
 * entry, every MCI log entry (with Undo while the MCI is active) and notes from earlier events. Built from
 * those logs each time (src/lib/eventLog.ts), so edits in a team's or call's own log show here too. The
 * search takes keywords and/or a time range ("14:00-15:30"); the filter (EventLogFilterButton) picks kinds
 * and how recent.
 */
export default function EventLog({ event, filter = ALL_EVENT_LOG, onUndoMci }: { event: Event; filter?: EventLogFilter; onUndoMci: (entryId: string) => void }) {
  const { t } = useDispatchTerms();
  const [query, setQuery] = useState('');
  const { staff, supervisor, calls, eventLog, mci } = event;

  const rows = useMemo(() => {
    const out: Row[] = eventLogRows({ staff, supervisor, calls, eventLog });
    if (mci) {
      // Declaring and ending an MCI are moments in the timeline too.
      for (const p of mciPeriodEntries(mci)) out.push({ key: `mci-period:${p.t}:${p.ended ? 'end' : 'start'}`, t: p.t, source: 'MCI', kind: 'mci', text: p.text });
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
          kind: 'mci',
          text: describeMciEntry(mci, entry),
          ...(active && entry.kind !== 'undo' && !isUndone ? { undoId: entry.id } : {}),
          ...(isUndone ? { undone: true } : {}),
        });
      }
    }
    return out.sort((a, b) => b.t - a.t);
  }, [staff, supervisor, calls, eventLog, mci]);
  const shown = useMemo(() => filterEventLog(rows, filter, query, Date.now(), formatClock), [rows, filter, query]);

  return (
    <div className="flex flex-col gap-2 px-2 py-2" data-testid="event-log">
      <Input
        aria-label="Search the log"
        placeholder="Search words or a time range (14:00-15:30)"
        size="sm"
        radius="lg"
        isClearable
        value={query}
        onValueChange={setQuery}
        classNames={MCI_INPUT_CLASSNAMES}
        startContent={<Search className="h-4 w-4 shrink-0 text-surface-faint" aria-hidden />}
        data-testid="event-log-search"
      />
      {shown.length === 0 && <p className="px-1 text-sm italic text-surface-faint">{rows.length ? 'Nothing matches.' : t('No log entries')}</p>}
      <ul className="flex flex-col divide-y divide-surface-liner">
        {shown.map((r) => (
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
