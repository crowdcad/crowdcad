'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { MciHospital, MciState } from '@/app/types';
import { emptyCounts, type MciCounts } from '@/lib/mci';
import { hospitalSentCounts, hospitalSentTotal } from '@/lib/mciLogistics';
import HelpTip from '@/components/ui/helptip';
import { MCI_COLOR_STYLES, MCI_NUMBER_INPUT, MciColorDot } from './mciparts';
import { LOGI } from './logisticsstyles';

/**
 * Hospitals in the Logistics tab and the Logistics role view: a box per hospital with its capacity and how
 * many were sent, and an arrow that opens the red, yellow and green counts sent there. Sent is counted from
 * transports whose destination is the hospital; typing it corrects the count.
 */

export interface HospitalHandlers {
  onAdd: (name: string) => void;
  onUpdate: (id: string, changes: { capacity?: number | null; sent?: number }) => void;
  onRemove?: (id: string) => void;
}

/** A number typed in place, saved on Enter or leaving the field; blank clears it when `allowBlank`. */
function NumberCell({ value, label, readOnly, allowBlank, onCommit, testId }: { value: number | undefined; label: string; readOnly: boolean; allowBlank: boolean; onCommit: (n: number | null) => void; testId: string }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(value === undefined ? '' : String(value));
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const trimmed = text.trim();
    if (!trimmed) {
      if (allowBlank && value !== undefined) onCommit(null);
      else setText(value === undefined ? '' : String(value));
      return;
    }
    const n = Number.parseInt(trimmed, 10);
    if (Number.isInteger(n) && n >= 0 && n !== value) onCommit(n);
    else setText(value === undefined ? '' : String(value));
  };
  return (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      aria-label={label}
      readOnly={readOnly}
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={`${LOGI.number} text-sm ${MCI_NUMBER_INPUT}`}
      data-testid={testId}
    />
  );
}

function HospitalBox({ hospital, counted, readOnly, handlers }: { hospital: MciHospital; counted: MciCounts; readOnly: boolean; handlers: HospitalHandlers }) {
  const [open, setOpen] = useState(false);
  const sent = hospitalSentTotal(hospital, counted);
  const full = hospital.capacity !== undefined && sent >= hospital.capacity;
  return (
    <div className={`${LOGI.card} ${full ? '!border-status-red/60' : ''}`} data-testid={`hospital-${hospital.name}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`${LOGI.title} min-w-0 truncate`}>{hospital.name}</span>
        {full && <span className={`${LOGI.badge} ml-auto text-status-red`}>Full</span>}
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} patients sent to ${hospital.name} by color`}
          onClick={() => setOpen((v) => !v)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-surface-faint hover:bg-surface-liner hover:text-surface-light"
          data-testid={`hospital-${hospital.name}-toggle`}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-surface-light">
        <span className="flex items-center gap-2">
          Capacity:
          <NumberCell value={hospital.capacity} label={`${hospital.name} capacity`} readOnly={readOnly} allowBlank onCommit={(n) => handlers.onUpdate(hospital.id, { capacity: n })} testId={`hospital-${hospital.name}-capacity`} />
        </span>
        <span className="flex items-center gap-2">
          Sent:
          <NumberCell value={sent} label={`${hospital.name} sent`} readOnly={readOnly} allowBlank={false} onCommit={(n) => n !== null && handlers.onUpdate(hospital.id, { sent: n })} testId={`hospital-${hospital.name}-sent`} />
        </span>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-surface-liner pt-2 text-sm" data-testid={`hospital-${hospital.name}-colors`}>
          {(['red', 'yellow', 'green'] as const).map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 text-surface-light">
              <MciColorDot color={c} />
              {MCI_COLOR_STYLES[c].label}
              <span className="font-semibold tabular-nums">{counted[c]}</span>
            </span>
          ))}
          {!readOnly && handlers.onRemove && (
            <button type="button" className={`${LOGI.link} ml-auto !text-status-red`} onClick={() => handlers.onRemove?.(hospital.id)} data-testid={`hospital-${hospital.name}-remove`}>
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Hospitals({ mci, readOnly, handlers }: { mci: MciState; readOnly: boolean; handlers: HospitalHandlers }) {
  const [name, setName] = useState('');
  const hospitals = mci.logistics?.hospitals ?? [];
  const counts = useMemo(() => hospitalSentCounts(mci), [mci]);
  const add = () => {
    if (!name.trim()) return;
    handlers.onAdd(name);
    setName('');
  };
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="hospitals">
      <div className="flex min-h-8 items-center gap-1">
        <h2 className={LOGI.heading}>Hospitals</h2>
        <HelpTip text="Where patients are sent. Sent counts transports whose destination is the hospital's name; type Sent to correct it. The arrow shows the colors sent." label="About hospitals" />
      </div>
      {!readOnly && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            aria-label="Hospital name"
            placeholder="Hospital name"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${LOGI.input} min-w-0 flex-1`}
            data-testid="hospital-name"
          />
          <button type="submit" disabled={!name.trim()} className={LOGI.primaryButton} data-testid="hospital-add">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add hospital
          </button>
        </form>
      )}
      {hospitals.length === 0 && <p className={LOGI.empty}>No hospitals yet.</p>}
      {hospitals.map((h) => (
        <HospitalBox key={h.id} hospital={h} counted={counts.get(h.id) ?? emptyCounts()} readOnly={readOnly} handlers={handlers} />
      ))}
    </div>
  );
}
