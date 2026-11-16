'use client';

import React, { useMemo } from 'react';
import { toast } from 'react-toastify';
import { Button } from '@heroui/react';
import { ChevronDown, KeyRound } from 'lucide-react';
import type { Event } from '@/app/types';
import { deriveMci, isMciActive } from '@/lib/mci';
import { mciEquipmentFor } from '@/lib/mciDoc';
import {
  addHospital,
  addIncoming,
  arriveIncoming,
  cancelIncoming,
  giveEquipment,
  removeHospital,
  takeBackEquipment,
  undoIncoming,
  updateHospital,
  updateIncoming,
  type LogisticsResult,
} from '@/lib/mciLogistics';
import LogisticsBoard, { type LogisticsHandlers } from './logisticsboard';
import RoleLogins from './rolelogins';
import MciTotalsStrip from './mcitotalsstrip';

/**
 * The dispatcher's MCI Logistics tab (#139): the Logistics board (Equipment, Hospitals, Incoming Staff),
 * with role logins behind a Logins button that opens them above the board. The board writes the event
 * directly; the Logistics role login shows the same board (D27). The MCI log is in the left panel's Log
 * view. Read-only once the MCI stands down.
 */

type UpdateEvent = (updates: Partial<Event> | ((current: Event) => Partial<Event>)) => Promise<void>;

const ERRORS: Record<NonNullable<LogisticsResult['error']>, string> = {
  inactive: 'The MCI has ended.',
  invalid: 'Give the team a name.',
  duplicate: 'A team with that name already exists.',
  missing: 'That team is no longer in the list.',
  busy: 'That team is already working (or holds equipment), so it stays on the board.',
  'no-team': 'That team is no longer on the board.',
};

export default function LogisticsTab({
  event,
  updateEvent,
  logins,
  loginsOpen = false,
  onLoginsOpenChange,
}: {
  event: Event;
  updateEvent: UpdateEvent;
  /** Role logins (#142): omitted where they aren't available (Lite, PocketBase). */
  logins?: { eventId: string; uid: string };
  /** Whether the Logins section is open (the page keeps it, so the MCI tab's Logins button can open it). */
  loginsOpen?: boolean;
  onLoginsOpenChange?: (open: boolean) => void;
}) {
  const readOnly = !isMciActive(event);

  const run = (build: (e: Event) => LogisticsResult, errors: Partial<typeof ERRORS> = {}) => {
    // Checked against what this page shows first, so a refusal is explained; then applied to the saved event.
    const check = build(event);
    if (check.error) return void toast.error(errors[check.error] ?? ERRORS[check.error]);
    void updateEvent((current) => build(current).patch);
  };

  const hospitalErrors = { invalid: 'Give the hospital a name.', duplicate: 'That hospital is already on the list.', missing: 'That hospital is no longer on the list.' };
  const equipmentErrors = { invalid: 'Pick an item and a team.', missing: 'That item is no longer on the list.' };
  const handlers: LogisticsHandlers = {
    incomingAdd: (name) => run((e) => addIncoming(e, { name }, Date.now())),
    incomingUpdate: (id, changes) => run((e) => updateIncoming(e, id, changes)),
    incomingArrived: (id) => run((e) => arriveIncoming(e, id, Date.now())),
    incomingCancel: (id) => run((e) => cancelIncoming(e, id, Date.now())),
    incomingUndo: (id) => run((e) => undoIncoming(e, id), { duplicate: 'A team with that name is already on the board or the list.' }),
    equipmentGive: (item, unit, exact) => {
      // One id and time for the check and the write, so a new item is made once.
      const now = Date.now();
      const id = `eq_${now}_${Math.random().toString(36).slice(2, 8)}`;
      run((e) => giveEquipment(e, { item, unit, exact }, now, id), equipmentErrors);
    },
    equipmentReturn: (name) => run((e) => takeBackEquipment(e, name, Date.now()), equipmentErrors),
    hospitals: {
      onAdd: (name) => {
        const id = `hospital-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        run((e) => addHospital(e, name, Date.now(), id), hospitalErrors);
      },
      onUpdate: (id, changes) => run((e) => updateHospital(e, id, changes), { ...hospitalErrors, invalid: 'Type a whole number.' }),
      onRemove: (id) => run((e) => removeHospital(e, id), hospitalErrors),
    },
  };

  const loginUnits = useMemo(
    () => [...(event.staff ?? []).map((s) => ({ name: s.team, id: s.id, kind: 'team' as const })), ...(event.supervisor ?? []).map((s) => ({ name: s.team, id: s.id, kind: 'supervisor' as const }))],
    [event.staff, event.supervisor],
  );
  const units = useMemo(() => loginUnits.map((u) => u.name), [loginUnits]);
  const equipment = useMemo(() => mciEquipmentFor(event), [event]);
  const totals = useMemo(() => deriveMci(event).totals, [event]);

  if (!event.mci) return null;
  return (
    <div className="tab-scroll minimal-scrollbar flex min-h-0 flex-1 flex-col gap-4" data-testid="logistics-tab">
      {/* The same totals as MCI Patients, with Logins beside them; the opened logins push the board down. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <MciTotalsStrip mci={event.mci} totals={totals} />
        {logins && !readOnly && (
          <Button
            size="sm"
            variant="flat"
            radius="lg"
            startContent={<KeyRound className="h-3.5 w-3.5" />}
            endContent={<ChevronDown className={`h-3.5 w-3.5 transition-transform ${loginsOpen ? 'rotate-180' : ''}`} />}
            onPress={() => onLoginsOpenChange?.(!loginsOpen)}
            aria-expanded={loginsOpen}
            data-testid="logistics-logins-toggle"
          >
            Logins
          </Button>
        )}
      </div>
      {logins && !readOnly && loginsOpen && <RoleLogins eventId={logins.eventId} eventName={event.name} units={loginUnits} uid={logins.uid} />}
      <LogisticsBoard mci={event.mci} units={units} equipment={equipment} readOnly={readOnly} handlers={handlers} />
    </div>
  );
}
