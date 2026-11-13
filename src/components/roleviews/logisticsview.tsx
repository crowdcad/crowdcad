'use client';

import React, { useMemo, useState } from 'react';
import type { IncomingEta, MciState } from '@/app/types';
import type { MciUnit } from '@/lib/mciDoc';
import { etaLabel, isOverdue, normalizeEtaTime, sortIncoming } from '@/lib/mciLogistics';
import Hospitals from '@/components/dispatch/mci/hospitals';
import { chipState, ErrorBanner, PRIMARY_BUTTON, ROLE_LABEL, SECONDARY_BUTTON, useRoleActions } from './roleparts';

/**
 * The Logistics role view (#144, option a): incoming staff (add, ETA, notes,
 * report arrival), hospitals (add, capacity, sent) and equipment requests. The dispatcher turns a reported
 * arrival into a team and fulfils requests, so this login never writes the
 * event itself.
 */

const ITEMS = ['Trauma bag', 'Wheelchair', 'Gurney', 'AED', 'Oxygen'];

function EtaPicker({ eta, onChange, testId }: { eta: IncomingEta; onChange: (eta: IncomingEta) => void; testId: string }) {
  const [time, setTime] = useState(eta.kind === 'time' ? eta.time : '');
  const commit = () => {
    const t = normalizeEtaTime(time);
    if (t) onChange({ kind: 'time', time: t });
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      <input
        aria-label="ETA time"
        className={`h-10 w-24 border px-2 font-mono text-base ${eta.kind === 'time' ? 'border-accent bg-accent/15' : 'border-surface-liner bg-surface-deepest'}`}
        placeholder="HH:MM"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        data-testid={`${testId}-eta-time`}
      />
      {(['en_route', 'pending', 'attempted'] as const).map((k) => (
        <button key={k} type="button" className={`h-10 border px-2.5 text-sm font-semibold ${chipState(eta.kind === k)}`} onClick={() => onChange({ kind: k })}>
          {etaLabel({ kind: k })}
        </button>
      ))}
    </div>
  );
}

