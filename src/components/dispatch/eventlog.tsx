'use client';

import React, { useMemo, useState } from 'react';
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownSection, DropdownTrigger, Input } from '@heroui/react';
import { ListFilter, Search } from '@/components/ui/icons';
import type { Event } from '@/app/types';
import { ALL_EVENT_LOG, EVENT_LOG_WINDOWS, eventLogKinds, eventLogRows, filterEventLog, type EventLogFilter, type EventLogKind } from '@/lib/eventLog';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { formatClock } from '@/lib/clock';
import { PANEL_INPUT_CLASSNAMES } from '@/components/ui/fieldClassNames';
import type { LogRow } from '@/extensions/types';
import { useDispatchExtras } from '@/extensions/dispatch';


/**
 * The Log view's filter (beside the panel's section picker): which kinds of entries, and how recent.
 */
export function EventLogFilterButton({ filter, onChange }: { filter: EventLogFilter; onChange: (filter: EventLogFilter) => void }) {
  const kinds = eventLogKinds();
  const narrowed = filter.hiddenKinds.length > 0 || filter.windowMinutes > 0;
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
        selectedKeys={new Set([...kinds.map((k) => k.key).filter((k) => !filter.hiddenKinds.includes(k)), `window:${filter.windowMinutes}`])}
        onAction={(key) => {
          const k = String(key);
          if (k.startsWith('window:')) return onChange({ ...filter, windowMinutes: Number(k.slice(7)) });
          const kind = k as EventLogKind;
          const hiddenKinds = filter.hiddenKinds.includes(kind) ? filter.hiddenKinds.filter((x) => x !== kind) : [...filter.hiddenKinds, kind];
          onChange({ ...filter, hiddenKinds });
        }}
      >
        <DropdownSection title="Show" showDivider>
          {kinds.map((k) => (
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
 * entry, notes from earlier events, and extension packs' rows (with Undo where they allow it).
 * Built from those logs each time (src/lib/eventLog.ts), so edits in a team's or call's own log show here
 * too. The search takes keywords and/or a time range ("14:00-15:30"); the filter (EventLogFilterButton)
 * picks kinds and how recent.
 */
export default function EventLog({
  event,
  filter = ALL_EVENT_LOG,
}: {
  event: Event;
  filter?: EventLogFilter;
}) {
  const { t } = useDispatchTerms();
  const extraRows = useDispatchExtras().logRows;
  const [query, setQuery] = useState('');
  const { staff, supervisor, calls, eventLog } = event;

  const rows = useMemo(
    () => [...eventLogRows({ staff, supervisor, calls, eventLog }), ...extraRows].sort((a: LogRow, b: LogRow) => b.t - a.t) as LogRow[],
    [staff, supervisor, calls, eventLog, extraRows]
  );
  const shown = useMemo(() => filterEventLog(rows, filter, query, Date.now(), formatClock), [rows, filter, query]);

  return (
    <div className="flex flex-col gap-2 px-2 py-2" data-testid="event-log">
      {/* Stays at the top while the log scrolls under it. */}
      <div className="sticky top-0 z-10 -mx-2 -mt-2 bg-surface-deepest px-2 pb-1 pt-2">
        <Input
          aria-label="Search the log"
          placeholder="Search words or a time range (14:00-15:30)"
          size="sm"
          radius="lg"
          isClearable
          value={query}
          onValueChange={setQuery}
          classNames={PANEL_INPUT_CLASSNAMES}
          startContent={<Search className="h-4 w-4 shrink-0 text-surface-faint" aria-hidden />}
          data-testid="event-log-search"
        />
      </div>
      {shown.length === 0 && <p className="px-1 text-sm italic text-surface-faint">{rows.length ? 'Nothing matches.' : t('No log entries')}</p>}
      <ul className="flex flex-col divide-y divide-surface-liner">
        {shown.map((r) => (
          <li key={r.key} className="grid grid-cols-[auto_minmax(4.5rem,auto)_minmax(0,1fr)_auto] items-baseline gap-x-2 py-1.5 text-sm" data-testid="event-log-row">
            <span className="font-mono text-xs text-surface-faint">{formatClock(r.t)}</span>
            <span className="truncate font-bold text-surface-light">{r.source}</span>
            <span className={`min-w-0 break-words ${r.undone ? 'text-surface-faint line-through' : 'text-surface-light'}`}>{r.text}</span>
            {r.undo ? (
              <Button size="sm" variant="flat" radius="lg" className="h-6 min-w-0 px-2 text-xs" onPress={r.undo} data-testid="event-log-undo">
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
