'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, SelectItem } from '@heroui/react';
import { Plus, Undo2 } from 'lucide-react';
import { toast } from 'react-toastify';
import type { Event, EventEquipment, IncomingEta, IncomingTeam } from '@/app/types';
import { custodyOf, describeCustody, materializeEventEquipment } from '@/lib/equipmentCustody';
import { getEquipmentIconType } from '@/lib/equipmentIcon';
import { isMciActive } from '@/lib/mci';
import {
  addHospital,
  addIncoming,
  arriveIncoming,
  cancelIncoming,
  ETA_STATUS_LABELS,
  etaLabel,
  isOverdue,
  normalizeEtaTime,
  isOpenIncoming,
  closeRequest,
  removeHospital,
  sortIncoming,
  updateHospital,
  updateIncoming,
  type LogisticsResult,
} from '@/lib/mciLogistics';
import Hospitals, { type HospitalHandlers } from './hospitals';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import EquipmentTypeIcon from '../equipmenttypeicon';
import { MCI_INPUT_CLASSNAMES } from './mciparts';

/**
 * The MCI Logistics tab (#139), for whoever runs logistics beside the
 * dispatcher:
 * - Equipment issued to teams: ordinary event equipment, handed to a team
 *   (custody: carried by that team), so it shows on the team's card, on the
 *   map and next to the team on its calls. Items can be added at any time.
 * - Hospitals: a box per hospital with its capacity and how many were sent
 *   (counted from transports to it), opening to show the colors sent.
 * - Incoming Staff: teams reported on their way, with an ETA (a time, or
 *   Pending / En route / Attempted contact) and notes, until they arrive and
 *   become a team on the board.
 * Read-only once the MCI stands down.
 */

type UpdateEvent = (updates: Partial<Event> | ((current: Event) => Partial<Event>)) => Promise<void>;

const ERRORS: Record<NonNullable<LogisticsResult['error']>, string> = {
  inactive: 'The MCI has stood down.',
  invalid: 'Give the team a name.',
  duplicate: 'A team with that name already exists.',
  missing: 'That team is no longer in the list.',
};

type EtaChoice = IncomingEta['kind'];
const ETA_CHOICES: { key: EtaChoice; label: string }[] = [
  { key: 'time', label: 'Time' },
  { key: 'en_route', label: ETA_STATUS_LABELS.en_route },
  { key: 'pending', label: ETA_STATUS_LABELS.pending },
  { key: 'attempted', label: ETA_STATUS_LABELS.attempted },
];

function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** ETA: a status, or a typed time. A time is saved once it reads as one. */
function EtaEditor({ eta, onChange, disabled, testId }: { eta: IncomingEta; onChange: (eta: IncomingEta) => void; disabled?: boolean; testId: string }) {
  const [time, setTime] = useState(eta.kind === 'time' ? eta.time : '');
  const [kind, setKind] = useState<EtaChoice>(eta.kind);
  useEffect(() => {
    setKind(eta.kind);
    if (eta.kind === 'time') setTime(eta.time);
  }, [eta]);
  const commitTime = () => {
    const t = normalizeEtaTime(time);
    if (t) onChange({ kind: 'time', time: t });
    else if (time.trim()) toast.error('Type the ETA as a time, e.g. 0930 or 9:30.');
  };
  return (
    <div className="flex items-center gap-1.5">
      <Select
        aria-label="ETA"
        size="sm"
        radius="lg"
        className="w-40"
        selectedKeys={new Set([kind])}
        disallowEmptySelection
        isDisabled={disabled}
        onSelectionChange={(keys) => {
          const k = Array.from(keys as Set<string>)[0] as EtaChoice;
          setKind(k);
          if (k !== 'time') onChange({ kind: k } as IncomingEta);
        }}
        data-testid={`${testId}-eta`}
      >
        {ETA_CHOICES.map((c) => (
          <SelectItem key={c.key}>{c.label}</SelectItem>
        ))}
      </Select>
      {kind === 'time' && (
        <Input
          aria-label="ETA time"
          size="sm"
          radius="lg"
          className="w-24"
          placeholder="HH:MM"
          value={time}
          onValueChange={setTime}
          onBlur={commitTime}
          onKeyDown={(e) => e.key === 'Enter' && commitTime()}
          isDisabled={disabled}
          classNames={MCI_INPUT_CLASSNAMES}
          data-testid={`${testId}-eta-time`}
        />
      )}
    </div>
  );
}

