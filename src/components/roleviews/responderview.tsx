'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { MciColor, MciState } from '@/app/types';
import { deriveMci, emptyCounts, MCI_COLORS, mciPatientLabel, type MciCounts, type MciPatient, type MciPatientField } from '@/lib/mci';
import type { MciUnit } from '@/lib/mciDoc';
import type { RoleAction } from '@/lib/mciRoleActions';
import { MCI_COLOR_STYLES, MCI_PILL_STYLES } from '@/components/dispatch/mci/mciparts';
import { describeMciEntry } from '@/components/dispatch/mci/mcilogdrawer';
import {
  BottomSheet,
  chipState,
  ColorStepper,
  ConfirmDialog,
  ErrorBanner,
  PRIMARY_BUTTON,
  ROLE_CHIP,
  ROLE_LABEL,
  SECONDARY_BUTTON,
  useRoleActions,
} from './roleparts';

/**
 * The Responder role view (#144): one role for triage and treatment, since
 * people move between them. Triage mode: pick your zone, count tags as a draft
 * and submit them (with an "Are you sure?"), submit moves to a treatment zone.
 * Treatment mode: pick your treatment zone (a tarp), add patients with their
 * details, record interventions and notes, set transport priority. Choosing a
 * zone moves the unit on the dispatch board; everything is logged under it.
 */

const INTERVENTIONS = ['Oxygen', 'IV access', 'Tourniquet', 'Splint', 'Medication', 'Airway'];

type Draft = MciCounts;

const describe = (o: Partial<MciCounts>, signed: boolean) =>
  MCI_COLORS.filter((c) => o[c])
    .map((c) => `${signed && (o[c] ?? 0) > 0 ? '+' : ''}${o[c]} ${MCI_COLOR_STYLES[c].label.toLowerCase()}`)
    .join(', ');

