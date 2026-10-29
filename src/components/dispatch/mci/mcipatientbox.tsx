'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Ambulance, GripVertical, MoreVertical, X } from 'lucide-react';
import { Dropdown, DropdownItem, DropdownMenu, DropdownSection, DropdownTrigger } from '@heroui/react';
import type { MciColor } from '@/app/types';
import { MCI_COLORS, mciPatientLabel, type MciPatient, type MciPatientField } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { MCI_COLOR_STYLES, formatClock } from './mciparts';

/** The drag payload type for a patient box; the value is the patient id. */
export const MCI_PATIENT_DRAG_TYPE = 'application/x-ccad-mci-patient';

export type MciReassignTarget = { areaId?: string; color?: MciColor };

type Props = {
  patient: MciPatient;
  /** The zone the patient came from, for the second line. */
  zoneName?: string;
  readOnly: boolean;
  /** Team names for the Team field, the ones that worked the patient's zone first. */
  teamSuggestions: string[];
  /** Ambulance numbers used this MCI. */
  unitSuggestions: string[];
  /** Every treatment location, for the box's Move to menu. */
  areas: { id: string; name: string }[];
  onDetails: (patientId: string, fields: Partial<Record<MciPatientField, string>>) => void;
  onPriority: (patientId: string, rank: number | null) => void;
  onTransport: (patientId: string, trip: { unit?: string; destination?: string }) => void | Promise<unknown>;
  /** Asks for the optional note, then retriages or moves the patient. */
  onReassign: (patient: MciPatient, target: MciReassignTarget) => void;
};

/** A small cell input: borderless until hovered or focused, so an empty box reads as placeholders. */
const CELL =
  'h-6 min-w-0 rounded-sm border border-transparent bg-surface-liner/30 px-1 text-xs text-surface-light placeholder:text-surface-faint outline-none hover:border-surface-liner focus:border-surface-faint focus:outline-none focus:ring-0 focus-visible:ring-0 disabled:cursor-default disabled:hover:border-transparent';
const NUMBER_CELL = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none text-center tabular-nums';
const ICON_BUTTON = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-surface-faint hover:bg-surface-liner hover:text-surface-light';

/** Moves focus to the same box's next field, or to the next box's age, for quick entry with Enter. */
function focusNext(from: HTMLElement, field: 'age' | 'sex' | 'complaint') {
  const box = from.closest<HTMLElement>('[data-mci-patient]');
  if (!box) return;
  if (field === 'age') box.querySelector<HTMLInputElement>('[data-mci-field="sex"]')?.focus();
  else if (field === 'sex') box.querySelector<HTMLInputElement>('[data-mci-field="complaint"]')?.focus();
  else {
    const boxes = Array.from(box.parentElement?.querySelectorAll<HTMLElement>('[data-mci-patient]') ?? []);
    const next = boxes[boxes.indexOf(box) + 1];
    next?.querySelector<HTMLInputElement>('[data-mci-field="age"]')?.focus();
  }
}

