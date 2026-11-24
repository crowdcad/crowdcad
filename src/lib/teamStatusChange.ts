/**
 * A unit's status change as the board makes it: the unit's status and log line, and, when it is on a
 * call, the call's combined status and log line. Pure, so the dispatch page and server routes (a field
 * login changing its own status) make exactly the same change.
 *
 * Equipment runs and the end of a "Returning Eq" run are the dispatch page's own (they move equipment).
 */
import type { Call, Event, Staff, Supervisor, TeamLogEntry } from '@/app/types';
import { getClinicName, getEventClinics } from '@/lib/clinics';
import { hhmmOf } from '@/lib/clock';

/** Extension packs' fields and log lines for a status change (e.g. an MCI zone set by Triage). */
export interface StatusChangeExtra {
  patch: Partial<Staff>;
  logMessages: string[];
}

export interface StatusChangeOptions {
  now: number;
  /** For Transporting: the destination clinic's id. Other statuses pass it to `extra`. */
  detail?: string;
  extra?: (unit: Staff | Supervisor) => StatusChangeExtra;
  /** Appended to the log lines, e.g. " (from the unit's phone)". */
  logSuffix?: string;
}

/** The call a unit is working, if any. */
export function activeCallOf(event: Pick<Event, 'calls'>, unit: string): Call | undefined {
  return (event.calls || []).find((c) => c.assignedTeam?.includes(unit) && !['Resolved', 'Available'].includes(c.status));
}

/** A call's status from its units' statuses (the furthest along wins). */
export function combinedCallStatus(current: string, unitStatuses: string[]): string {
  if (unitStatuses.includes('Transporting')) return 'Transporting';
  if (unitStatuses.includes('Pending Transport')) return 'Pending Transport';
  if (unitStatuses.includes('On Scene')) return 'On Scene';
  if (unitStatuses.includes('En Route')) return 'En Route';
  return current;
}

/**
 * The staff, supervisor and calls after `unit` changes to `newStatus`. Returns only the arrays it
 * changed; an unknown unit changes nothing.
 */
export function teamStatusChange(
  event: Pick<Event, 'staff' | 'supervisor' | 'calls' | 'clinics'>,
  unit: string,
  newStatus: string,
  opts: StatusChangeOptions,
): Partial<Pick<Event, 'staff' | 'supervisor' | 'calls'>> {
  const isTeam = (event.staff || []).some((s) => s.team === unit);
  const isSupervisor = !isTeam && (event.supervisor || []).some((s) => s.team === unit);
  if (!isTeam && !isSupervisor) return {};

  const now = opts.now;
  const hhmm = hhmmOf(now);
  const activeCall = activeCallOf(event, unit);
  const clinicId = newStatus === 'Transporting' ? (opts.detail ?? activeCall?.clinicId ?? event.clinics?.[0]?.id ?? 'clinic') : activeCall?.clinicId;
  const destination = newStatus === 'Transporting' ? getClinicName(getEventClinics(event.clinics), clinicId) : undefined;
  const suffix = opts.logSuffix ?? '';
  // "at <location>" says which call a status belongs to without a separate call reference.
  const logMessage =
    newStatus === 'Transporting'
      ? `${hhmm} - ${unit} transporting to ${destination || 'clinic'}${suffix}`
      : `${hhmm} - ${unit} set to ${newStatus}${activeCall ? ` at ${activeCall.location}` : ''}${suffix}`;

  const change = <U extends Staff | Supervisor>(u: U): U => {
    if (u.team !== unit) return u;
    const extra = opts.extra?.(u) ?? { patch: {}, logMessages: [] };
    const lines: TeamLogEntry[] = [
      { timestamp: now, message: logMessage },
      ...extra.logMessages.map((m) => ({ timestamp: now, message: `${hhmm} - ${m}` })),
    ];
    // Location is never changed here: the card works out the destination and sets it itself.
    return { ...u, ...extra.patch, status: newStatus, log: [...(u.log || []), ...lines] };
  };

  const staff = isTeam ? (event.staff || []).map(change) : undefined;
  const supervisor = isSupervisor ? (event.supervisor || []).map(change) : undefined;
  const out: Partial<Pick<Event, 'staff' | 'supervisor' | 'calls'>> = {};
  if (staff) out.staff = staff;
  if (supervisor) out.supervisor = supervisor;

  if (activeCall) {
    const statusOf = (name: string) =>
      name === unit
        ? newStatus
        : (staff ?? event.staff ?? []).find((s) => s.team === name)?.status ??
          (supervisor ?? event.supervisor ?? []).find((s) => s.team === name)?.status ??
          'Available';
    out.calls = (event.calls || []).map((c) =>
      c.id !== activeCall.id
        ? c
        : {
            ...c,
            status: combinedCallStatus(c.status, (c.assignedTeam || []).map(statusOf)),
            clinicId: newStatus === 'Transporting' ? clinicId : c.clinicId,
            log: [...(c.log || []), { timestamp: now, message: logMessage }],
          },
    );
  }
  return out;
}
