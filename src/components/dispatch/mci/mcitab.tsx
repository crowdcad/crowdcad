'use client';

import React, { useMemo, useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { Button, Input } from '@heroui/react';
import type { Event, MciColor } from '@/app/types';
import { deriveMci, mciMapLayers, mciShapeOf, mciTransportTrips, mciTransportUnits, mciUnitsAt, type MciCounts } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import type { MciActions } from './usemciactions';
import MciTotalsStrip from './mcitotalsstrip';
import MciZoneCard from './mcizonecard';
import MciTreatmentCard from './mcitreatmentcard';
import MciMoveModal from './mcimovemodal';
import MciTransportModal from './mcitransportmodal';
import MciDrawZoneModal, { type MciDrawTarget } from './mcidrawzonemodal';
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
        endContent={<CornerDownLeft className={`h-4 w-4 shrink-0 ${name.trim() ? 'text-surface-light' : 'text-surface-faint'}`} aria-hidden />}
        data-testid={`${testId}-input`}
      />
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
  const [transportAreaId, setTransportAreaId] = useState<string | null>(null);
  // A shape the dispatcher chose to draw or edit; otherwise the first zone or area still without one is offered.
  const [drawChoice, setDrawChoice] = useState<{ kind: 'zone' | 'area'; id: string } | null>(null);
  const [, setSkippedTick] = useState(0);
  const [showLog, setShowLog] = useState(false);

  if (!mci) return null;
  const readOnly = !mci.active;
  const moveZone = derived.zones.find((z) => z.zone.id === moveZoneId) ?? null;
  const transportArea = derived.areas.find((a) => a.area.id === transportAreaId) ?? null;
  const transportUnits = mciTransportUnits(mci);

  // Drawing is offered only when the venue has a map.
  const mapLayers = mciMapLayers(event.venue);
  const mapEnabled = mapLayers.length > 0;
  const shapeOf = (item: { id: string; venueZoneId?: string }) => mciShapeOf(event.venue, item);
  const skipKey = (kind: string, id: string) => `ccad-mci-draw-skipped:${event.id}:${kind}:${id}`;
  const wasSkipped = (kind: string, id: string) => {
    try {
      return sessionStorage.getItem(skipKey(kind, id)) === '1';
    } catch {
      return false;
    }
  };
  const nextToDraw: MciDrawTarget | null = (() => {
    if (!mapEnabled || readOnly) return null;
    const zone = mci.zones.find((z) => !shapeOf(z) && !wasSkipped('zone', z.id));
    if (zone) return { kind: 'zone', id: zone.id, name: zone.name, venueZoneId: zone.venueZoneId };
    const area = mci.areas.find((a) => !a.clinicId && !shapeOf(a) && !wasSkipped('area', a.id));
    return area ? { kind: 'area', id: area.id, name: area.name, venueZoneId: area.venueZoneId } : null;
  })();
  const chosenItem = drawChoice ? (drawChoice.kind === 'zone' ? mci.zones : mci.areas).find((x) => x.id === drawChoice.id) : undefined;
  const drawTarget: MciDrawTarget | null =
    drawChoice && chosenItem ? { kind: drawChoice.kind, id: chosenItem.id, name: chosenItem.name, venueZoneId: chosenItem.venueZoneId } : nextToDraw;
  const closeDraw = () => {
    if (drawChoice) {
      setDrawChoice(null);
      return;
    }
    // A skipped prompt is not asked again this session; the card's map button still draws it.
    if (nextToDraw) {
      try {
        sessionStorage.setItem(skipKey(nextToDraw.kind, nextToDraw.id), '1');
      } catch {
        // storage unavailable: the prompt may return on reload
      }
      setSkippedTick((n) => n + 1);
    }
  };

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
    <div className="minimal-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto" data-testid="mci-tab">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <MciTotalsStrip mci={mci} totals={derived.totals} />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="flat" radius="lg" onPress={() => setShowLog((v) => !v)} aria-expanded={showLog} data-testid="mci-log-toggle">
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
        {/* Cards share the row and grow to fill it, at most 4 across; below 14rem each a new row starts. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(max(14rem,calc((100%-2.25rem)/4)),1fr))] gap-3">
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
              mapEnabled={mapEnabled && !readOnly}
              hasShape={!!shapeOf(stats.zone)}
              onDraw={(id) => setDrawChoice({ kind: 'zone', id })}
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
        <div className="dispatch-shell-list">
          {derived.areas.map((stats) => (
            <MciTreatmentCard
              key={stats.area.id}
              stats={stats}
              teams={mciUnitsAt(event, { kind: 'area', id: stats.area.id })}
              trips={mciTransportTrips(mci, stats.area.id)}
              readOnly={readOnly}
              onTransport={setTransportAreaId}
              mapEnabled={mapEnabled && !readOnly}
              hasShape={!!shapeOf(stats.area)}
              onDraw={(id) => setDrawChoice({ kind: 'area', id })}
            />
          ))}
          {derived.areas.length === 0 && <p className="text-sm italic text-surface-faint">No treatment locations yet. Add one by name.</p>}
        </div>
      </section>

      <MciMoveModal zone={readOnly ? null : moveZone} areas={derived.areas} onClose={() => setMoveZoneId(null)} onMove={handleMove} />
      <MciDrawZoneModal
        target={readOnly ? null : drawTarget}
        layers={mapLayers}
        existing={drawTarget && chosenItem ? shapeOf(chosenItem) : undefined}
        onSave={async (shape) => {
          if (drawTarget) await actions.saveShape(drawTarget.kind, drawTarget.id, shape);
        }}
        onClose={closeDraw}
      />
      <MciTransportModal
        area={readOnly ? null : transportArea}
        units={transportUnits}
        onClose={() => setTransportAreaId(null)}
        onTransport={(areaId, counts, trip) => actions.transport(areaId, counts, trip)}
      />
    </div>
  );
}
