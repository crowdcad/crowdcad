'use client';

import React from 'react';
import { Button } from '@heroui/react';
import type { Event, MciLogEntry } from '@/app/types';
import { MCI_LOG_DRAWER_SIZE, mciRecentEntries } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { MCI_COLOR_STYLES } from './mciparts';

type Props = {
  mci: NonNullable<Event['mci']>;
  readOnly: boolean;
  onUndo: (entryId: string) => void;
};

function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/** One log line in words, e.g. "Zone A: +3 red tagged" or "Zone A: 2 yellow moved to Clinic". */
export function describeMciEntry(mci: NonNullable<Event['mci']>, entry: MciLogEntry): string {
  const zone = mci.zones.find((z) => z.id === entry.zoneId)?.name ?? 'Zone';
  const area = mci.areas.find((a) => a.id === entry.areaId)?.name ?? 'treatment';
  const color = entry.color ? MCI_COLOR_STYLES[entry.color].label.toLowerCase() : '';
  switch (entry.kind) {
    case 'tagged':
      return `${zone}: ${(entry.n ?? 0) > 0 ? '+' : ''}${entry.n} ${color} tagged`;
    case 'moved':
      return `${zone}: ${entry.n} ${color} moved to ${area}`;
    case 'transported': {
      const from = mci.areas.find((a) => a.id === entry.areaId)?.name ?? 'treatment';
      return `${from}: ${entry.n} ${color} transported${entry.unit ? ` in ${entry.unit}` : ''}${entry.destination ? ` to ${entry.destination}` : ''}`;
    }
    case 'zone_cleared':
      return `${zone}: marked clear`;
    case 'zone_reopened':
      return `${zone}: reopened`;
    case 'undo': {
      const target = mci.log.find((e) => e.id === entry.undoes);
      return `Undid: ${target ? describeMciEntry(mci, target) : 'an earlier entry'}`;
    }
  }
}

/** The last entries with Undo on each. Undo appends a compensating entry; nothing is deleted. */
export default function MciLogDrawer({ mci, readOnly, onUndo }: Props) {
  const { t } = useDispatchTerms();
  const rows = mciRecentEntries(mci, MCI_LOG_DRAWER_SIZE);
  return (
    <div className="flex flex-col gap-1" data-testid="mci-log-drawer">
      <h3 className="text-sm font-bold text-surface-light">Last {MCI_LOG_DRAWER_SIZE} entries</h3>
      {rows.length === 0 && <p className="text-sm italic text-surface-faint">No entries yet</p>}
      <ul className="flex flex-col divide-y divide-surface-liner">
        {rows.map(({ entry, undone }) => (
          <li key={entry.id} className="flex items-center justify-between gap-3 py-1 text-sm" data-testid="mci-log-entry">
            <span className={`min-w-0 truncate ${undone || entry.kind === 'undo' ? 'text-surface-faint' : 'text-surface-light'} ${undone ? 'line-through' : ''}`}>
              <span className="mr-2 tabular-nums text-surface-faint">{clock(entry.t)}</span>
              {describeMciEntry(mci, entry)}
            </span>
            {entry.kind !== 'undo' && !undone && !readOnly && (
              <Button size="sm" variant="flat" radius="lg" onPress={() => onUndo(entry.id)} data-testid="mci-log-undo">
                {t('Undo')}
              </Button>
            )}
            {undone && <span className="text-xs text-surface-faint">Undone</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