function TriageMode({ mci, unit, me }: { mci: MciState; unit: string; me: MciUnit | undefined }) {
  const actions = useRoleActions();
  const derived = useMemo(() => deriveMci({ mci, calls: [], clinics: [] }), [mci]);
  const assigned = me?.mciAssignment?.kind === 'zone' ? me.mciAssignment.id : undefined;
  const [zoneId, setZoneId] = useState<string | undefined>(assigned ?? mci.zones[0]?.id);
  useEffect(() => {
    if (assigned) setZoneId(assigned);
  }, [assigned]);
  const [draft, setDraft] = useState<Draft>(emptyCounts());
  const [moveOpen, setMoveOpen] = useState(false);
  const [move, setMove] = useState<Draft>(emptyCounts());
  const [dest, setDest] = useState<string | undefined>(mci.areas[0]?.id);
  const [confirm, setConfirm] = useState<'counts' | 'move' | null>(null);
  const stats = derived.zones.find((z) => z.zone.id === zoneId);
  const zoneName = stats?.zone.name ?? 'your zone';
  const destName = mci.areas.find((a) => a.id === dest)?.name ?? 'treatment';
  const dirty = MCI_COLORS.some((c) => draft[c] !== 0);
  const moveTotal = MCI_COLORS.reduce((n, c) => n + move[c], 0);
  const sent = useMemo(() => mci.log.filter((e) => e.byUnit === unit).slice(-6).reverse(), [mci.log, unit]);

  const pickZone = async (id: string) => {
    if (id === zoneId) return;
    if (dirty && !window.confirm('Your unsent counts are for the zone you are leaving. Drop them?')) return;
    setDraft(emptyCounts());
    setZoneId(id);
    await actions.send({ type: 'assign', assignment: { kind: 'zone', id } });
  };
  const submitCounts = async () => {
    if (!zoneId) return;
    if (await actions.send({ type: 'counts', zoneId, deltas: draft })) setDraft(emptyCounts());
    setConfirm(null);
  };
  const submitMove = async () => {
    if (!zoneId || !dest) return;
    if (await actions.send({ type: 'move', zoneId, areaId: dest, counts: move })) setMoveOpen(false);
    setConfirm(null);
  };

  return (
    <>
      <ErrorBanner error={actions.error} onClose={actions.clearError} />
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-28 pt-3">
        <div className="flex flex-col gap-1.5">
          <span className={ROLE_LABEL}>Working in</span>
          <div className="flex flex-wrap gap-2">
            {mci.zones.map((z) => (
              <button key={z.id} type="button" className={`${ROLE_CHIP} min-w-24 flex-1 ${chipState(z.id === zoneId)}`} onClick={() => void pickZone(z.id)} data-testid={`role-zone-${z.name}`}>
                {z.name}
              </button>
            ))}
          </div>
        </div>
        {stats && (
          <div className="grid grid-cols-[minmax(0,1fr)_4.25rem_4.25rem] items-center gap-x-2.5 gap-y-2">
            <span className={`${ROLE_LABEL} text-center`}>Tagged</span>
            <span className={`${ROLE_LABEL} text-center`}>Moved</span>
            <span className={`${ROLE_LABEL} text-center`}>In zone</span>
            {MCI_COLORS.map((c) => {
              const tagged = stats.tagged[c] + draft[c];
              const inZone = stats.inZone[c] + draft[c];
              return (
                <React.Fragment key={c}>
                  <ColorStepper
                    color={c}
                    label={`${MCI_COLOR_STYLES[c].label.toLowerCase()} in ${zoneName}`}
                    value={tagged}
                    caption={`${MCI_COLOR_STYLES[c].label}${draft[c] ? ` ${draft[c] > 0 ? '+' : ''}${draft[c]}` : ''}`}
                    minusDisabled={inZone <= 0}
                    onMinus={() => setDraft((d) => ({ ...d, [c]: d[c] - 1 }))}
                    onPlus={() => setDraft((d) => ({ ...d, [c]: d[c] + 1 }))}
                  />
                  <span className="text-center font-mono text-xl font-bold text-surface-faint">{stats.moved[c]}</span>
                  <span className="text-center font-mono text-xl font-bold">{inZone}</span>
                </React.Fragment>
              );
            })}
          </div>
        )}
        {dirty && (
          <p className="m-0 border border-dashed border-accent px-3 py-2 text-base text-surface-faint" data-testid="role-draft">
            Not sent yet: {describe(draft, true)}. The dispatch board updates when you submit.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <span className={ROLE_LABEL}>Sent by {unit}</span>
          {sent.length === 0 && <span className="text-base text-surface-faint">Nothing yet.</span>}
          {sent.map((e) => (
            <div key={e.id} className="flex gap-2.5 border-b border-surface-liner py-2 text-base">
              <span className="w-12 shrink-0 font-mono text-sm text-surface-faint">{new Date(e.t).toTimeString().slice(0, 5)}</span>
              <span>{describeMciEntry(mci, e)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-surface-liner bg-surface-deep px-4 pb-5 pt-3">
        <button type="button" className={`${PRIMARY_BUTTON} flex-[2]`} disabled={!dirty || actions.busy} onClick={() => setConfirm('counts')} data-testid="role-submit-counts">
          Submit counts
        </button>
        <button
          type="button"
          className={`${SECONDARY_BUTTON} flex-[2]`}
          disabled={!stats || !mci.areas.length}
          onClick={() => {
            setMove(emptyCounts());
            setMoveOpen(true);
          }}
          data-testid="role-move-open"
        >
          Move to treatment
        </button>
        <button type="button" className={`${SECONDARY_BUTTON} flex-1`} disabled={!dirty} onClick={() => setDraft(emptyCounts())} aria-label="Undo your unsent counts">
          Undo
        </button>
      </div>

      {moveOpen && stats && (
        <BottomSheet title={`Move from ${zoneName}`} onClose={() => setMoveOpen(false)} testId="role-move-sheet">
          <span className={ROLE_LABEL}>To</span>
          <div className="grid grid-cols-2 gap-2">
            {mci.areas.map((a) => (
              <button key={a.id} type="button" className={`${ROLE_CHIP} flex items-center gap-2 ${chipState(a.id === dest)}`} onClick={() => setDest(a.id)}>
                {a.color && <span className={`h-3.5 w-3.5 ${MCI_PILL_STYLES[a.color].pill}`} aria-hidden />}
                {a.name}
              </button>
            ))}
          </div>
          {MCI_COLORS.map((c) => (
            <div key={c} className="flex items-center gap-3">
              <span className="flex-1 text-base text-surface-faint">
                {stats.inZone[c]} {MCI_COLOR_STYLES[c].label.toLowerCase()} in zone
              </span>
              <div className="w-44">
                <ColorStepper
                  size="sm"
                  color={c}
                  label={`${MCI_COLOR_STYLES[c].label.toLowerCase()} to move`}
                  value={move[c]}
                  minusDisabled={move[c] <= 0}
                  plusDisabled={move[c] >= stats.inZone[c]}
                  onMinus={() => setMove((m) => ({ ...m, [c]: m[c] - 1 }))}
                  onPlus={() => setMove((m) => ({ ...m, [c]: m[c] + 1 }))}
                />
              </div>
            </div>
          ))}
          <div className="flex gap-2.5">
            <button type="button" className={`${SECONDARY_BUTTON} flex-1`} onClick={() => setMoveOpen(false)}>
              Cancel
            </button>
            <button type="button" className={`${PRIMARY_BUTTON} flex-[2]`} disabled={!moveTotal || !dest} onClick={() => setConfirm('move')} data-testid="role-move-submit">
              Submit move of {moveTotal}
            </button>
          </div>
        </BottomSheet>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm === 'move' ? `Move from ${zoneName} to ${destName}:` : `Submit counts for ${zoneName}:`}
          lines={MCI_COLORS.filter((c) => (confirm === 'move' ? move[c] : draft[c])).map((c) => ({
            color: c,
            text: confirm === 'move' ? String(move[c]) : `${draft[c] > 0 ? '+' : ''}${draft[c]}`,
          }))}
          note={`Check the zone and counts. This updates the dispatch board and is logged as ${unit}.`}
          busy={actions.busy}
          onNo={() => setConfirm(null)}
          onYes={() => void (confirm === 'move' ? submitMove() : submitCounts())}
        />
      )}
    </>
  );
}

interface PatientFormState {
  color: MciColor;
  team: string;
  age: string;
  sex: string;
  complaint: string;
  notes: string;
}

function PatientSheet({
  mci,
  unit,
  units,
  areaId,
  patient,
  onClose,
}: {
  mci: MciState;
  unit: string;
  units: MciUnit[];
  areaId: string;
  /** Editing this patient; a new one when unset. */
  patient?: MciPatient;
  onClose: () => void;
}) {
  const actions = useRoleActions();
  const area = mci.areas.find((a) => a.id === areaId);
  const d = patient?.details ?? {};
  const [form, setForm] = useState<PatientFormState>({
    color: patient?.color ?? area?.color ?? 'red',
    team: d.team ?? '',
    age: d.age ?? '',
    sex: d.sex ?? '',
    complaint: d.complaint ?? '',
    notes: d.notes ?? '',
  });
  const set = (patch: Partial<PatientFormState>) => setForm((f) => ({ ...f, ...patch }));
  const teamChoices = useMemo(() => [...new Set([unit, ...units.filter((u) => u.kind === 'team').map((u) => u.name), 'Walk-in'])], [unit, units]);
  const fields: Partial<Record<MciPatientField, string>> = { age: form.age, sex: form.sex, complaint: form.complaint, team: form.team };

  const save = async () => {
    if (!patient) {
      if (await actions.send({ type: 'addPatient', areaId, color: form.color, fields })) onClose();
      return;
    }
    const steps: RoleAction[] = [];
    if (['age', 'sex', 'complaint', 'team'].some((k) => (d[k as MciPatientField] ?? '') !== (fields[k as MciPatientField] ?? ''))) {
      steps.push({ type: 'patientDetails' as const, patientId: patient.id, fields });
    }
    if ((d.notes ?? '') !== form.notes) steps.push({ type: 'patientCare' as const, patientId: patient.id, notes: form.notes });
    if (form.color !== patient.color) steps.push({ type: 'reassign' as const, patientId: patient.id, color: form.color });
    if (!steps.length || (await actions.send(...steps))) onClose();
  };

  return (
    <BottomSheet title={patient ? `Patient${patient.rank ? ` #${patient.rank}` : ''}` : 'New patient'} onClose={onClose} testId="role-patient-sheet">
      <ErrorBanner error={actions.error} onClose={actions.clearError} />
      <span className={ROLE_LABEL}>Tag color</span>
      <div className="flex gap-1.5">
        {MCI_COLORS.map((c) => (
          <button key={c} type="button" aria-pressed={form.color === c} onClick={() => set({ color: c })} className={`h-11 flex-1 text-sm font-bold uppercase ${MCI_PILL_STYLES[c].pill} ${form.color === c ? 'ring-[3px] ring-inset ring-white' : ''}`}>
            {MCI_COLOR_STYLES[c].label}
          </button>
        ))}
      </div>
      <span className={ROLE_LABEL}>Brought in by</span>
      <div className="flex flex-wrap gap-1.5">
        {teamChoices.map((t) => (
          <button key={t} type="button" className={`h-10 border px-3 text-base font-semibold ${chipState(form.team === t)}`} onClick={() => set({ team: t })}>
            {t}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
        <label className={`${ROLE_LABEL} flex flex-col gap-1`}>
          Age
          <input className="h-12 border border-surface-liner bg-surface-deepest px-3 text-lg normal-case tracking-normal text-surface-light" inputMode="numeric" value={form.age} onChange={(e) => set({ age: e.target.value })} data-testid="role-patient-age" />
        </label>
        <div className="flex flex-col gap-1">
          <span className={ROLE_LABEL}>Sex</span>
          <div className="flex gap-1.5">
            {['M', 'F', 'X'].map((x) => (
              <button key={x} type="button" className={`h-12 flex-1 border text-base font-semibold ${chipState(form.sex === x)}`} onClick={() => set({ sex: form.sex === x ? '' : x })}>
                {x}
              </button>
            ))}
          </div>
        </div>
      </div>
      <label className={`${ROLE_LABEL} flex flex-col gap-1`}>
        Chief complaint
        <input className="h-12 border border-surface-liner bg-surface-deepest px-3 text-lg normal-case tracking-normal text-surface-light" value={form.complaint} placeholder="e.g. Chest pain" onChange={(e) => set({ complaint: e.target.value })} data-testid="role-patient-complaint" />
      </label>

      {patient && (
        <div className="flex flex-col gap-2 border-t border-surface-liner pt-2.5">
          <span className={ROLE_LABEL}>Interventions (tap to record, timed)</span>
          <div className="flex flex-wrap gap-1.5">
            {INTERVENTIONS.map((name) => (
              <button
                key={name}
                type="button"
                className="h-10 border border-surface-liner bg-surface-deepest px-3 text-base font-semibold"
                disabled={actions.busy}
                onClick={() => void actions.send({ type: 'patientCare', patientId: patient.id, intervention: name })}
                data-testid={`role-intervention-${name}`}
              >
                + {name}
              </button>
            ))}
          </div>
          {(d.interventions ?? []).map((r, i) => (
            <div key={i} className="flex gap-2.5 text-base">
              <span className="w-12 font-mono text-sm text-surface-faint">{new Date(r.t).toTimeString().slice(0, 5)}</span>
              <span className="flex-1">{r.name}</span>
              <span className="text-surface-faint">{r.byUnit ?? 'Dispatch'}</span>
            </div>
          ))}
          <label className={`${ROLE_LABEL} flex flex-col gap-1`}>
            Treatment notes
            <textarea className="min-h-24 resize-none border border-surface-liner bg-surface-deepest px-3 py-2 text-base normal-case tracking-normal text-surface-light" value={form.notes} placeholder="Vitals, response to treatment, anything to hand over" onChange={(e) => set({ notes: e.target.value })} data-testid="role-patient-notes" />
          </label>
          <span className={ROLE_LABEL}>Transport priority</span>
          <div className="flex gap-2">
            <button type="button" className={`${SECONDARY_BUTTON} h-12 flex-1`} disabled={actions.busy} onClick={() => void actions.send({ type: 'priority', patientId: patient.id, direction: 'sooner' })}>
              Sooner
            </button>
            <button type="button" className={`${SECONDARY_BUTTON} h-12 flex-1`} disabled={actions.busy} onClick={() => void actions.send({ type: 'priority', patientId: patient.id, direction: 'later' })}>
              Later
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2.5 pt-1">
        <button type="button" className={`${SECONDARY_BUTTON} flex-1`} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={`${PRIMARY_BUTTON} flex-[2]`} disabled={actions.busy} onClick={() => void save()} data-testid="role-patient-save">
          {patient ? 'Save' : 'Add patient'}
        </button>
      </div>
      <span className="text-sm text-surface-faint">Saved changes are logged as {unit}, with the time.</span>
    </BottomSheet>
  );
}

function TreatmentMode({ mci, unit, me, units }: { mci: MciState; unit: string; me: MciUnit | undefined; units: MciUnit[] }) {
  const actions = useRoleActions();
  const derived = useMemo(() => deriveMci({ mci, calls: [], clinics: [] }), [mci]);
  const assigned = me?.mciAssignment?.kind === 'area' ? me.mciAssignment.id : undefined;
  const [areaId, setAreaId] = useState<string | undefined>(assigned);
  const [choosing, setChoosing] = useState(!assigned);
  const [editing, setEditing] = useState<MciPatient | 'new' | null>(null);
  useEffect(() => {
    if (assigned) setAreaId(assigned);
  }, [assigned]);
  const stats = derived.areas.find((a) => a.area.id === areaId);
  // Keep an open patient current as other phones change it.
  const editingPatient = editing && editing !== 'new' ? stats?.patients.find((p) => p.id === editing.id) ?? editing : undefined;

  const pick = async (id: string) => {
    setAreaId(id);
    setChoosing(false);
    await actions.send({ type: 'assign', assignment: { kind: 'area', id } });
  };

  if (choosing || !stats) {
    return (
      <div className="flex flex-col gap-3 px-4 py-5">
        <ErrorBanner error={actions.error} onClose={actions.clearError} />
        <span className="text-2xl font-bold">Which treatment zone are you working in?</span>
        <span className="text-base text-surface-faint">The dispatch board shows {unit} there. You can switch at any time.</span>
        {derived.areas.map((a) => (
          <button
            key={a.area.id}
            type="button"
            onClick={() => void pick(a.area.id)}
            className={`flex h-[4.5rem] items-center justify-between px-4 text-xl font-bold ${a.area.color ? MCI_PILL_STYLES[a.area.color].pill : 'border border-surface-liner bg-surface-deep'}`}
            data-testid={`role-area-${a.name}`}
          >
            {a.name}
            <span className="font-mono text-lg">{a.inTreatmentTotal} patients</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <ErrorBanner error={actions.error} onClose={actions.clearError} />
      <div className="flex items-center justify-between border-b border-surface-liner px-4 py-2.5">
        <span className="flex items-center gap-2 text-xl font-bold">
          {stats.area.color && <span className={`h-3.5 w-3.5 ${MCI_PILL_STYLES[stats.area.color].pill}`} aria-hidden />}
          {stats.name}
        </span>
        <button type="button" className="min-h-11 text-base font-semibold text-accent" onClick={() => setChoosing(true)}>
          Change zone
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-28 pt-3">
        <span className={ROLE_LABEL}>Patients here, by transport priority</span>
        {stats.patients.length === 0 && <p className="m-0 text-base text-surface-faint">No patients in {stats.name} yet.</p>}
        {stats.patients.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setEditing(p)} className="flex min-h-[4.25rem] items-stretch border border-surface-liner bg-surface-deep text-left" data-testid="role-patient">
            <span className={`flex w-14 items-center justify-center font-mono text-xl font-bold ${MCI_PILL_STYLES[p.color].pill}`}>#{p.rank ?? i + 1}</span>
            <span className="flex flex-1 flex-col justify-center gap-0.5 px-3 py-2">
              <span className="text-lg font-bold">{mciPatientLabel(p.details) || 'Tap to add details'}</span>
              <span className="text-sm text-surface-faint">
                {p.details.team ? `Brought in by ${p.details.team}` : 'Team not recorded'}
                {(p.details.interventions ?? []).length ? ` · ${p.details.interventions!.map((r) => r.name).join(', ')}` : ''}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 flex border-t border-surface-liner bg-surface-deep px-4 pb-5 pt-3">
        <button type="button" className={`${PRIMARY_BUTTON} flex-1`} onClick={() => setEditing('new')} data-testid="role-add-patient">
          + Add patient
        </button>
      </div>
      {editing && <PatientSheet mci={mci} unit={unit} units={units} areaId={stats.area.id} patient={editingPatient} onClose={() => setEditing(null)} />}
    </>
  );
}

export default function ResponderView({ mci, unit, units }: { mci: MciState; unit: string; units: MciUnit[] }) {
  const me = units.find((u) => u.name === unit);
  const [mode, setMode] = useState<'triage' | 'treatment'>(me?.mciAssignment?.kind === 'area' ? 'treatment' : 'triage');
  return (
    <>
      <nav className="flex border-b border-surface-liner" aria-label="Mode">
        {(['triage', 'treatment'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-current={mode === m ? 'page' : undefined}
            onClick={() => setMode(m)}
            className={`h-12 flex-1 border-b-[3px] text-lg font-bold capitalize ${mode === m ? 'border-accent bg-surface-deep' : 'border-transparent'}`}
            data-testid={`role-mode-${m}`}
          >
            {m}
          </button>
        ))}
      </nav>
      {mode === 'triage' ? <TriageMode mci={mci} unit={unit} me={me} /> : <TreatmentMode mci={mci} unit={unit} me={me} units={units} />}
    </>
  );
}

