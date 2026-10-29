'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, MapPin, Minus, Plus } from 'lucide-react';
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import type { MciColor } from '@/app/types';
import { MCI_COLORS, type MciZoneStats } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { MCI_COLOR_STYLES, MCI_PILL_STYLES, MciTeamChips } from './mciparts';

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
  /** The venue has a map: show the draw-on-map button. */
  mapEnabled?: boolean;
  /** The zone already has a shape on the map (the button then edits it). */
  hasShape?: boolean;
  onDraw?: (zoneId: string) => void;
  /** Treatment locations the quick move can send to. */
  areas: { id: string; name: string }[];
  /** Where the plus beside Moved sends a patient. */
  quickMoveAreaId?: string;
  onQuickMove: (zoneId: string, color: MciColor) => void;
  onQuickMoveAreaChange: (zoneId: string, areaId: string) => void;
};

const QUICK_MOVE_BUTTON =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-surface-liner text-surface-light hover:bg-surface-liner disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

const NUMBER_WELL = 'h-6 w-10 rounded-sm bg-black/25 text-center text-sm font-semibold tabular-nums';
const STEP_BUTTON = 'flex h-8 w-6 shrink-0 items-center justify-center hover:bg-black/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

/** The Tagged number, in a slightly darker well inside the pill. Tapping it lets the dispatcher type a new total, written as one delta entry. */
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
        className={`${NUMBER_WELL} border-0 text-inherit outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      aria-label={`${label} tagged total ${value}. Edit`}
      className={`${NUMBER_WELL} hover:bg-black/35 disabled:cursor-default disabled:hover:bg-black/25`}
    >
      {value}
    </button>
  );
}

/** "+ moves to Clinic", with a menu to pick another location when there are several. */
function QuickMoveTarget({ zoneName, areas, areaId, onChange }: { zoneName: string; areas: Props['areas']; areaId?: string; onChange: (areaId: string) => void }) {
  const current = areas.find((a) => a.id === areaId);
  if (!current) return null;
  const label = <span className="truncate font-semibold text-surface-light">{current.name}</span>;
  return (
    <div className="flex min-w-0 items-center gap-1 text-xs text-surface-faint" data-testid={`mci-zone-quick-target-${zoneName}`}>
      <Plus className="h-3 w-3 shrink-0" aria-hidden />
      <span className="shrink-0">moves to</span>
      {areas.length === 1 ? (
        label
      ) : (
        <Dropdown>
          <DropdownTrigger>
            <button type="button" className="flex min-w-0 items-center gap-0.5 rounded-md px-1 hover:bg-surface-liner" aria-label={`Quick move destination for ${zoneName}: ${current.name}. Change`}>
              {label}
              <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
            </button>
          </DropdownTrigger>
          <DropdownMenu aria-label={`Quick move destination for ${zoneName}`} selectionMode="single" selectedKeys={new Set([current.id])} onAction={(key) => onChange(String(key))}>
            {areas.map((a) => (
              <DropdownItem key={a.id}>{a.name}</DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>
      )}
    </div>
  );
}

export default function MciZoneCard({
  stats,
  teams,
  readOnly,
  onTag,
  onSetTagged,
  onMove,
  onClear,
  onReopen,
  mapEnabled = false,
  hasShape = false,
  onDraw,
  areas,
  quickMoveAreaId,
  onQuickMove,
  onQuickMoveAreaChange,
}: Props) {
  const { t } = useDispatchTerms();
  const { zone } = stats;
  const name = zone.name;
  const quickArea = areas.find((a) => a.id === quickMoveAreaId);

  return (
    <section
      className={`flex flex-col gap-2 rounded-lg border p-3 ${stats.cleared ? 'border-status-card-ring-green bg-status-card-green' : 'border-surface-liner bg-surface-deepest'}`}
      aria-label={`${name} zone`}
      data-testid={`mci-zone-${name}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-base font-bold text-surface-light">{name}</h3>
          {mapEnabled && onDraw && (
            <button
              type="button"
              onClick={() => onDraw(zone.id)}
              aria-label={`${hasShape ? 'Edit' : 'Draw'} ${name} on the map`}
              title={hasShape ? 'Edit on the map' : 'Draw on the map'}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-surface-liner ${hasShape ? 'text-surface-faint' : 'text-status-orange'}`}
              data-testid={`mci-zone-draw-${name}`}
            >
              <MapPin className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {stats.cleared && (
            <span className="rounded-md border border-status-card-ring-green px-2 py-0.5 text-xs font-semibold text-status-green" data-testid={`mci-zone-cleared-${name}`}>
              {t('Zone clear')}
            </span>
          )}
          {!readOnly && stats.cleared && (
            <Button size="sm" variant="flat" radius="lg" className="h-6 min-w-0 px-2 text-xs" onPress={() => onReopen(zone.id)} data-testid={`mci-zone-reopen-${name}`}>
              {t('Reopen')}
            </Button>
          )}
          {!readOnly && !stats.cleared && stats.suggestClear && (
            <div className="flex items-center gap-1.5" data-testid={`mci-zone-suggest-${name}`}>
              <span className="text-xs text-surface-faint">0 patients</span>
              <Button size="sm" variant="flat" radius="lg" className="h-6 min-w-0 border border-status-card-ring-yellow bg-status-card-yellow px-2 text-xs" onPress={() => onClear(zone.id)} data-testid={`mci-zone-clear-${name}`}>
                {t('Clear')}?
              </Button>
            </div>
          )}
          {!readOnly && !stats.cleared && !stats.suggestClear && (
            <Button size="sm" variant="flat" radius="lg" className="h-6 min-w-0 px-2 text-xs" onPress={() => onClear(zone.id)} data-testid={`mci-zone-clear-${name}`}>
              {t('Clear')}
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-1">
        <span className="text-center text-xs uppercase text-surface-faint">{t('Tagged')}</span>
        <span className="text-center text-xs uppercase text-surface-faint">{t('Moved')}</span>
        <span className="text-center text-xs uppercase text-surface-faint">{t('In zone')}</span>

        {MCI_COLORS.map((color) => {
          const label = MCI_COLOR_STYLES[color].label;
          const pill = MCI_PILL_STYLES[color];
          return (
            <React.Fragment key={color}>
              <div className={`flex h-8 items-center justify-center overflow-hidden rounded-md ${pill.pill}`} data-testid={`mci-zone-${name}-${color}`}>
                <button
                  type="button"
                  disabled={readOnly || stats.inZone[color] <= 0}
                  onClick={() => onTag(zone.id, color, -1)}
                  aria-label={`Remove one ${label.toLowerCase()} from ${name}`}
                  className={STEP_BUTTON}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <TaggedValue value={stats.tagged[color]} label={`${name} ${label}`} disabled={readOnly} onCommit={(total) => onSetTagged(zone.id, color, total)} />
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => onTag(zone.id, color, 1)}
                  aria-label={`Add one ${label.toLowerCase()} to ${name}`}
                  className={STEP_BUTTON}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-center gap-1.5">
                {!readOnly && (
                  <button
                    type="button"
                    disabled={!quickArea || stats.inZone[color] <= 0}
                    onClick={() => onQuickMove(zone.id, color)}
                    aria-label={`Move one ${label.toLowerCase()} from ${name}${quickArea ? ` to ${quickArea.name}` : ''}`}
                    title={quickArea ? `Move one to ${quickArea.name}` : 'Add a treatment location first'}
                    className={QUICK_MOVE_BUTTON}
                    data-testid={`mci-zone-${name}-${color}-quickmove`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
                <span className="min-w-[1.5ch] text-center text-sm tabular-nums text-surface-light" data-testid={`mci-zone-${name}-${color}-moved`}>
                  {stats.moved[color]}
                </span>
              </div>
              <span className="text-center text-sm font-semibold tabular-nums text-surface-light" data-testid={`mci-zone-${name}-${color}-inzone`}>
                {stats.inZone[color]}
              </span>
            </React.Fragment>
          );
        })}

        <span className="border-t border-surface-liner pt-1 text-center text-xs tabular-nums text-surface-faint">{stats.taggedTotal}</span>
        <span className="border-t border-surface-liner pt-1 text-center text-xs tabular-nums text-surface-faint">{stats.movedTotal}</span>
        <span className="border-t border-surface-liner pt-1 text-center text-xs font-semibold tabular-nums text-surface-light" data-testid={`mci-zone-${name}-inzone-total`}>
          {stats.inZoneTotal}
        </span>
      </div>

      {!readOnly && <QuickMoveTarget zoneName={name} areas={areas} areaId={quickMoveAreaId} onChange={(areaId) => onQuickMoveAreaChange(zone.id, areaId)} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <MciTeamChips names={teams} emptyText="No teams in triage" />
        {!readOnly && (
          <Button
            size="sm"
            radius="lg"
            className="shrink-0 bg-accent text-surface-light"
            isDisabled={stats.inZoneTotal <= 0}
            onPress={() => onMove(zone.id)}
            data-testid={`mci-zone-move-${name}`}
          >
            {t('Move to treatment')}
          </Button>
        )}
      </div>
    </section>
  );
}
