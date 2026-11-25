/**
 * A new call, built the same way wherever it comes from: the board's Add Call form, a unit's flag-down from
 * its phone (/api/field, #96) and anything else that logs a call. Pure, so the two can't disagree on order
 * numbers, the starting status or the log lines.
 */
import type { Call, Event, Staff, Supervisor, TeamLogEntry } from '@/app/types';
import { hhmmOf } from '@/lib/clock';

export interface NewCallFields {
  location: string;
  /** A dropped pin, or the phone's own position: where the call is (#94). */
  locationPoint?: { lat: number; lng: number };
  source?: string;
  age?: string;
  gender?: string;
  chiefComplaint?: string;
  notes?: string;
  /** A team or supervisor sent to it at once. */
  assignedTeam?: string;
  /** The sent unit's status: En Route (the default), or On Scene for a unit reporting a flag-down. */
  unitStatus?: string;
  /** Added to the log lines, e.g. " (Sam, from the unit)". */
  logSuffix?: string;
}

/** The next call's order number: one more than the highest so far. */
export function nextCallOrder(calls: Pick<Call, 'order'>[] | undefined): number {
  return (calls ?? []).reduce((m, c) => Math.max(m, typeof c.order === 'number' ? c.order : 0), 0) + 1;
}

/**
 * The call and the event fields it changes: `calls` with the call added, and the sent unit's card (`staff`
 * or `supervisor`) when one is sent. `id` defaults to the time, which also sorts calls oldest first.
 */
export function newCall(
  event: Pick<Event, 'calls' | 'staff' | 'supervisor'>,
  fields: NewCallFields,
  now: number,
  id: string = String(now),
): { call: Call; patch: Partial<Pick<Event, 'calls' | 'staff' | 'supervisor'>> } {
  const hhmm = hhmmOf(now);
  const order = nextCallOrder(event.calls);
  const location = fields.location.trim() || 'Unknown';
  const source = fields.source?.trim();
  const complaint = fields.chiefComplaint?.trim() ?? '';
  const unit = fields.assignedTeam?.trim();
  const unitStatus = fields.unitStatus ?? 'En Route';
  const suffix = fields.logSuffix ?? '';

  const call: Call = {
    id,
    order,
    status: !unit ? 'Pending' : unitStatus === 'En Route' ? 'Assigned' : unitStatus,
    location,
    ...(fields.locationPoint && { locationPoint: fields.locationPoint }),
    assignedTeam: unit ? [unit] : [],
    chiefComplaint: complaint,
    ...(source && { source }),
    ...(fields.age?.trim() && { age: fields.age.trim() }),
    ...(fields.gender?.trim() && { gender: fields.gender.trim() }),
    ...(fields.notes?.trim() && { notes: fields.notes.trim() }),
    priority: false,
    log: [
      {
        timestamp: now,
        message: `${hhmm} - Call created${source ? ` from ${source}` : ''}${complaint ? `, complaint: ${complaint}` : ''}, location: ${location}${unit ? `, assigned to ${unit}` : ''}${suffix}`,
      },
    ],
  };

  const patch: Partial<Pick<Event, 'calls' | 'staff' | 'supervisor'>> = { calls: [...(event.calls || []), call] };
  if (unit) {
    const line: TeamLogEntry = {
      timestamp: now,
      message: unitStatus === 'En Route' ? `${hhmm} - responding to call #${order}` : `${hhmm} - ${unit} set to ${unitStatus} at ${location}, call #${order}${suffix}`,
    };
    const send = <U extends Staff | Supervisor>(u: U): U =>
      u.team !== unit ? u : { ...u, status: unitStatus, location: fields.location.trim(), originalPost: u.location || 'Unknown', log: [...(u.log || []), line] };
    // A unit is a team or a supervisor, never both.
    if ((event.supervisor || []).some((s) => s.team === unit)) patch.supervisor = (event.supervisor || []).map(send);
    else if (event.staff) patch.staff = event.staff.map(send);
  }
  return { call, patch };
}