/** A text field that saves when it loses focus or on Enter. */
function SavedField({ value, onSave, label, placeholder, disabled, className, testId }: { value: string; onSave: (v: string) => void; label: string; placeholder?: string; disabled?: boolean; className?: string; testId?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onSave(draft);
  return (
    <Input
      aria-label={label}
      size="sm"
      radius="lg"
      placeholder={placeholder}
      value={draft}
      onValueChange={setDraft}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      isDisabled={disabled}
      className={className}
      classNames={MCI_INPUT_CLASSNAMES}
      data-testid={testId}
    />
  );
}

function IncomingRow({ team, now, readOnly, run }: { team: IncomingTeam; now: Date; readOnly: boolean; run: (build: (e: Event) => LogisticsResult) => void }) {
  const reported = team.state === 'reported';
  const overdue = !reported && isOverdue(team.eta, now);
  const testId = `incoming-${team.name}`;
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border p-2.5 ${reported ? 'border-status-green/70 bg-status-green/10' : overdue ? 'border-status-red/60 bg-status-red/10' : 'border-surface-liner'}`}
      data-testid={testId}
    >
      {reported && (
        <span className="text-sm font-semibold text-status-green" data-testid={`${testId}-reported`}>
          {team.reportedBy ?? 'Logistics'} reports they have arrived. Confirm to add them to the board.
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[6rem] font-semibold">{team.name}</span>
        <EtaEditor eta={team.eta} disabled={readOnly} testId={testId} onChange={(eta) => run((e) => updateIncoming(e, team.id, { eta }))} />
        {overdue && <span className="text-xs font-semibold text-status-red">Overdue</span>}
        {!readOnly && (
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" radius="lg" className="bg-status-green/25 text-status-green" onPress={() => run((e) => arriveIncoming(e, team.id, Date.now()))} data-testid={`${testId}-arrived`}>
              {reported ? 'Confirm arrival' : 'Arrived'}
            </Button>
            <Button size="sm" radius="lg" variant="flat" onPress={() => run((e) => cancelIncoming(e, team.id, Date.now()))} data-testid={`${testId}-cancel`}>
              Cancel
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <SavedField
          label="Members"
          placeholder="Members, separated by commas"
          className="min-w-[12rem] flex-1"
          value={team.members.join(', ')}
          disabled={readOnly}
          onSave={(v) => run((e) => updateIncoming(e, team.id, { members: v.split(',').map((m) => m.trim()).filter(Boolean) }))}
        />
        <SavedField
          label="Notes"
          placeholder="Notes"
          className="min-w-[12rem] flex-[2]"
          value={team.notes}
          disabled={readOnly}
          onSave={(notes) => run((e) => updateIncoming(e, team.id, { notes }))}
          testId={`${testId}-notes`}
        />
      </div>
    </div>
  );
}

function EquipmentRow({ eq, event, units, readOnly, onIssue, onReturn }: { eq: EventEquipment; event: Event; units: string[]; readOnly: boolean; onIssue: (unit: string) => void; onReturn?: () => void }) {
  const custody = custodyOf(eq, event);
  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5" data-testid={`logistics-equipment-${eq.name}`}>
      <EquipmentTypeIcon type={getEquipmentIconType(eq.name)} />
      <span className="font-medium">{eq.name}</span>
      <span className="text-xs text-surface-faint">{describeCustody(custody, eq.assignedTeam)}</span>
      {!readOnly && (
        <div className="ml-auto flex items-center gap-1.5">
          <Select
            aria-label={`Issue ${eq.name} to a team`}
            placeholder={custody.holder.kind === 'team' ? 'Give to…' : 'Issue to…'}
            size="sm"
            radius="lg"
            className="w-40"
            selectedKeys={new Set<string>()}
            onSelectionChange={(keys) => {
              const unit = Array.from(keys as Set<string>)[0];
              if (unit) onIssue(unit);
            }}
            data-testid={`logistics-issue-${eq.name}`}
          >
            {units.filter((u) => !(custody.holder.kind === 'team' && custody.holder.name === u)).map((u) => (
              <SelectItem key={u}>{u}</SelectItem>
            ))}
          </Select>
          {onReturn && (
            <Button size="sm" radius="lg" variant="flat" startContent={<Undo2 className="h-3.5 w-3.5" />} onPress={onReturn} data-testid={`logistics-return-${eq.name}`}>
              Return
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function LogisticsTab({
  event,
  updateEvent,
  onIssueEquipment,
  onReturnEquipment,
  onAddEquipment,
}: {
  event: Event;
  updateEvent: UpdateEvent;
  onIssueEquipment: (equipmentName: string, unit: string) => void;
  onReturnEquipment: (equipmentName: string) => void;
  onAddEquipment: () => void;
}) {
  const { t } = useDispatchTerms();
  const now = useNow();
  const readOnly = !isMciActive(event);
  const [name, setName] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const run = (build: (e: Event) => LogisticsResult, errors: Partial<typeof ERRORS> = {}) => {
    // Checked against what this page shows first, so a refusal is explained; then applied to the saved event.
    const check = build(event);
    if (check.error) return void toast.error(errors[check.error] ?? ERRORS[check.error]);
    void updateEvent((current) => build(current).patch);
  };
  const hospitalErrors = { invalid: 'Give the hospital a name.', duplicate: 'That hospital is already on the list.', missing: 'That hospital is no longer on the list.' };
  const hospitalHandlers: HospitalHandlers = {
    onAdd: (hospitalName) => {
      const id = `hospital-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      run((e) => addHospital(e, hospitalName, Date.now(), id), hospitalErrors);
    },
    onUpdate: (id, changes) => run((e) => updateHospital(e, id, changes), { ...hospitalErrors, invalid: 'Type a whole number.' }),
    onRemove: (id) => run((e) => removeHospital(e, id), hospitalErrors),
  };

  const add = () => {
    const before = name;
    run((e) => addIncoming(e, { name: before }, Date.now()));
    if (name.trim()) setName('');
  };

  const incoming = event.mci?.logistics?.incoming ?? [];
  const openRequests = (event.mci?.logistics?.requests ?? []).filter((r) => r.state === 'open');
  const open = sortIncoming(incoming.filter(isOpenIncoming), now);
  const closed = incoming.filter((x) => !isOpenIncoming(x));

  const units = useMemo(() => [...(event.staff ?? []).map((s) => s.team), ...(event.supervisor ?? []).map((s) => s.team)], [event.staff, event.supervisor]);
  const { issued, notIssued } = useMemo(() => {
    const byUnit = new Map<string, EventEquipment[]>();
    const rest: EventEquipment[] = [];
    for (const eq of materializeEventEquipment(event)) {
      const c = custodyOf(eq, event);
      if (c.holder.kind === 'team') byUnit.set(c.holder.name, [...(byUnit.get(c.holder.name) ?? []), eq]);
      else rest.push(eq);
    }
    return { issued: [...byUnit.entries()].sort(([a], [b]) => a.localeCompare(b)), notIssued: rest };
  }, [event]);

  return (
    <div className="minimal-scrollbar grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] content-start gap-4 overflow-y-auto" data-testid="logistics-tab">
      <section className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('Equipment')}</h2>
          {!readOnly && (
            <Button size="sm" radius="lg" variant="flat" startContent={<Plus className="h-3.5 w-3.5" />} onPress={onAddEquipment} data-testid="logistics-add-equipment">
              {t('Add equipment')}
            </Button>
          )}
        </div>
        {openRequests.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/60 bg-accent/10 px-2.5 py-2" data-testid={`logistics-request-${r.item}`}>
            <span className="text-sm">
              <b>{r.byUnit ?? 'Logistics'}</b> asks for <b>{r.item}</b> for <b>{r.unit}</b>
            </span>
            {!readOnly && (
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" radius="lg" className="bg-status-green/25 text-status-green" onPress={() => run((e) => closeRequest(e, r.id, 'done', Date.now()))}>
                  Done
                </Button>
                <Button size="sm" radius="lg" variant="flat" onPress={() => run((e) => closeRequest(e, r.id, 'dismissed', Date.now()))}>
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        ))}
        {issued.length === 0 && <p className="text-sm text-surface-faint">Nothing issued to a team yet.</p>}
        {issued.map(([unit, items]) => (
          <div key={unit} className="rounded-lg border border-surface-liner px-2.5 py-1" data-testid={`logistics-unit-${unit}`}>
            <p className="pt-1 text-sm font-semibold">{unit}</p>
            {items.map((eq) => (
              <EquipmentRow key={eq.id} eq={eq} event={event} units={units} readOnly={readOnly} onIssue={(u) => onIssueEquipment(eq.name, u)} onReturn={() => onReturnEquipment(eq.name)} />
            ))}
          </div>
        ))}
        {notIssued.length > 0 && (
          <div className="rounded-lg border border-dashed border-surface-liner px-2.5 py-1">
            <p className="pt-1 text-sm font-semibold text-surface-faint">Not issued</p>
            {notIssued.map((eq) => (
              <EquipmentRow key={eq.id} eq={eq} event={event} units={units} readOnly={readOnly} onIssue={(u) => onIssueEquipment(eq.name, u)} />
            ))}
          </div>
        )}
      </section>

      {event.mci && <Hospitals mci={event.mci} readOnly={readOnly} handlers={hospitalHandlers} />}

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-lg font-semibold">Incoming Staff</h2>
        {!readOnly && (
          <div className="flex gap-2">
            <Input
              aria-label="Incoming team name"
              size="sm"
              radius="lg"
              placeholder="Team name, e.g. Medic 12"
              value={name}
              onValueChange={setName}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              classNames={MCI_INPUT_CLASSNAMES}
              data-testid="incoming-name"
            />
            <Button size="sm" radius="lg" className="bg-accent text-surface-light" startContent={<Plus className="h-3.5 w-3.5" />} onPress={add} isDisabled={!name.trim()} data-testid="incoming-add">
              Add team
            </Button>
          </div>
        )}
        {open.length === 0 && <p className="text-sm text-surface-faint">No teams on their way.</p>}
        {open.map((team) => (
          <IncomingRow key={team.id} team={team} now={now} readOnly={readOnly} run={run} />
        ))}
        {closed.length > 0 && (
          <div className="flex flex-col gap-1">
            <button type="button" className="self-start text-sm text-surface-faint underline" onClick={() => setShowClosed((v) => !v)}>
              {showClosed ? 'Hide' : 'Show'} arrived and cancelled ({closed.length})
            </button>
            {showClosed &&
              closed.map((x) => (
                <p key={x.id} className="text-sm text-surface-faint">
                  {x.name}: {x.state === 'arrived' ? 'arrived' : 'cancelled'}
                  {x.closedAt ? ` at ${new Date(x.closedAt).toTimeString().slice(0, 5)}` : ''} (ETA was {etaLabel(x.eta)})
                </p>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
