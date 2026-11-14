'use client';

import React, { useMemo, useState } from 'react';
import type { MciLogEntry, MciState } from '@/app/types';
import { currentLog, deriveMci, MCI_COLORS, mciPatientLabel } from '@/lib/mci';
import type { MciUnit } from '@/lib/mciDoc';
import { etaLabel, hospitalSentCounts, hospitalSentTotal, isOverdue } from '@/lib/mciLogistics';
import { MCI_PILL_STYLES } from '@/components/dispatch/mci/mciparts';
import { describeMciEntry } from '@/components/dispatch/mci/mcilogdrawer';
import { ColorTag, ROLE_LABEL } from './roleparts';

/**
 * The Incident Command role view (#144): read-only. On a phone, Overview /
 * Units / Log tabs; on a desktop, one screen with patients by color and stage,
 * zones and treatment zones with who is in each, transports, incoming staff
 * and an activity log filterable by unit with a checkbox dropdown.
 */

const PANEL = 'flex min-h-0 flex-col border border-surface-liner bg-surface-deep';
const PANEL_HEAD = 'flex items-center justify-between border-b border-surface-liner px-3.5 py-2.5';
const who = (e: MciLogEntry) => e.byUnit ?? 'Dispatch';

export default function CommandView({ mci, units }: { mci: MciState; units: MciUnit[] }) {
  const derived = useMemo(() => deriveMci({ mci, calls: [], clinics: [] }), [mci]);
  const [tab, setTab] = useState<'overview' | 'units' | 'log'>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const current = useMemo(() => currentLog(mci), [mci]);
  const everyone = useMemo(() => [...new Set(current.map(who))].sort(), [current]);
  const [hidden, setHidden] = useState<string[]>([]);
  const log = useMemo(() => [...current].reverse().filter((e) => !hidden.includes(who(e))), [current, hidden]);
  const hospitalCounts = useMemo(() => hospitalSentCounts(mci), [mci]);
  const hospitals = mci.logistics?.hospitals ?? [];
  const unitsAt = (kind: 'zone' | 'area', id: string) => units.filter((u) => u.mciAssignment?.kind === kind && u.mciAssignment.id === id).map((u) => u.name);
  const t = derived.totals;
  const now = new Date();
  const incoming = (mci.logistics?.incoming ?? []).filter((x) => x.state === 'incoming' || x.state === 'reported');
  const transports = derived.patients.filter((p) => p.transportedAt !== undefined).sort((a, b) => b.transportedAt! - a.transportedAt!);
  const inTreatmentBy = (c: (typeof MCI_COLORS)[number]) => derived.areas.reduce((n, a) => n + a.inTreatment[c], 0);
  const inZonesBy = (c: (typeof MCI_COLORS)[number]) => derived.zones.reduce((n, z) => n + z.inZone[c], 0);
  const showing = hidden.length === 0 ? 'Everyone' : everyone.length - hidden.length === 0 ? 'No one' : `${everyone.length - hidden.length} of ${everyone.length}`;

  const totals = (
    <section className={PANEL}>
      <div className={PANEL_HEAD}>
        <span className="text-lg font-bold">Patients</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-surface-liner">
        {[
          ['Tagged', t.taggedTotal + t.arrivedTotal, ''],
          ['Still in zones', t.inZonesTotal, 'text-accent'],
          ['In treatment', t.inTreatmentTotal, ''],
          ['Left by ambulance', t.transportedTotal, 'text-status-green'],
        ].map(([label, n, cls]) => (
          <div key={label as string} className="flex flex-col bg-surface-deep px-3.5 py-2.5">
            <span className={ROLE_LABEL}>{label}</span>
            <span className={`font-mono text-3xl font-bold ${cls}`}>{n}</span>
          </div>
        ))}
      </div>
      <table className="w-full border-collapse text-base">
        <thead>
          <tr className="text-left">
            {['Color', 'Zones', 'Treatment', 'Left'].map((h) => (
              <th key={h} className={`${ROLE_LABEL} border-b border-surface-liner px-3 py-2`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MCI_COLORS.map((c) => (
            <tr key={c}>
              <td className="border-b border-surface-liner px-3 py-1.5">
                <ColorTag color={c} className="w-20" />
              </td>
              <td className="border-b border-surface-liner px-3 py-1.5 font-mono">{inZonesBy(c)}</td>
              <td className="border-b border-surface-liner px-3 py-1.5 font-mono">{inTreatmentBy(c)}</td>
              <td className="border-b border-surface-liner px-3 py-1.5 font-mono">{t.transported[c]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );

  const zones = (
    <section className={PANEL}>
      <div className={PANEL_HEAD}>
        <span className="text-lg font-bold">Zones</span>
      </div>
      <div className="grid gap-2.5 p-3 sm:grid-cols-2 xl:grid-cols-3">
        {derived.zones.map((z) => (
          <div key={z.zone.id} className={`flex flex-col gap-1.5 border p-2.5 ${z.cleared ? 'border-status-green' : 'border-surface-liner'}`}>
            <div className="flex justify-between">
              <span className="text-lg font-bold">{z.zone.name}</span>
              <span className={z.cleared ? 'text-status-green' : ''}>{z.cleared ? 'Clear' : `${z.inZoneTotal} in zone`}</span>
            </div>
            <div className="flex gap-1">
              {MCI_COLORS.map((c) => (
                <span key={c} className={`flex-1 py-0.5 text-center font-mono text-sm ${MCI_PILL_STYLES[c].pill}`}>
                  {z.inZone[c]}
                </span>
              ))}
            </div>
            <span className="text-sm text-surface-faint">{unitsAt('zone', z.zone.id).join(', ') || 'No one assigned'}</span>
          </div>
        ))}
      </div>
    </section>
  );

  const areas = (
    <section className={PANEL}>
      <div className={PANEL_HEAD}>
        <span className="text-lg font-bold">Treatment zones</span>
      </div>
      <div className="grid gap-2.5 p-3 sm:grid-cols-2 xl:grid-cols-3">
        {derived.areas.map((a) => (
          <div key={a.area.id} className="flex flex-col gap-1.5 border border-surface-liner p-2.5">
            <span className="flex items-center gap-2 text-lg font-bold">
              {a.area.color && <span className={`h-3 w-3 ${MCI_PILL_STYLES[a.area.color].pill}`} aria-hidden />}
              {a.name}
            </span>
            <span className="text-base">
              <span className="font-mono">{a.inTreatmentTotal}</span> patients · <span className="font-mono">{a.patients.filter((p) => p.rank !== undefined).length}</span> waiting
            </span>
            <span className="text-sm text-surface-faint">{unitsAt('area', a.area.id).join(', ') || 'No one assigned'}</span>
          </div>
        ))}
      </div>
    </section>
  );

  const transportsPanel = (
    <section className={PANEL}>
      <div className={PANEL_HEAD}>
        <span className="text-lg font-bold">Transports</span>
      </div>
      {transports.length === 0 && <p className="m-0 px-3.5 py-3 text-base text-surface-faint">None yet.</p>}
      {transports.map((p) => (
        <div key={p.id} className="flex items-center gap-3 border-b border-surface-liner px-3.5 py-2">
          <span className="w-12 font-mono text-sm text-surface-faint">{new Date(p.transportedAt!).toTimeString().slice(0, 5)}</span>
          <ColorTag color={p.color} />
          <span className="flex-1 text-base">{mciPatientLabel(p.details) || 'Patient'}</span>
          <span className="text-sm text-surface-faint">
            {p.unit || '–'}
            {p.destination ? ` to ${p.destination}` : ''}
          </span>
        </div>
      ))}
    </section>
  );

  const hospitalsPanel = hospitals.length > 0 && (
    <section className={PANEL} data-testid="role-command-hospitals">
      <div className={PANEL_HEAD}>
        <span className="text-lg font-bold">Hospitals</span>
      </div>
      {hospitals.map((h) => {
        const counted = hospitalCounts.get(h.id);
        const sent = hospitalSentTotal(h, counted);
        const full = h.capacity !== undefined && sent >= h.capacity;
        return (
          <div key={h.id} className="flex items-center justify-between gap-3 border-b border-surface-liner px-3.5 py-2">
            <span className="text-base font-bold">{h.name}</span>
            <span className="flex items-center gap-2 font-mono text-sm">
              {(['red', 'yellow', 'green'] as const).map((c) => (
                <span key={c} className="inline-flex items-center gap-1" aria-label={`${counted?.[c] ?? 0} ${c}`}>
                  <span className={`h-3 w-3 ${MCI_PILL_STYLES[c].pill}`} aria-hidden />
                  {counted?.[c] ?? 0}
                </span>
              ))}
              <span className={full ? 'font-bold text-status-red' : ''}>
                {sent}
                {h.capacity !== undefined ? `/${h.capacity}` : ''}
              </span>
            </span>
          </div>
        );
      })}
    </section>
  );

  const incomingPanel = (
    <section className={PANEL}>
      <div className={PANEL_HEAD}>
        <span className="text-lg font-bold">Incoming Staff</span>
      </div>
      {incoming.length === 0 && <p className="m-0 px-3.5 py-3 text-base text-surface-faint">None reported.</p>}
      {incoming.map((x) => {
        const late = x.state === 'incoming' && isOverdue(x.eta, now);
        return (
          <div key={x.id} className="flex justify-between border-b border-surface-liner px-3.5 py-2">
            <span className="text-base font-bold">{x.name}</span>
            <span className={x.state === 'reported' ? 'text-status-green' : late ? 'text-status-red' : ''}>{x.state === 'reported' ? 'Arrived, to confirm' : `${etaLabel(x.eta)}${late ? ' · overdue' : ''}`}</span>
          </div>
        );
      })}
    </section>
  );

  const activity = (
    <section className={`${PANEL} lg:h-full`}>
      <div className={`${PANEL_HEAD} relative`}>
        <span className="text-lg font-bold">Activity</span>
        <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-haspopup="true" className="flex h-10 min-w-48 items-center justify-between gap-2 border border-surface-liner bg-surface-deepest px-2.5 text-base font-semibold" data-testid="role-activity-filter">
          Showing: {showing} <span aria-hidden>▾</span>
        </button>
        {menuOpen && (
          <div className="absolute right-3.5 top-14 z-10 w-56 border border-surface-liner bg-surface-deep py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
            <label className="flex cursor-pointer items-center gap-2.5 border-b border-surface-liner px-3.5 py-2 text-base font-bold">
              <input type="checkbox" className="h-[18px] w-[18px] accent-accent" checked={hidden.length === 0} onChange={() => setHidden(hidden.length === 0 ? everyone : [])} />
              Everyone
            </label>
            {everyone.map((name) => (
              <label key={name} className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-base">
                <input type="checkbox" className="h-[18px] w-[18px] accent-accent" checked={!hidden.includes(name)} onChange={() => setHidden((h) => (h.includes(name) ? h.filter((n) => n !== name) : [...h, name]))} />
                {name}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {log.map((e) => (
          <div key={e.id} className="grid grid-cols-[3rem_6rem_minmax(0,1fr)] gap-2 border-b border-surface-liner px-3.5 py-2">
            <span className="font-mono text-sm text-surface-faint">{new Date(e.t).toTimeString().slice(0, 5)}</span>
            <span className="text-sm font-bold">{who(e)}</span>
            <span className="text-base">{describeMciEntry(mci, e)}</span>
          </div>
        ))}
      </div>
    </section>
  );

  const unitsPanel = (
    <div className="flex flex-col gap-3">
      {[
        ['Triage', units.filter((u) => u.mciAssignment?.kind === 'zone')],
        ['Treatment', units.filter((u) => u.mciAssignment?.kind === 'area')],
        ['Not assigned', units.filter((u) => !u.mciAssignment)],
      ].map(([title, list]) => (
        <div key={title as string} className="flex flex-col gap-1.5">
          <span className={ROLE_LABEL}>{title as string}</span>
          {(list as MciUnit[]).map((u) => {
            const place = u.mciAssignment ? (u.mciAssignment.kind === 'zone' ? mci.zones : mci.areas).find((x) => x.id === u.mciAssignment!.id)?.name : u.status;
            return (
              <div key={u.name} className="flex justify-between border border-surface-liner bg-surface-deep px-3 py-2.5">
                <span className="text-lg font-bold">{u.name}</span>
                <span className="text-sm text-surface-faint">
                  {place}
                  {u.equipment.length ? ` · ${u.equipment.join(', ')}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* Desktop: everything on one screen. */}
      <div className="hidden min-h-0 flex-1 gap-3 p-3 lg:grid lg:grid-cols-[22rem_minmax(0,1fr)_26rem]">
        <div className="flex min-h-0 flex-col gap-3">
          {totals}
          {hospitalsPanel}
          {incomingPanel}
        </div>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          {zones}
          {areas}
          {transportsPanel}
        </div>
        {activity}
      </div>
      {/* Phone: tabs. */}
      <div className="flex flex-1 flex-col lg:hidden">
        <div className="flex border-b border-surface-liner" role="tablist">
          {(['overview', 'units', 'log'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`h-12 flex-1 border-b-[3px] text-lg font-bold capitalize ${tab === k ? 'border-accent bg-surface-deep' : 'border-transparent'}`}>
              {k}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-24 pt-3">
          {tab === 'overview' && (
            <>
              {totals}
              {zones}
              {areas}
              {hospitalsPanel}
              {incomingPanel}
            </>
          )}
          {tab === 'units' && unitsPanel}
          {tab === 'log' && activity}
        </div>
      </div>
    </>
  );
}
