'use client';

import React, { useMemo, useState } from 'react';
import type { MciState } from '@/app/types';
import { deriveMci, mciPatientLabel, type MciPatient } from '@/lib/mci';
import { MCI_PILL_STYLES } from '@/components/dispatch/mci/mciparts';
import { BottomSheet, ColorTag, ErrorBanner, PRIMARY_BUTTON, ROLE_LABEL, SECONDARY_BUTTON, useRoleActions } from './roleparts';

/**
 * The Transport role view (#144): patients waiting to leave across every
 * treatment zone, by transport priority, and recording each transport
 * (ambulance number and destination). Logged under the login's unit.
 */

const SEVERITY = { red: 0, yellow: 1, green: 2, black: 3 } as const;

export default function TransportView({ mci }: { mci: MciState }) {
  const actions = useRoleActions();
  const derived = useMemo(() => deriveMci({ mci, calls: [], clinics: [] }), [mci]);
  const [tab, setTab] = useState<'waiting' | 'left'>('waiting');
  const [picked, setPicked] = useState<MciPatient | null>(null);
  const [unit, setUnit] = useState('');
  const [destination, setDestination] = useState('');
  const areaName = (id: string) => derived.areas.find((a) => a.area.id === id)?.name ?? 'treatment';
  const waiting = useMemo(
    () =>
      derived.patients
        .filter((p) => p.transportedAt === undefined)
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || SEVERITY[a.color] - SEVERITY[b.color] || a.arrivedAt - b.arrivedAt),
    [derived],
  );
  const left = useMemo(() => derived.patients.filter((p) => p.transportedAt !== undefined).sort((a, b) => b.transportedAt! - a.transportedAt!), [derived]);
  const destinations = useMemo(() => [...new Set(left.map((p) => p.destination).filter(Boolean) as string[])].slice(0, 4), [left]);

  const record = async () => {
    if (!picked) return;
    if (await actions.send({ type: 'transport', patientId: picked.id, unit, destination })) setPicked(null);
  };

  return (
    <>
      <ErrorBanner error={actions.error} onClose={actions.clearError} />
      <div className="flex border-b border-surface-liner" role="tablist">
        {(['waiting', 'left'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`h-12 flex-1 border-b-[3px] text-lg font-bold ${tab === t ? 'border-accent bg-surface-deep' : 'border-transparent'}`}>
            {t === 'waiting' ? `Waiting (${waiting.length})` : `Left (${left.length})`}
          </button>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-24 pt-3">
        {tab === 'waiting' &&
          (waiting.length ? (
            waiting.map((p, i) => (
              <div key={p.id} className="flex min-h-[4.25rem] items-stretch border border-surface-liner bg-surface-deep" data-testid="role-transport-row">
                <span className={`flex w-16 flex-col items-center justify-center ${MCI_PILL_STYLES[p.color].pill}`}>
                  <span className="font-mono text-xl font-bold">#{i + 1}</span>
                </span>
                <span className="flex flex-1 flex-col justify-center gap-0.5 px-3 py-2">
                  <span className="text-lg font-bold">{mciPatientLabel(p.details) || 'No details yet'}</span>
                  <span className="text-sm text-surface-faint">At {areaName(p.areaId)}</span>
                </span>
                <button
                  type="button"
                  className="w-24 bg-accent text-base font-bold text-surface-deepest"
                  onClick={() => {
                    setPicked(p);
                    setUnit('');
                    setDestination(destinations[0] ?? '');
                  }}
                  data-testid="role-transport-pick"
                >
                  Transport
                </button>
              </div>
            ))
          ) : (
            <p className="m-0 text-base text-surface-faint">No one is waiting for transport.</p>
          ))}
        {tab === 'left' &&
          left.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border border-surface-liner bg-surface-deep px-3 py-2.5">
              <ColorTag color={p.color} />
              <span className="flex flex-1 flex-col">
                <span className="text-base font-bold">{mciPatientLabel(p.details) || 'No details'}</span>
                <span className="text-sm text-surface-faint">
                  {p.unit || 'No unit'}
                  {p.destination ? ` to ${p.destination}` : ''}
                </span>
              </span>
              <span className="font-mono text-sm text-surface-faint">{new Date(p.transportedAt!).toTimeString().slice(0, 5)}</span>
            </div>
          ))}
      </div>
      {picked && (
        <BottomSheet title="Record transport" onClose={() => setPicked(null)} testId="role-transport-sheet">
          <ErrorBanner error={actions.error} onClose={actions.clearError} />
          <span className="flex items-center gap-2 text-base text-surface-faint">
            <ColorTag color={picked.color} />
            {mciPatientLabel(picked.details) || 'No details'} · at {areaName(picked.areaId)}
          </span>
          <label className={`${ROLE_LABEL} flex flex-col gap-1`}>
            Ambulance number
            <input className="h-12 border border-surface-liner bg-surface-deepest px-3 font-mono text-xl normal-case tracking-normal text-surface-light" value={unit} placeholder="e.g. A14" onChange={(e) => setUnit(e.target.value)} data-testid="role-transport-unit" />
          </label>
          <label className={`${ROLE_LABEL} flex flex-col gap-1`}>
            Destination
            <input className="h-12 border border-surface-liner bg-surface-deepest px-3 text-lg normal-case tracking-normal text-surface-light" value={destination} placeholder="Hospital" onChange={(e) => setDestination(e.target.value)} />
          </label>
          {destinations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {destinations.map((d) => (
                <button key={d} type="button" className="h-10 border border-surface-liner bg-surface-deepest px-3 text-base" onClick={() => setDestination(d)}>
                  {d}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2.5">
            <button type="button" className={`${SECONDARY_BUTTON} flex-1`} onClick={() => setPicked(null)}>
              Cancel
            </button>
            <button type="button" className={`${PRIMARY_BUTTON} flex-[2]`} disabled={actions.busy} onClick={() => void record()} data-testid="role-transport-record">
              Record transport
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
