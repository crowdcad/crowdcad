'use client';

import React, { useMemo, useState } from 'react';
import { Button, Input } from '@heroui/react';
import type { Event, MciColor } from '@/app/types';
import { deriveMci, mciUnitsAt, type MciCounts } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import type { MciActions } from './usemciactions';
import MciTotalsStrip from './mcitotalsstrip';
import MciZoneCard from './mcizonecard';
import MciTreatmentCard from './mcitreatmentcard';
import MciMoveModal from './mcimovemodal';
import MciLogDrawer from './mcilogdrawer';

type Props = {
  event: Event;
  actions: MciActions;
};

const inputClassNames = {
  inputWrapper: 'rounded-xl px-3 group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0',
  input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
} as const;

/** One-line "add by name" form, for zones and treatment areas added after declaring. */
function AddByName({ label, testId, onAdd }: { label: string; testId: string; onAdd: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (await onAdd(trimmed)) setName('');
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label={label}
        placeholder={label}
        size="sm"
        radius="lg"
        className="w-56"
        value={name}
        onValueChange={setName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
        }}
        classNames={inputClassNames}
        data-testid={`${testId}-input`}
      />
      <Button size="sm" variant="bordered" radius="lg" onPress={submit} isDisabled={!name.trim()} data-testid={`${testId}-add`}>
        {label}
      </Button>
    </div>
  );
}

/**
 * The MCI tab. Every number comes from `deriveMci` (the log is the source of
 * truth). After stand down it stays, read-only, so the record can be reviewed.
 */
export default function MciTab({ event, actions }: Props) {
  const { t } = useDispatchTerms();
  const mci = event.mci;
  const derived = useMemo(() => deriveMci(event), [event]);
  const [moveZoneId, setMoveZoneId] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  if (!mci) return null;
  const readOnly = !mci.active;
  const moveZone = derived.zones.find((z) => z.zone.id === moveZoneId) ?? null;

  const handleTag = (zoneId: string, color: MciColor, delta: number) => {
    const zone = derived.zones.find((z) => z.zone.id === zoneId);
    // Adding to a cleared zone asks first, then reopens it.
    if (delta > 0 && zone?.cleared && !window.confirm(`${zone.zone.name} is marked clear. Add patients and reopen it?`)) return;
    void actions.tag(zoneId, color, delta);
  };
  const handleSetTagged = (zoneId: string, color: MciColor, total: number) => {
    const zone = derived.zones.find((z) => z.zone.id === zoneId);
    if (zone?.cleared && total > zone.tagged[color] && !window.confirm(`${zone.zone.name} is marked clear. Add patients and reopen it?`)) return;
    void actions.setTagged(zoneId, color, total);
  };
  const handleStandDown = () => {
    if (!window.confirm('Stand down the MCI? Teams in Triage, Treatment or Unavailable return to Available. The counts are kept.')) return;
    void actions.standDown();
  };
  const handleMove = async (zoneId: string, areaId: string, counts: MciCounts) => {
    await actions.move(zoneId, areaId, counts);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto" data-testid="mci-tab">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <MciTotalsStrip mci={mci} totals={derived.totals} />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="bordered" radius="lg" onPress={() => setShowLog((v) => !v)} aria-expanded={showLog} data-testid="mci-log-toggle">
            Log
          </Button>
          {!readOnly && (
            <Button size="sm" radius="lg" className="bg-status-red text-surface-light" onPress={handleStandDown} data-testid="mci-stand-down">
              {t('Stand down')}
            </Button>
          )}
        </div>
      </div>

      {readOnly && (
        <p className="rounded-md border border-surface-liner px-3 py-1.5 text-sm text-surface-faint" data-testid="mci-stood-down">
          This MCI has stood down. The record below is read-only.
        </p>
      )}

      {showLog && <MciLogDrawer mci={mci} readOnly={readOnly} onUndo={(id) => void actions.undo(id)} />}

      <section className="flex flex-col gap-2" aria-label={t('Zones')}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-surface-light">{t('Zones')}</h2>
          {!readOnly && <AddByName label={t('Add zone')} testId="mci-add-zone" onAdd={actions.addZone} />}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-3">
          {derived.zones.map((stats) => (
            <MciZoneCard
              key={stats.zone.id}
              stats={stats}
              teams={mciUnitsAt(event, { kind: 'zone', id: stats.zone.id })}
              readOnly={readOnly}
              onTag={handleTag}
              onSetTagged={handleSetTagged}
              onMove={setMoveZoneId}
              onClear={(id) => void actions.clearZone(id)}
              onReopen={(id) => void actions.reopenZone(id)}
            />
          ))}
          {derived.zones.length === 0 && <p className="text-sm italic text-surface-faint">No zones yet. Add one by name.</p>}
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-label={t('Treatment locations')}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-surface-light">{t('Treatment locations')}</h2>
          {!readOnly && <AddByName label={t('Add treatment area')} testId="mci-add-area" onAdd={actions.addArea} />}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-3">
          {derived.areas.map((stats) => (
            <MciTreatmentCard key={stats.area.id} stats={stats} teams={mciUnitsAt(event, { kind: 'area', id: stats.area.id })} />
          ))}
          {derived.areas.length === 0 && <p className="text-sm italic text-surface-faint">No treatment locations yet. Add one by name.</p>}
        </div>
      </section>

      <MciMoveModal zone={readOnly ? null : moveZone} areas={derived.areas} onClose={() => setMoveZoneId(null)} onMove={handleMove} />
    </div>
  );
}
