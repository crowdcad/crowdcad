'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Undo2 } from 'lucide-react';
import type { IncomingEta, IncomingTeam, MciState } from '@/app/types';
import type { MciEquipmentItem } from '@/lib/mciDoc';
import { getEquipmentIconType } from '@/lib/equipmentIcon';
import { ETA_STATUS_LABELS, etaLabel, isOpenIncoming, isOverdue, LOGISTICS_ITEMS, normalizeEtaTime, sortIncoming } from '@/lib/mciLogistics';
import HelpTip from '@/components/ui/helptip';
import EquipmentTypeIcon from '../equipmenttypeicon';
import Hospitals, { type HospitalHandlers } from './hospitals';
import { LOGI } from './logisticsstyles';

/**
 * The Logistics board (#139, D27): Equipment, Hospitals and Incoming Staff, side by side. The dispatcher's
 * Logistics tab and the Logistics role login show this same board with the same abilities; only how a
 * change is saved differs (the tab writes the event, the role login posts to /api/mci-role). With `tabs`,
 * a screen narrower than a laptop shows one section at a time under a tab bar (the role login on a phone).
 */

export interface LogisticsHandlers {
  incomingAdd: (name: string) => void;
  incomingUpdate: (id: string, changes: { eta?: IncomingEta; notes?: string; members?: string[] }) => void;
  incomingArrived: (id: string) => void;
  incomingCancel: (id: string) => void;
  incomingUndo: (id: string) => void;
  /** `exact`: hand over that very item (a transfer), rather than a free one of that kind. */
  equipmentGive: (item: string, unit: string, exact?: boolean) => void;
  equipmentReturn: (name: string) => void;
  hospitals: HospitalHandlers;
}

const OTHER = '__other__';
type Section = 'equipment' | 'hospitals' | 'staff';

function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** A section heading with its help tip, the same in all three columns. */
export function LogisticsHeading({ title, help, label, count }: { title: string; help: string; label: string; count?: number }) {
  return (
    <div className="flex min-h-8 items-center gap-1">
      <h2 className={LOGI.heading}>
        {title}
        {count !== undefined && count > 0 && <span className="ml-1.5 font-normal text-surface-faint">({count})</span>}
      </h2>
      <HelpTip text={help} label={label} />
    </div>
  );
}

/** A text field that saves when it loses focus or on Enter. */
function SavedField({ value, onSave, label, placeholder, disabled, className = '', testId }: { value: string; onSave: (v: string) => void; label: string; placeholder?: string; disabled?: boolean; className?: string; testId?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onSave(draft);
  return (
    <input
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      disabled={disabled}
      className={`${LOGI.input} ${className}`}
      data-testid={testId}
    />
  );
}

/** ETA: a status, or a typed time. A time is saved once it reads as one. */
function EtaEditor({ eta, onChange, disabled, testId }: { eta: IncomingEta; onChange: (eta: IncomingEta) => void; disabled?: boolean; testId: string }) {
  const [kind, setKind] = useState<IncomingEta['kind']>(eta.kind);
  const [time, setTime] = useState(eta.kind === 'time' ? eta.time : '');
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setKind(eta.kind);
    if (eta.kind === 'time') setTime(eta.time);
  }, [eta]);
  const commitTime = () => {
    const t = normalizeEtaTime(time);
    setBad(!t && !!time.trim());
    if (t && !(eta.kind === 'time' && eta.time === t)) onChange({ kind: 'time', time: t });
  };
  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label="ETA"
        value={kind}
        disabled={disabled}
        onChange={(e) => {
          const k = e.target.value as IncomingEta['kind'];
          setKind(k);
          if (k !== 'time') onChange({ kind: k } as IncomingEta);
        }}
        className={`${LOGI.select} w-36`}
        data-testid={`${testId}-eta`}
      >
        <option value="time">Time</option>
        {(['en_route', 'pending', 'attempted'] as const).map((k) => (
          <option key={k} value={k}>
            {ETA_STATUS_LABELS[k]}
          </option>
        ))}
      </select>
      {kind === 'time' && (
        <input
          aria-label="ETA time"
          placeholder="HH:MM"
          inputMode="numeric"
          value={time}
          disabled={disabled}
          onChange={(e) => setTime(e.target.value)}
          onBlur={commitTime}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          title={bad ? 'Type the ETA as a time, e.g. 0930 or 9:30.' : undefined}
          className={`${LOGI.input} w-20 font-mono tabular-nums ${bad ? '!border-status-red' : ''}`}
          data-testid={`${testId}-eta-time`}
        />
      )}
    </div>
  );
}

