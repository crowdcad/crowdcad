import type { Call, Event, Staff } from '@/app/types';

/**
 * What a trainee's clicks do to the event, for a step's `apply` ("Do it for
 * me", jumping ahead, CI replay). These follow the dispatch page's own
 * handlers closely enough for later steps to find the board they expect;
 * they are not a second implementation of dispatch logic, and the real page
 * is what trainees use. src/training/modules.test.ts replays every module
 * through them.
 */

const hhmm = (now: number) => {
  const d = new Date(now);
  return d.getHours().toString().padStart(2, '0') + d.getMinutes().toString().padStart(2, '0');
};

export const RESOLVING = ['Delivered', 'Refusal', 'NMM', 'Treat and Release', 'Unable to Locate', 'Rolled from Scene'];
export const RESOLVED_CALL = ['Resolved', 'Delivered', 'Refusal', 'NMM', 'Treat and Release', 'Rolled', 'Unable to Locate'];

export function findCall(event: Event, location: string): Call | undefined {
  return (event.calls || []).find((c) => c.location.trim().toLowerCase() === location.trim().toLowerCase());
}

export function teamOf(event: Event, team: string): Staff | undefined {
  return (event.staff || []).find((s) => s.team === team);
}

export interface NewCall {
  location: string;
  chiefComplaint?: string;
  source?: string;
  age?: string;
  gender?: string;
  assignedTeam?: string;
}

/** The Add Call modal's submit. */
export function addCall(event: Event, input: NewCall, now = Date.now()): Event {
  const order = (event.calls || []).reduce((m, c) => Math.max(m, typeof c.order === 'number' ? c.order : 0), 0) + 1;
  const call: Call = {
    id: `${now}`,
    order,
    status: input.assignedTeam ? 'Assigned' : 'Pending',
    location: input.location,
    assignedTeam: input.assignedTeam ? [input.assignedTeam] : [],
    chiefComplaint: input.chiefComplaint ?? '',
    ...(input.source && { source: input.source }),
    ...(input.age && { age: input.age }),
    ...(input.gender && { gender: input.gender }),
    priority: false,
    log: [{ timestamp: now, message: `${hhmm(now)} - Call created, location: ${input.location}` }],
  };
  const withCall = { ...event, calls: [...(event.calls || []), call] };
  return input.assignedTeam ? dispatchTeam(withCall, call.id, input.assignedTeam, now, false) : withCall;
}

function dispatchTeam(event: Event, callId: string, team: string, now: number, addToCall: boolean): Event {
  const call = event.calls.find((c) => c.id === callId);
  if (!call) return event;
  return {
    ...event,
    calls: event.calls.map((c) =>
      c.id !== callId
        ? c
        : {
            ...c,
            ...(addToCall && { assignedTeam: [...(c.assignedTeam || []), team], status: 'Assigned' }),
            log: [...(c.log || []), { timestamp: now, message: `${hhmm(now)} - ${team} assigned and en route.` }],
          }
    ),
    staff: event.staff.map((s) =>
      s.team !== team
        ? s
        : {
            ...s,
            status: 'En Route',
            location: call.location,
            originalPost: s.location || 'Unknown',
            statusSince: now,
            log: [...(s.log || []), { timestamp: now, message: `${hhmm(now)} - responding to call #${call.order}` }],
          }
    ),
  };
}

/** The call row's + menu > Add Team. */
export function assignTeam(event: Event, location: string, team: string, now = Date.now()): Event {
  const call = findCall(event, location);
  return call ? dispatchTeam(event, call.id, team, now, true) : event;
}

/** A status picked from a team's pill on a call row. */
export function setTeamStatus(event: Event, location: string, team: string, status: string, now = Date.now()): Event {
  const call = findCall(event, location);
  if (!call) return event;
  const clinicId = call.clinicId ?? event.clinics?.[0]?.id;
  const resolving = RESOLVING.includes(status);
  const callStatus = resolving
    ? status === 'Rolled from Scene' ? 'Resolved' : status
    : ['On Scene', 'Transporting', 'Pending Transport'].includes(status) ? status : call.status;
  const calls = event.calls.map((c) =>
    c.id !== call.id
      ? c
      : {
          ...c,
          status: callStatus,
          ...(status === 'Transporting' || status === 'Delivered' ? { clinicId } : {}),
          ...(status === 'Delivered' && { clinic: true }),
          ...(resolving && {
            assignedTeam: [],
            detachedTeams: [
              ...(c.detachedTeams || []),
              ...(c.assignedTeam || []).map((tm) => ({ team: tm, reason: tm === team ? status : 'Auto-detached', kind: 'team' as const })),
            ],
            pin: false,
          }),
          log: [...(c.log || []), { timestamp: now, message: `${hhmm(now)} - ${team} set to ${status} at ${c.location}` }],
        }
  );
  const staff = event.staff.map((s) => {
    const onCall = (call.assignedTeam || []).includes(s.team);
    if (s.team !== team && !(resolving && onCall)) return s;
    if (status === 'Delivered' && s.team === team) return { ...s, status: 'In Clinic', location: 'Clinic', statusSince: now };
    if (resolving) return { ...s, status: 'Available', location: s.originalPost || 'Unknown', statusSince: now };
    return { ...s, status, location: call.location, statusSince: now };
  });
  return { ...event, calls, staff };
}

/** A team's own status from its card (e.g. back to Available after the clinic). */
export function setUnitStatus(event: Event, team: string, status: string, location?: string, now = Date.now()): Event {
  return {
    ...event,
    staff: event.staff.map((s) =>
      s.team !== team ? s : { ...s, status, location: location ?? (status === 'Available' ? s.originalPost || s.location : s.location), statusSince: now }
    ),
  };
}

export const isResolved = (call: Call | undefined) => !!call && RESOLVED_CALL.includes(call.status);

/** The clinic's Add Patient (walk-up) form. */
export function addWalkup(event: Event, input: { age?: string; gender?: string; chiefComplaint: string; clinicId?: string }, now = Date.now()): Event {
  const order = (event.calls || []).reduce((m, c) => Math.max(m, typeof c.order === 'number' ? c.order : 0), 0) + 1;
  const call: Call = {
    id: `${now}`,
    order,
    status: 'Delivered',
    location: 'Clinic',
    assignedTeam: [],
    chiefComplaint: input.chiefComplaint,
    source: 'Walkup',
    ...(input.age && { age: input.age }),
    ...(input.gender && { gender: input.gender }),
    clinic: true,
    clinicId: input.clinicId ?? event.clinics?.[0]?.id,
    log: [{ timestamp: now, message: `${hhmm(now)} - Clinic walkup call created` }],
  };
  return { ...event, calls: [...(event.calls || []), call] };
}

/** A clinic patient's status pill. */
export function setClinicOutcome(event: Event, complaint: string, outcome: Call['outcome'] | 'In Clinic', transportUnit?: string): Event {
  return {
    ...event,
    calls: event.calls.map((c) =>
      c.clinic && c.chiefComplaint.toLowerCase() === complaint.toLowerCase()
        ? {
            ...c,
            outcome: outcome === 'In Clinic' ? undefined : outcome,
            ...(transportUnit ? { transportUnit } : {}),
          }
        : c
    ),
  };
}

export const clinicPatient = (event: Event, complaint: string) =>
  (event.calls || []).find((c) => c.clinic && c.chiefComplaint.toLowerCase() === complaint.toLowerCase());
