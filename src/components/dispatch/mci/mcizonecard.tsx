'use client';

import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@heroui/react';
import type { MciColor } from '@/app/types';
import { MCI_COLORS, type MciZoneStats } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { MCI_COLOR_STYLES, MciColorDot, MciTeamChips } from './mciparts';

type Props = {
  stats: MciZoneStats;
  /** Names of the teams in Triage at this zone. */
  teams: string[];
  readOnly: boolean;
  onTag: (zoneId: string, color: MciColor, delta: number) => void;
  onSetTagged: (zoneId: string, color: MciColor, total: number) => void;
  onMove: (zoneId: string) => void;
  onClear: (zoneId: string) => void;
  onReopen: (zoneId: string) => void;
};

/** The Tagged number. Tapping it lets the dispatcher type a new total, written as one delta entry. */
function TaggedValue({ value, label, disabled, onCommit }: { value: number; label: string; disabled: boolean; onCommit: (total: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const total = Number.parseInt(draft, 10);
    if (Number.isInteger(total) && total >= 0 && total !== value) onCommit(total);
    else setDraft(String(value));
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={`${label} tagged total`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(String(value));
            setEditing(false);
          }
        }}
        className="h-7 w-14 rounded-md border border-surface-liner bg-surface-deep text-center text-sm tabular-nums text-surface-light outline-none focus:outline-none focus:ring-0 focus-visible:ring-0"
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      aria-label={`${label} tagged total ${value}. Edit`}
      className="h-7 min-w-10 rounded-md px-1 text-center text-sm font-semibold tabular-nums text-surface-light hover:bg-surface-liner disabled:cursor-default disabled:hover:bg-transparent"
    >
      {value}
    </button>
  );
}

export default function MciZoneCard({ stats, teams, readOnly, onTag, onSetTagged, onMove, onClear, onReopen }: Props) {
  const { t } = useDispatchTerms();
  const { zone } = stats;
  const name = zone.name;

  return (
    <section
      className={`flex flex-col gap-2 rounded-lg border p-3 ${stats.cleared ? 'border-status-card-ring-green bg-status-card-green' : 'border-surface-liner bg-surface-deepest'}`}
      aria-label={`${name} zone`}
      data-testid={`mci-zone-${name}`}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="truncate text-base font-bold text-surface-light">{name}</h3>
        {stats.cleared && (
          <span className="rounded-md border border-status-card-ring-green px-2 py-0.5 text-xs font-semibold text-status-green" data-testid={`mci-zone-cleared-${name}`}>
            {t('Zone clear')}
          </span>
        )}
      </header>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-surface-faint">
            <th className="text-left font-normal" />
            <th className="font-normal">{t('Tagged')}</th>
            <th className="font-normal">{t('Moved')}</th>
            <th className="font-normal">{t('In zone')}</th>
          </tr>
        </thead>
        <tbody>
          {MCI_COLORS.map((color) => {
            const label = MCI_COLOR_STYLES[color].label;
            return (
              <tr key={color} data-testid={`mci-zone-${name}-${color}`}>
                <td className="py-0.5 pr-2">
                  <span className="inline-flex items-center gap-1.5 text-surface-light">
                    <MciColorDot color={color} />
                    {label}
                  </span>
                </td>
                <td className="py-0.5">
                  <div className="flex items-center justify-center gap-0.5">
                    <button
                      type="button"
                      disabled={readOnly || stats.inZone[color] <= 0}
                      onClick={() => onTag(zone.id, color, -1)}
                      aria-label={`Remove one ${label.toLowerCase()} from ${name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-surface-liner text-surface-light hover:bg-surface-liner disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <TaggedValue value={stats.tagged[color]} label={`${name} ${label}`} disabled={readOnly} onCommit={(total) => onSetTagged(zone.id, color, total)} />
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => onTag(zone.id, color, 1)}
                      aria-label={`Add one ${label.toLowerCase()} to ${name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-surface-liner text-surface-light hover:bg-surface-liner disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td className="text-center tabular-nums text-surface-light">{stats.moved[color]}</td>
                <td className="text-center font-semibold tabular-nums text-surface-light" data-testid={`mci-zone-${name}-${color}-inzone`}>
                  {stats.inZone[color]}
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-surface-liner text-xs text-surface-faint">
            <td className="pt-1">Total</td>
            <td className="pt-1 text-center tabular-nums">{stats.taggedTotal}</td>
            <td className="pt-1 text-center tabular-nums">{stats.movedTotal}</td>
            <td className="pt-1 text-center font-semibold tabular-nums text-surface-light" data-testid={`mci-zone-${name}-inzone-total`}>
              {stats.inZoneTotal}
            </td>
          </tr>
        </tbody>
      </table>

      {!readOnly && stats.suggestClear && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-status-card-ring-yellow bg-status-card-yellow px-2 py-1" data-testid={`mci-zone-suggest-${name}`}>
          <span className="text-sm text-surface-light">
            {name}: 0 left. {t('Mark clear')}?
          </span>
          <Button size="sm" variant="flat" radius="lg" onPress={() => onClear(zone.id)} data-testid={`mci-zone-clear-${name}`}>
            {t('Mark clear')}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <MciTeamChips names={teams} emptyText="No teams in triage" />
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-1.5">
            {stats.cleared ? (
              <Button size="sm" variant="bordered" radius="lg" onPress={() => onReopen(zone.id)} data-testid={`mci-zone-reopen-${name}`}>
                {t('Reopen zone')}
              </Button>
            ) : (
              !stats.suggestClear && (
                <Button size="sm" variant="bordered" radius="lg" onPress={() => onClear(zone.id)} data-testid={`mci-zone-clear-${name}`}>
                  {t('Mark clear')}
                </Button>
              )
            )}
            <Button
              size="sm"
              radius="lg"
              className="bg-accent text-surface-light"
              isDisabled={stats.inZoneTotal <= 0}
              onPress={() => onMove(zone.id)}
              data-testid={`mci-zone-move-${name}`}
            >
              {t('Move to treatment')}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