/** An input that keeps what is typed locally and saves it on blur or Enter; Escape puts the saved value back. */
function CellInput({
  value,
  onCommit,
  disabled,
  className,
  onEnter,
  onTyped,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
  onEnter?: (input: HTMLInputElement) => void;
  /** Called after each change with the new text (sex uses it to move on after one letter). */
  onTyped?: (text: string, input: HTMLInputElement) => void;
}) {
  const [draft, setDraftState] = useState(value);
  // The latest text, read on blur: a blur can fire inside the change handler (sex moves focus on), before a re-render.
  const latest = useRef(value);
  // Set while there is typing not yet saved.
  const dirty = useRef(false);
  const setDraft = (text: string) => {
    latest.current = text;
    setDraftState(text);
  };
  // The saved value shows (another dispatcher's edit, or a priority turned into its rank) unless typing is pending.
  useEffect(() => {
    if (dirty.current) return;
    latest.current = value;
    setDraftState(value);
  }, [value]);
  const commit = () => {
    dirty.current = false;
    if (latest.current !== value) onCommit(latest.current);
    // A save that changes nothing (e.g. "1" on the patient already first) still shows the saved value.
    else setDraft(value);
  };
  return (
    <input
      {...rest}
      disabled={disabled}
      value={draft}
      onChange={(e) => {
        dirty.current = true;
        setDraft(e.target.value);
        onTyped?.(e.target.value, e.target);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          onEnter?.(e.currentTarget);
        } else if (e.key === 'Escape') {
          dirty.current = false;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className={`${CELL} ${className ?? ''}`}
    />
  );
}

/** The inline "left in an ambulance" form under a box: both fields optional, Enter confirms. */
function TransportRow({ units, onCancel, onConfirm }: { units: string[]; onCancel: () => void; onConfirm: (trip: { unit?: string; destination?: string }) => void }) {
  const { t } = useDispatchTerms();
  const listId = useId();
  const [unit, setUnit] = useState('');
  const [destination, setDestination] = useState('');
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm({ unit, destination });
    } else if (e.key === 'Escape') onCancel();
  };
  return (
    <div className="flex flex-wrap items-center gap-1 border-t border-surface-liner pt-1" data-testid="mci-patient-transport-row">
      <input
        autoFocus
        list={listId}
        maxLength={40}
        placeholder={t('Ambulance number')}
        aria-label={t('Ambulance number')}
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        onKeyDown={keys}
        className={`${CELL} w-24 flex-1`}
        data-testid="mci-patient-transport-unit"
      />
      <datalist id={listId}>
        {units.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <input
        maxLength={80}
        placeholder={t('Destination')}
        aria-label={t('Destination')}
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
        onKeyDown={keys}
        className={`${CELL} w-24 flex-1`}
      />
      <button
        type="button"
        onClick={() => onConfirm({ unit, destination })}
        className="h-6 shrink-0 rounded-md bg-accent px-2 text-xs text-surface-light"
        data-testid="mci-patient-transport-confirm"
      >
        Transported
      </button>
      <button type="button" onClick={onCancel} aria-label="Cancel transport" className={ICON_BUTTON}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * One patient in a treatment location: priority, age, sex and chief complaint on the first line; where they came
 * from, when, and the team that brought them on the second. The grip drags the box to another column or location;
 * the menu does the same without dragging; the ambulance marks them transported.
 */
export default function MciPatientBox({ patient, zoneName, readOnly, teamSuggestions, unitSuggestions, areas, onDetails, onPriority, onTransport, onReassign }: Props) {
  const teamListId = useId();
  const [transporting, setTransporting] = useState(false);
  // The box is draggable only while the grip is held, so text in its inputs can still be selected.
  const [dragArmed, setDragArmed] = useState(false);
  const { details } = patient;
  const color = MCI_COLOR_STYLES[patient.color];
  const label = mciPatientLabel(details) || 'patient';
  const otherAreas = areas.filter((a) => a.id !== patient.areaId);

  const commitPriority = (text: string) => {
    const n = Number.parseInt(text, 10);
    onPriority(patient.id, Number.isInteger(n) && n > 0 ? n : null);
  };

  return (
    <div
      data-mci-patient={patient.id}
      draggable={!readOnly && dragArmed}
      onDragStart={(e) => {
        e.dataTransfer.setData(MCI_PATIENT_DRAG_TYPE, patient.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => setDragArmed(false)}
      className={`flex flex-col gap-1 rounded-md border border-surface-liner border-l-4 bg-surface-deepest py-1 pl-1 pr-1.5 ${color.borderLeftClass}`}
      aria-label={`${color.label} ${label}`}
      data-testid={`mci-patient-${patient.color}`}
    >
      <div className="flex items-center gap-1">
        {!readOnly && (
          <span
            onPointerDown={() => setDragArmed(true)}
            onPointerUp={() => setDragArmed(false)}
            className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-surface-faint active:cursor-grabbing"
            title="Drag to another column or location"
            aria-hidden
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}
        <CellInput
          data-mci-field="age"
          aria-label="Age"
          placeholder="Age"
          maxLength={5}
          disabled={readOnly}
          value={details.age ?? ''}
          onCommit={(v) => onDetails(patient.id, { age: v })}
          onEnter={(el) => focusNext(el, 'age')}
          className="w-10 text-center"
          data-testid="mci-patient-age"
        />
        <CellInput
          data-mci-field="sex"
          aria-label="Sex"
          placeholder="Sex"
          maxLength={1}
          disabled={readOnly}
          value={details.sex ?? ''}
          onCommit={(v) => onDetails(patient.id, { sex: v })}
          onEnter={(el) => focusNext(el, 'sex')}
          onTyped={(text, el) => {
            if (/^[a-z]$/i.test(text)) focusNext(el, 'sex');
          }}
          className="w-8 text-center uppercase placeholder:normal-case"
          data-testid="mci-patient-sex"
        />
        <CellInput
          data-mci-field="complaint"
          aria-label="Chief complaint"
          placeholder="Chief complaint"
          maxLength={40}
          disabled={readOnly}
          value={details.complaint ?? ''}
          onCommit={(v) => onDetails(patient.id, { complaint: v })}
          onEnter={(el) => focusNext(el, 'complaint')}
          className="flex-1"
          data-testid="mci-patient-complaint"
        />
        <CellInput
          type="number"
          min={1}
          inputMode="numeric"
          aria-label="Transport priority"
          title="Transport priority (1 goes first)"
          placeholder="#"
          disabled={readOnly}
          value={patient.rank !== undefined ? String(patient.rank) : ''}
          onCommit={commitPriority}
          className={`w-7 font-semibold ${NUMBER_CELL} ${patient.rank !== undefined ? 'bg-accent/30' : ''}`}
          data-testid="mci-patient-priority"
        />
        {!readOnly && (
          <>
            <Dropdown>
              <DropdownTrigger>
                <button type="button" className={ICON_BUTTON} aria-label={`Retriage or move ${label}`} data-testid="mci-patient-menu">
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label={`Retriage or move ${label}`}
                onAction={(key) => {
                  const [kind, value] = String(key).split(':');
                  onReassign(patient, kind === 'color' ? { color: value as MciColor } : { areaId: value });
                }}
              >
                {[
                  <DropdownSection key="retriage" title="Retriage" showDivider={otherAreas.length > 0}>
                    {MCI_COLORS.filter((c) => c !== patient.color).map((c) => (
                      <DropdownItem key={`color:${c}`} textValue={MCI_COLOR_STYLES[c].label} data-testid={`mci-patient-retriage-${c}`}>
                        {MCI_COLOR_STYLES[c].label}
                      </DropdownItem>
                    ))}
                  </DropdownSection>,
                  ...(otherAreas.length > 0
                    ? [
                        <DropdownSection key="move" title="Move to">
                          {otherAreas.map((a) => (
                            <DropdownItem key={`area:${a.id}`} textValue={a.name}>
                              {a.name}
                            </DropdownItem>
                          ))}
                        </DropdownSection>,
                      ]
                    : []),
                ]}
              </DropdownMenu>
            </Dropdown>
            <button
              type="button"
              onClick={() => setTransporting((v) => !v)}
              aria-label={`Mark ${label} transported`}
              aria-expanded={transporting}
              title="Transported"
              className={`${ICON_BUTTON} ${transporting ? 'bg-surface-liner text-surface-light' : ''}`}
              data-testid="mci-patient-transport"
            >
              <Ambulance className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      <div className={`flex items-center gap-1.5 text-[11px] text-surface-faint ${readOnly ? '' : 'pl-5'}`}>
        <span className="truncate">{zoneName ? `from ${zoneName}` : 'walk-in'}</span>
        <span className="tabular-nums">{formatClock(patient.arrivedAt).slice(0, 5)}</span>
        <CellInput
          list={teamListId}
          aria-label="Team that brought the patient in"
          placeholder="Team"
          maxLength={40}
          disabled={readOnly}
          value={details.team ?? ''}
          onCommit={(v) => onDetails(patient.id, { team: v })}
          className="ml-auto h-5 w-20 text-[11px]"
          data-testid="mci-patient-team"
        />
        <datalist id={teamListId}>
          {teamSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      {transporting && !readOnly && (
        <TransportRow
          units={unitSuggestions}
          onCancel={() => setTransporting(false)}
          onConfirm={(trip) => {
            setTransporting(false);
            void onTransport(patient.id, trip);
          }}
        />
      )}
    </div>
  );
}
