'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { MciHospital, MciState } from '@/app/types';
import { emptyCounts, type MciCounts } from '@/lib/mci';
import { hospitalSentCounts, hospitalSentTotal } from '@/lib/mciLogistics';
import HelpTip from '@/components/ui/helptip';
import { MCI_COLOR_STYLES, MCI_NUMBER_INPUT, MciColorDot } from './mciparts';

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
      className={`h-8 w-16 ${MCI_NUMBER_INPUT}`}
      data-testid={testId}
    />
  );
}

function HospitalBox({ hospital, counted, readOnly, handlers }: { hospital: MciHospital; counted: MciCounts; readOnly: boolean; handlers: HospitalHandlers }) {
  const [open, setOpen] = useState(false);
  const sent = hospitalSentTotal(hospital, counted);
  const full = hospital.capacity !== undefined && sent >= hospital.capacity;
  return (
    <div className={`flex flex-col gap-2 rounded-lg border px-3 py-2 ${full ? 'border-status-red/60' : 'border-surface-liner'}`} data-testid={`hospital-${hospital.name}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-surface-light">{hospital.name}</span>
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
      <div className="grid grid-cols-2 gap-2 text-sm text-surface-light">
        <span className="flex items-center gap-2">
          Capacity:
          <NumberCell value={hospital.capacity} label={`${hospital.name} capacity`} readOnly={readOnly} allowBlank onCommit={(n) => handlers.onUpdate(hospital.id, { capacity: n })} testId={`hospital-${hospital.name}-capacity`} />
        </span>
        <span className="flex items-center justify-end gap-2">
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
            <button type="button" className="ml-auto text-xs text-status-red" onClick={() => handlers.onRemove?.(hospital.id)} data-testid={`hospital-${hospital.name}-remove`}>
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Hospitals({ mci, readOnly, handlers, inputClassName = '' }: { mci: MciState; readOnly: boolean; handlers: HospitalHandlers; inputClassName?: string }) {
  const [name, setName] = useState('');
  const hospitals = mci.logistics?.hospitals ?? [];
  const counts = useMemo(() => hospitalSentCounts(mci), [mci]);
  const add = () => {
    if (!name.trim()) return;
    handlers.onAdd(name);
    setName('');
  };
  return (
    <section className="flex min-w-0 flex-col gap-2" data-testid="hospitals">
      <div className="flex items-center gap-1">
        <h2 className="text-lg font-semibold">Hospitals</h2>
        <HelpTip text="Sent counts transports whose destination is the hospital's name. Type Sent to correct it." label="About hospitals" />
      </div>
      {!readOnly && (
        <div className="flex gap-2">
          <input
            aria-label="Hospital name"
            placeholder="Hospital name"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            className={`h-8 min-w-0 flex-1 rounded-lg border border-surface-liner bg-surface-liner/40 px-3 text-sm text-surface-light outline-none focus:border-surface-faint ${inputClassName}`}
            data-testid="hospital-name"
          />
          <button type="button" onClick={add} disabled={!name.trim()} className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-accent px-3 text-sm text-surface-light disabled:opacity-40" data-testid="hospital-add">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add hospital
          </button>
        </div>
      )}
      {hospitals.length === 0 && <p className="text-sm text-surface-faint">No hospitals yet.</p>}
      {hospitals.map((h) => (
        <HospitalBox key={h.id} hospital={h} counted={counts.get(h.id) ?? emptyCounts()} readOnly={readOnly} handlers={handlers} />
      ))}
    </section>
  );
}