function IncomingRow({ team, now, readOnly, handlers }: { team: IncomingTeam; now: Date; readOnly: boolean; handlers: LogisticsHandlers }) {
  const reported = team.state === 'reported';
  const overdue = !reported && isOverdue(team.eta, now);
  const testId = `incoming-${team.name}`;
  return (
    <div className={`${LOGI.card} ${reported ? '!border-status-green/70' : overdue ? '!border-status-red/60' : ''}`} data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${LOGI.title} min-w-[5rem] flex-1`}>{team.name}</span>
        {overdue && <span className={`${LOGI.badge} text-status-red`}>Overdue</span>}
        {reported && (
          <span className={`${LOGI.badge} text-status-green`} data-testid={`${testId}-reported`}>
            Arrived, to confirm
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <EtaEditor eta={team.eta} disabled={readOnly} testId={testId} onChange={(eta) => handlers.incomingUpdate(team.id, { eta })} />
        {!readOnly && (
          <div className="ml-auto flex gap-1.5">
            <button type="button" className={LOGI.goodButton} onClick={() => handlers.incomingArrived(team.id)} data-testid={`${testId}-arrived`}>
              {reported ? 'Confirm arrival' : 'Arrived'}
            </button>
            <button type="button" className={LOGI.button} onClick={() => handlers.incomingCancel(team.id)} data-testid={`${testId}-cancel`}>
              Cancel
            </button>
          </div>
        )}
      </div>
      <SavedField
        label={`Members of ${team.name}`}
        placeholder="Members, separated by commas"
        value={team.members.join(', ')}
        disabled={readOnly}
        onSave={(v) => handlers.incomingUpdate(team.id, { members: v.split(',').map((m) => m.trim()).filter(Boolean) })}
        testId={`${testId}-members`}
      />
      <SavedField label={`Notes for ${team.name}`} placeholder="Notes" value={team.notes} disabled={readOnly} onSave={(notes) => handlers.incomingUpdate(team.id, { notes })} testId={`${testId}-notes`} />
    </div>
  );
}

function IncomingSection({ mci, readOnly, handlers }: { mci: MciState; readOnly: boolean; handlers: LogisticsHandlers }) {
  const now = useNow();
  const [name, setName] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const incoming = mci.logistics?.incoming ?? [];
  const open = sortIncoming(incoming.filter(isOpenIncoming), now);
  const closed = incoming.filter((x) => !isOpenIncoming(x)).sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
  const add = () => {
    if (!name.trim()) return;
    handlers.incomingAdd(name);
    setName('');
  };
  return (
    <>
      <LogisticsHeading
        title="Incoming Staff"
        count={open.length}
        label="About incoming staff"
        help="Teams reported on their way to help. Keep each one's ETA and notes here; Arrived puts the team on the board as Available. Undo, under Arrived and cancelled, brings back a team pressed by mistake."
      />
      {!readOnly && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input aria-label="Incoming team name" placeholder="Team name, e.g. Medic 12" value={name} onChange={(e) => setName(e.target.value)} className={`${LOGI.input} min-w-0 flex-1`} data-testid="incoming-name" />
          <button type="submit" disabled={!name.trim()} className={LOGI.primaryButton} data-testid="incoming-add">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add team
          </button>
        </form>
      )}
      {open.length === 0 && <p className={LOGI.empty}>No teams on their way.</p>}
      {open.map((team) => (
        <IncomingRow key={team.id} team={team} now={now} readOnly={readOnly} handlers={handlers} />
      ))}
      {closed.length > 0 && (
        <div className="flex flex-col gap-1">
          <button type="button" className={`${LOGI.link} self-start`} onClick={() => setShowClosed((v) => !v)} aria-expanded={showClosed} data-testid="incoming-closed-toggle">
            {showClosed ? 'Hide' : 'Show'} arrived and cancelled ({closed.length})
          </button>
          {showClosed &&
            closed.map((x) => (
              <div key={x.id} className="flex items-center gap-2 py-0.5" data-testid={`incoming-closed-${x.name}`}>
                <span className={`${LOGI.meta} flex-1`}>
                  <span className="font-semibold text-surface-light">{x.name}</span> {x.state === 'arrived' ? 'arrived' : 'cancelled'}
                  {x.closedAt ? ` at ${new Date(x.closedAt).toTimeString().slice(0, 5)}` : ''} (ETA was {etaLabel(x.eta)})
                </span>
                {!readOnly && (
                  <button type="button" className={LOGI.smallButton} onClick={() => handlers.incomingUndo(x.id)} data-testid={`incoming-undo-${x.name}`}>
                    <Undo2 className="h-3 w-3" aria-hidden />
                    Undo
                  </button>
                )}
              </div>
            ))}
        </div>
      )}
    </>
  );
}

const PHASE_NOTE: Partial<Record<MciEquipmentItem['phase'], string>> = {
  retrieving: 'being fetched',
  with_care_team: 'with care team',
  returning: 'on its way back',
};

/** One item: icon, name, and (unless read-only) who to give it to next and, when a team has it, Return. */
function EquipmentLine({ item, units, readOnly, handlers }: { item: MciEquipmentItem; units: string[]; readOnly: boolean; handlers: LogisticsHandlers }) {
  const heldBy = item.holderKind === 'team' ? item.holder : null;
  const note = PHASE_NOTE[item.phase] ?? (item.holderKind === 'team' ? '' : `at ${item.holder}`);
  return (
    <div className="flex flex-wrap items-center gap-2 py-1" data-testid={`logistics-equipment-${item.name}`}>
      <EquipmentTypeIcon type={getEquipmentIconType(item.name)} />
      <span className="text-sm font-medium text-surface-light">{item.name}</span>
      {note && <span className={LOGI.meta}>{note}</span>}
      {!readOnly && (
        <div className="ml-auto flex items-center gap-1.5">
          <select
            aria-label={`Give ${item.name} to a team`}
            value=""
            onChange={(e) => e.target.value && handlers.equipmentGive(item.name, e.target.value, true)}
            className={`${LOGI.select} w-32`}
            data-testid={`logistics-issue-${item.name}`}
          >
            <option value="">{heldBy ? 'Give to…' : 'Issue to…'}</option>
            {units.filter((u) => u !== heldBy).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          {heldBy && (
            <button type="button" className={LOGI.smallButton} onClick={() => handlers.equipmentReturn(item.name)} data-testid={`logistics-return-${item.name}`}>
              <Undo2 className="h-3 w-3" aria-hidden />
              Return
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Pick an item (or Other, typed) and a team: Logistics hands it over itself (D27). */
function GiveForm({ units, handlers }: { units: string[]; handlers: LogisticsHandlers }) {
  const [item, setItem] = useState<string>(LOGISTICS_ITEMS[0]);
  const [other, setOther] = useState('');
  const [unit, setUnit] = useState('');
  useEffect(() => {
    if (unit && !units.includes(unit)) setUnit('');
  }, [unit, units]);
  const name = item === OTHER ? other.trim() : item;
  const give = () => {
    if (!name || !unit) return;
    handlers.equipmentGive(name, unit);
    if (item === OTHER) setOther('');
  };
  return (
    <form
      className={`${LOGI.card} gap-2`}
      onSubmit={(e) => {
        e.preventDefault();
        give();
      }}
      data-testid="logistics-give"
    >
      <div className="flex flex-wrap gap-2">
        <select aria-label="Item" value={item} onChange={(e) => setItem(e.target.value)} className={`${LOGI.select} min-w-[8rem] flex-1`} data-testid="logistics-give-item">
          {LOGISTICS_ITEMS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </select>
        {item === OTHER && (
          <input aria-label="Other item" placeholder="Item name" maxLength={60} value={other} onChange={(e) => setOther(e.target.value)} className={`${LOGI.input} min-w-[8rem] flex-1`} autoFocus data-testid="logistics-give-other" />
        )}
      </div>
      <div className="flex gap-2">
        <select aria-label="Team" value={unit} onChange={(e) => setUnit(e.target.value)} className={`${LOGI.select} min-w-0 flex-1`} data-testid="logistics-give-unit">
          <option value="">Team…</option>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!name || !unit} className={LOGI.primaryButton} data-testid="logistics-give-submit">
          Give
        </button>
      </div>
    </form>
  );
}

function EquipmentSection({ equipment, units, readOnly, handlers }: { equipment: MciEquipmentItem[]; units: string[]; readOnly: boolean; handlers: LogisticsHandlers }) {
  const { byUnit, free } = useMemo(() => {
    const map = new Map<string, MciEquipmentItem[]>();
    const rest: MciEquipmentItem[] = [];
    for (const item of equipment) {
      if (item.holderKind === 'team') map.set(item.holder, [...(map.get(item.holder) ?? []), item]);
      else rest.push(item);
    }
    return { byUnit: [...map.entries()].sort(([a], [b]) => a.localeCompare(b)), free: rest };
  }, [equipment]);
  return (
    <>
      <LogisticsHeading
        title="Equipment"
        label="About equipment"
        help="Hand an item to a team: it shows with the team on dispatch's board at once. With no free item of that kind, a new one is added. Other types an item that isn't listed."
      />
      {!readOnly && <GiveForm units={units} handlers={handlers} />}
      {byUnit.length === 0 && <p className={LOGI.empty}>Nothing issued to a team yet.</p>}
      {byUnit.map(([unit, items]) => (
        <div key={unit} className={LOGI.card} data-testid={`logistics-unit-${unit}`}>
          <span className={LOGI.title}>{unit}</span>
          <div className="flex flex-col">
            {items.map((item) => (
              <EquipmentLine key={item.name} item={item} units={units} readOnly={readOnly} handlers={handlers} />
            ))}
          </div>
        </div>
      ))}
      {free.length > 0 && (
        <div className={`${LOGI.card} border-dashed`} data-testid="logistics-not-issued">
          <span className={`${LOGI.title} text-surface-faint`}>Not issued</span>
          <div className="flex flex-col">
            {free.map((item) => (
              <EquipmentLine key={item.name} item={item} units={units} readOnly={readOnly} handlers={handlers} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function LogisticsBoard({
  mci,
  units,
  equipment,
  readOnly,
  handlers,
  tabs = false,
  className = '',
  bodyClassName = '',
}: {
  mci: MciState;
  /** Team and supervisor names, for handing out equipment. */
  units: string[];
  equipment: MciEquipmentItem[];
  readOnly: boolean;
  handlers: LogisticsHandlers;
  /** One section at a time under a tab bar below laptop width. */
  tabs?: boolean;
  className?: string;
  /** On the sections' grid (padding, scrolling). */
  bodyClassName?: string;
}) {
  const [section, setSection] = useState<Section>('staff');
  const incomingCount = (mci.logistics?.incoming ?? []).filter((x) => x.state === 'incoming').length;
  const shown = (s: Section) => (tabs ? `${section === s ? 'flex' : 'hidden'} lg:flex` : 'flex');
  const labels: Record<Section, string> = { equipment: 'Equipment', hospitals: 'Hospitals', staff: incomingCount ? `Incoming (${incomingCount})` : 'Incoming' };
  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      {tabs && (
        <div className="flex shrink-0 border-b border-surface-liner lg:hidden" role="tablist">
          {(['staff', 'hospitals', 'equipment'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={section === s}
              onClick={() => setSection(s)}
              className={`h-12 flex-1 border-b-[3px] text-base font-bold ${section === s ? 'border-accent bg-surface-deep' : 'border-transparent'}`}
              data-testid={`logistics-section-${s}`}
            >
              {labels[s]}
            </button>
          ))}
        </div>
      )}
      <div
        className={`grid content-start gap-4 ${tabs ? 'grid-cols-1 lg:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]' : 'grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))]'} ${bodyClassName}`}
        data-testid="logistics-board"
      >
        <section className={`${shown('equipment')} min-w-0 flex-col gap-2`} aria-label="Equipment">
          <EquipmentSection equipment={equipment} units={units} readOnly={readOnly} handlers={handlers} />
        </section>
        <section className={`${shown('hospitals')} min-w-0 flex-col gap-2`} aria-label="Hospitals">
          <Hospitals mci={mci} readOnly={readOnly} handlers={handlers.hospitals} />
        </section>
        <section className={`${shown('staff')} min-w-0 flex-col gap-2`} aria-label="Incoming Staff">
          <IncomingSection mci={mci} readOnly={readOnly} handlers={handlers} />
        </section>
      </div>
    </div>
  );
}