export default function LogisticsView({ mci, units }: { mci: MciState; units: MciUnit[] }) {
  const actions = useRoleActions();
  const [tab, setTab] = useState<'staff' | 'hospitals' | 'equipment'>('staff');
  const [name, setName] = useState('');
  const [item, setItem] = useState(ITEMS[0]!);
  const [forUnit, setForUnit] = useState(units.find((u) => u.kind === 'team')?.name ?? '');
  const now = new Date();
  const incoming = mci.logistics?.incoming ?? [];
  const open = sortIncoming(incoming.filter((t) => t.state === 'incoming' || t.state === 'reported'), now);
  const requests = (mci.logistics?.requests ?? []).filter((r) => r.state === 'open');
  const held = useMemo(() => units.filter((u) => u.equipment.length), [units]);

  const add = async () => {
    if (!name.trim()) return;
    if (await actions.send({ type: 'incomingAdd', name })) setName('');
  };

  return (
    <>
      <ErrorBanner error={actions.error} onClose={actions.clearError} />
      <div className="flex border-b border-surface-liner" role="tablist">
        {(['staff', 'hospitals', 'equipment'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`h-12 flex-1 border-b-[3px] text-lg font-bold ${tab === t ? 'border-accent bg-surface-deep' : 'border-transparent'}`}>
            {t === 'staff' ? `Incoming Staff (${open.filter((x) => x.state === 'incoming').length})` : t === 'hospitals' ? 'Hospitals' : 'Equipment'}
          </button>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-24 pt-3">
        {tab === 'staff' && (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
            >
              <input aria-label="Incoming team name" className="h-12 flex-1 border border-surface-liner bg-surface-deepest px-3 text-lg" placeholder="Team name, e.g. Medic 12" value={name} onChange={(e) => setName(e.target.value)} data-testid="role-incoming-name" />
              <button type="submit" className="h-12 w-24 bg-accent text-lg font-bold text-surface-deepest disabled:opacity-50" disabled={!name.trim() || actions.busy} data-testid="role-incoming-add">
                Add
              </button>
            </form>
            {open.length === 0 && <p className="m-0 text-base text-surface-faint">No teams on their way.</p>}
            {open.map((t) => {
              const late = t.state === 'incoming' && isOverdue(t.eta, now);
              return (
                <div key={t.id} className={`flex flex-col gap-2 border bg-surface-deep p-3 ${late ? 'border-status-red/70' : 'border-surface-liner'}`} data-testid={`role-incoming-${t.name}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold">{t.name}</span>
                    <span className={`text-base font-bold ${t.state === 'reported' ? 'text-status-green' : late ? 'text-status-red' : ''}`}>
                      {t.state === 'reported' ? 'Arrived' : `${t.eta.kind === 'time' ? 'ETA ' : ''}${etaLabel(t.eta)}${late ? ' · overdue' : ''}`}
                    </span>
                  </div>
                  {t.state === 'reported' ? (
                    <span className="text-base text-surface-faint">Waiting for dispatch to add them to the board.</span>
                  ) : (
                    <>
                      <EtaPicker eta={t.eta} testId={`role-incoming-${t.name}`} onChange={(eta) => void actions.send({ type: 'incomingUpdate', id: t.id, eta })} />
                      <input
                        aria-label={`Notes for ${t.name}`}
                        className="h-11 border border-surface-liner bg-surface-deepest px-3 text-base"
                        placeholder="Notes"
                        defaultValue={t.notes}
                        onBlur={(e) => e.target.value !== t.notes && void actions.send({ type: 'incomingUpdate', id: t.id, notes: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <button type="button" className="h-12 flex-[2] border border-status-green bg-status-green/20 text-lg font-bold text-status-green" onClick={() => void actions.send({ type: 'incomingArrived', id: t.id })} data-testid={`role-incoming-${t.name}-arrived`}>
                          Arrived
                        </button>
                        <button type="button" className={`${SECONDARY_BUTTON} h-12 flex-1`} onClick={() => void actions.send({ type: 'incomingCancel', id: t.id })}>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </>
        )}
        {tab === 'hospitals' && (
          <Hospitals
            mci={mci}
            readOnly={false}
            handlers={{
              onAdd: (hospital) => void actions.send({ type: 'hospitalAdd', name: hospital }),
              onUpdate: (id, changes) => void actions.send({ type: 'hospitalUpdate', id, ...changes }),
            }}
          />
        )}
        {tab === 'equipment' && (
          <>
            <div className="flex flex-col gap-2 border border-surface-liner bg-surface-deep p-3">
              <span className="text-lg font-bold">Request equipment for a team</span>
              <div className="flex flex-wrap gap-1.5">
                {ITEMS.map((i) => (
                  <button key={i} type="button" className={`h-10 border px-3 text-base font-semibold ${chipState(item === i)}`} onClick={() => setItem(i)}>
                    {i}
                  </button>
                ))}
              </div>
              <span className={ROLE_LABEL}>For</span>
              <div className="flex flex-wrap gap-1.5">
                {units.map((u) => (
                  <button key={u.name} type="button" className={`h-10 border px-3 text-base font-semibold ${chipState(forUnit === u.name)}`} onClick={() => setForUnit(u.name)}>
                    {u.name}
                  </button>
                ))}
              </div>
              <button type="button" className={PRIMARY_BUTTON} disabled={!forUnit || actions.busy} onClick={() => void actions.send({ type: 'equipmentRequest', item, unit: forUnit })} data-testid="role-equipment-request">
                Request {item} for {forUnit || '…'}
              </button>
            </div>
            {requests.length > 0 && (
              <>
                <span className={ROLE_LABEL}>Requests waiting for dispatch</span>
                {requests.map((r) => (
                  <div key={r.id} className="flex items-center justify-between border border-dashed border-surface-liner px-3 py-2.5">
                    <span className="text-base font-semibold">
                      {r.item} → {r.unit}
                    </span>
                    <span className="font-mono text-sm text-surface-faint">{new Date(r.t).toTimeString().slice(0, 5)}</span>
                  </div>
                ))}
              </>
            )}
            <span className={ROLE_LABEL}>Who has what</span>
            {held.length === 0 && <p className="m-0 text-base text-surface-faint">No equipment issued to a team.</p>}
            {held.map((u) => (
              <div key={u.name} className="flex items-center justify-between border border-surface-liner bg-surface-deep px-3 py-2.5">
                <span className="text-lg font-bold">{u.name}</span>
                <span className="text-base text-surface-faint">{u.equipment.join(', ')}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
