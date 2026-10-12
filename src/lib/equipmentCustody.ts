import type {
  Call,
  EquipmentCustodyEntry,
  EquipmentHolder,
  EquipmentPhase,
  Event,
  EventEquipment,
  Staff,
  Supervisor,
} from '@/app/types';
import { getEventClinics } from '@/lib/clinics';

/**
 * Equipment custody: who has each piece of equipment, and where it is in its
 * run. A run goes
 *
 *   staged -> retrieving -> carried -> with_care_team | carried (Assisting)
 *          -> returning | in_clinic -> staged
 *
 * Equipment has no tracker of its own. Its holder (a post, a unit or a
 * clinic) says where it is, so on a live-tracking event it moves with the
 * unit carrying it.
 *
 * Every transition also writes the legacy fields (`status`, `assignedTeam`,
 * `location`) the rest of the app reads, so the map, the lite store and
 * older clients keep working. Equipment saved before custody tracking has no
 * `phase`; custodyOf() derives one from those legacy fields.
 *
 * Everything here is pure: each function takes the event's equipment and
 * units and returns new arrays for the caller to save.
 */

export const RETRIEVING_EQ = 'Retrieving Eq';
export const RETURNING_EQ = 'Returning Eq';

/** Unit statuses on a call while running equipment, in run order. */
export const EQUIPMENT_RUN_STATUSES = [RETRIEVING_EQ, 'En Route Eq', 'Assisting', 'Delivered Eq'];

/** Unit statuses that mean "running equipment", on a call or on the way back. */
export const EQUIPMENT_STATUSES = [...EQUIPMENT_RUN_STATUSES, RETURNING_EQ];

const CUSTODY_LOG_MAX = 50;

export type CustodyActor = EquipmentCustodyEntry['by'];

export interface Custody {
  phase: EquipmentPhase;
  holder: EquipmentHolder;
}

/** The parts of an event that custody changes touch. */
export interface Fleet {
  eventEquipment: EventEquipment[];
  staff: Staff[];
  supervisor: Supervisor[];
}

type EventLike = Pick<Event, 'venue' | 'staff' | 'supervisor' | 'clinics'>;

export const postHolder = (name: string): EquipmentHolder => ({ kind: 'post', name });
export const unitHolder = (name: string): EquipmentHolder => ({ kind: 'team', name });
export const clinicHolder = (name: string): EquipmentHolder => ({ kind: 'clinic', name });

const hhmm = (t: number) => {
  const d = new Date(t);
  return d.getHours().toString().padStart(2, '0') + d.getMinutes().toString().padStart(2, '0');
};

export function fleetOf(event: Pick<Event, 'eventEquipment' | 'staff' | 'supervisor'>): Fleet {
  return { eventEquipment: event.eventEquipment || [], staff: event.staff || [], supervisor: event.supervisor || [] };
}

export function unitNames(event: Pick<Event, 'staff' | 'supervisor'>): Set<string> {
  return new Set([...(event.staff || []).map((s) => s.team), ...(event.supervisor || []).map((s) => s.team)]);
}

/** 'Clinic', 'In Clinic', or one of the event's clinic names. */
export function isClinicLocation(event: Pick<Event, 'clinics'>, name: string): boolean {
  if (name === 'Clinic' || name === 'In Clinic') return true;
  return getEventClinics(event.clinics).some((c) => c.name === name);
}

/** Where the equipment lives between runs: its event default, else the venue's, else 'Staging'. */
export function stagingLocation(eq: EventEquipment, event: Pick<Event, 'venue'>): string {
  if (eq.defaultLocation) return eq.defaultLocation;
  const venueEq = (event.venue?.equipment || []).find((v) => (typeof v === 'string' ? v : v.name) === eq.name);
  return (venueEq && typeof venueEq !== 'string' && venueEq.location) || 'Staging';
}

/** The equipment's custody, derived from the legacy fields when it has none stored. */
export function custodyOf(eq: EventEquipment, event: EventLike): Custody {
  if (eq.phase && eq.holder) return { phase: eq.phase, holder: eq.holder };
  const loc = eq.location || '';
  if (eq.status === 'In Clinic' || loc === 'Clinic' || loc === 'In Clinic') {
    return { phase: 'in_clinic', holder: clinicHolder(loc && loc !== 'In Clinic' ? loc : 'Clinic') };
  }
  if (eq.assignedTeam && eq.status !== 'Available') return { phase: 'carried', holder: unitHolder(eq.assignedTeam) };
  if (loc && unitNames(event).has(loc)) return { phase: 'carried', holder: unitHolder(loc) };
  return { phase: 'staged', holder: postHolder(loc || stagingLocation(eq, event)) };
}

const sameHolder = (a: EquipmentHolder, b: EquipmentHolder) => a.kind === b.kind && a.name === b.name;

/**
 * Sets the equipment's custody, appends it to the custody log and writes the
 * matching legacy fields. `team` is the unit fetching it ('retrieving' only).
 */
export function withCustody(
  eq: EventEquipment,
  custody: Custody,
  opts: { t: number; by: CustodyActor; team?: string | null }
): EventEquipment {
  const { phase, holder } = custody;
  const team = phase === 'retrieving' ? opts.team ?? eq.assignedTeam ?? null : null;
  const assignedTeam = phase === 'retrieving' ? team : holder.kind === 'team' ? holder.name : null;
  const status = phase === 'staged' ? 'Available' : phase === 'in_clinic' ? 'In Clinic' : 'In Use';

  const last = eq.custodyLog?.[eq.custodyLog.length - 1];
  const unchanged = !!last && last.phase === phase && sameHolder(last.holder, holder) && (last.team ?? null) === team;
  const entry: EquipmentCustodyEntry = { t: opts.t, phase, holder, by: opts.by, ...(team ? { team } : {}) };
  const custodyLog = unchanged ? eq.custodyLog! : [...(eq.custodyLog || []), entry].slice(-CUSTODY_LOG_MAX);

  return { ...eq, phase, holder, status, assignedTeam, location: holder.name, custodyLog };
}

/** Equipment a unit has in hand: it is the holder, whatever the phase. */
export function heldBy(fleet: Pick<Fleet, 'eventEquipment'>, event: EventLike, unit: string): EventEquipment[] {
  return fleet.eventEquipment.filter((eq) => {
    const c = custodyOf(eq, event);
    return c.holder.kind === 'team' && c.holder.name === unit && c.phase !== 'retrieving';
  });
}

/** Equipment a unit has been sent to fetch and hasn't picked up yet. */
export function fetchingBy(fleet: Pick<Fleet, 'eventEquipment'>, event: EventLike, unit: string): EventEquipment[] {
  return fleet.eventEquipment.filter((eq) => custodyOf(eq, event).phase === 'retrieving' && eq.assignedTeam === unit);
}

/** Equipment a unit is running: fetching it or holding it. */
export function equipmentOfUnit(fleet: Pick<Fleet, 'eventEquipment'>, event: EventLike, unit: string): EventEquipment[] {
  return fleet.eventEquipment.filter((eq) => {
    const c = custodyOf(eq, event);
    return c.phase === 'retrieving' ? eq.assignedTeam === unit : c.holder.kind === 'team' && c.holder.name === unit;
  });
}

/** Whether the equipment can be sent out on a call: not already being fetched or used on one. */
export function isDispatchable(eq: EventEquipment, event: EventLike): boolean {
  const { phase } = custodyOf(eq, event);
  return phase === 'staged' || phase === 'returning' || phase === 'in_clinic';
}

function mapUnits(fleet: Fleet, fn: <U extends Staff | Supervisor>(u: U) => U): Fleet {
  return { ...fleet, staff: fleet.staff.map(fn), supervisor: fleet.supervisor.map(fn) };
}

function logUnit<U extends Staff | Supervisor>(u: U, t: number, message: string): U {
  return { ...u, log: [...(u.log || []), { timestamp: t, message: `${hhmm(t)} - ${message}` }] };
}

/**
 * A unit left in 'Returning Eq' with nothing left to return goes back to
 * Available (its equipment was handed on, returned or moved by hand).
 */
export function settleReturningUnits(fleet: Fleet, event: EventLike, t: number): Fleet {
  return mapUnits(fleet, (u) => {
    if (u.status !== RETURNING_EQ) return u;
    if (heldBy(fleet, event, u.team).length > 0) return u;
    return logUnit({ ...u, status: 'Available' }, t, 'no equipment left to return, status set to Available');
  });
}

/** Units that now hold equipment on its way back are set to 'Returning Eq', heading to its staging location. */
function markReturningUnits(fleet: Fleet, event: EventLike, units: string[], t: number): Fleet {
  if (!units.length) return fleet;
  return mapUnits(fleet, (u) => {
    if (!units.includes(u.team)) return u;
    const items = heldBy(fleet, event, u.team);
    if (!items.length) return u;
    const to = stagingLocation(items[0], event);
    return logUnit({ ...u, status: RETURNING_EQ, location: to }, t, `returning ${items.map((e) => e.name).join(', ')} to ${to}`);
  });
}

/**
 * Event equipment, materialized from the venue catalog when the event has
 * none yet (the equipment list shows the venue catalog until then, so writing
 * one item alone would hide the others).
 */
export function materializeEventEquipment(event: Pick<Event, 'eventEquipment' | 'venue'>, t = Date.now()): EventEquipment[] {
  if (event.eventEquipment && event.eventEquipment.length > 0) return event.eventEquipment;
  return (event.venue?.equipment || []).map((v, i) => {
    const name = typeof v === 'string' ? v : v.name;
    const location = typeof v === 'string' ? 'Staging' : v.location || 'Staging';
    return {
      id: `eq_${t}_${i}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      status: 'Available',
      location,
      defaultLocation: location,
      assignedTeam: null,
    };
  });
}

export interface AssignEquipmentInput {
  callId: string;
  equipmentName: string;
  unit: string;
  t: number;
  /** Shown in the unit's log ("call #3"). */
  callNumber?: number | string;
  /** Adjusts the call log line (e.g. withPendingSuffix). */
  formatCallLog?: (message: string, call: Call) => string;
}

/**
 * Sends a unit on a call with a piece of equipment. A unit already holding it
 * goes straight to 'En Route Eq'; otherwise it goes to fetch it first
 * ('Retrieving Eq'), heading to wherever the equipment is.
 */
export function assignEquipment(
  event: EventLike & Pick<Event, 'calls' | 'eventEquipment'>,
  input: AssignEquipmentInput
): (Fleet & { calls: Call[] }) | null {
  const { callId, equipmentName, unit, t } = input;
  const call = event.calls.find((c) => c.id === callId);
  const equipment = materializeEventEquipment(event, t);
  const eq = equipment.find((e) => e.name === equipmentName);
  if (!call || !eq) return null;

  const custody = custodyOf(eq, event);
  const alreadyHeld = custody.holder.kind === 'team' && custody.holder.name === unit && custody.phase !== 'retrieving';
  const nextEq = alreadyHeld
    ? withCustody(eq, { phase: 'carried', holder: custody.holder }, { t, by: 'status' })
    : withCustody(eq, { phase: 'retrieving', holder: custody.holder }, { t, by: 'status', team: unit });

  const unitStatus = alreadyHeld ? 'En Route Eq' : RETRIEVING_EQ;
  // Non-tracked events show the unit's destination as its Location.
  const unitLocation = alreadyHeld || custody.holder.kind === 'team' ? call.location : custody.holder.name;
  const callRef = input.callNumber !== undefined ? `call #${input.callNumber}` : 'call';
  const unitMessage = alreadyHeld
    ? `responding to ${callRef} with ${eq.name}`
    : `retrieving ${eq.name} from ${custody.holder.name} for ${callRef}`;

  const callMessage = `${hhmm(t)} - ${eq.name} assigned to ${unit} for this call.`;
  const otherUnitsOnCall = (call.assignedTeam || []).length > 0;
  const updatedCall: Call = {
    ...call,
    assignedTeam: [...(call.assignedTeam || []).filter((u) => u !== unit), unit],
    equipment: [...(call.equipment || []).filter((n) => n !== eq.name), eq.name],
    equipmentTeams: [...(call.equipmentTeams || []).filter((u) => u !== unit), unit],
    status: otherUnitsOnCall ? call.status : 'Assigned',
    log: [...(call.log || []), { timestamp: t, message: input.formatCallLog ? input.formatCallLog(callMessage, call) : callMessage }],
  };

  let fleet: Fleet = {
    eventEquipment: equipment.map((e) => (e.id === eq.id ? nextEq : e)),
    staff: event.staff || [],
    supervisor: event.supervisor || [],
  };
  fleet = mapUnits(fleet, (u) =>
    u.team === unit
      ? logUnit({ ...u, status: unitStatus, location: unitLocation, originalPost: u.location || 'Unknown' }, t, unitMessage)
      : u
  );

  return { ...fleet, calls: event.calls.map((c) => (c.id === callId ? updatedCall : c)) };
}

/**
 * A unit has picked up everything it was sent to fetch. The previous holder,
 * if it was a unit on its way back with it, has nothing left to return.
 */
export function pickUpEquipment(fleet: Fleet, event: EventLike, unit: string, t: number, by: CustodyActor = 'status', only?: string): Fleet {
  const next: Fleet = {
    ...fleet,
    eventEquipment: fleet.eventEquipment.map((eq) => {
      if (only && eq.name !== only) return eq;
      const c = custodyOf(eq, event);
      if (c.phase !== 'retrieving' || eq.assignedTeam !== unit) return eq;
      return withCustody(eq, { phase: 'carried', holder: unitHolder(unit) }, { t, by });
    }),
  };
  return settleReturningUnits(next, event, t);
}

/** A unit sent back to fetching: what it holds for a run waits at its staging location again. */
export function unPickUpEquipment(fleet: Fleet, event: EventLike, unit: string, t: number): Fleet {
  return {
    ...fleet,
    eventEquipment: fleet.eventEquipment.map((eq) => {
      const c = custodyOf(eq, event);
      if (c.phase !== 'carried' || c.holder.kind !== 'team' || c.holder.name !== unit) return eq;
      return withCustody(eq, { phase: 'retrieving', holder: postHolder(stagingLocation(eq, event)) }, { t, by: 'status', team: unit });
    }),
  };
}

/**
 * 'Delivered Eq': the unit leaves what it is running with the care team on
 * scene, or at the call's location when no care team is on the call.
 */
export function handOffEquipment(
  fleet: Fleet,
  event: EventLike,
  unit: string,
  careTeam: string | null,
  dropLocation: string,
  t: number
): Fleet {
  return {
    ...fleet,
    eventEquipment: fleet.eventEquipment.map((eq) => {
      if (!equipmentOfUnit(fleet, event, unit).includes(eq)) return eq;
      return careTeam
        ? withCustody(eq, { phase: 'with_care_team', holder: unitHolder(careTeam) }, { t, by: 'status' })
        : withCustody(eq, { phase: 'staged', holder: postHolder(dropLocation) }, { t, by: 'status' });
    }),
  };
}

/**
 * Units leave a call (it resolved, or they were detached or removed).
 * - Delivered to a clinic (`clinicName` set): what they hold goes to that clinic.
 * - Otherwise what they hold is on its way back with them, and they are set to 'Returning Eq'.
 * - Anything they hadn't picked up yet stays where it was.
 */
export function releaseEquipment(
  fleet: Fleet,
  event: EventLike,
  units: string[],
  t: number,
  clinicName?: string
): Fleet {
  const returning = new Set<string>();
  const next: Fleet = {
    ...fleet,
    eventEquipment: fleet.eventEquipment.map((eq) => {
      const c = custodyOf(eq, event);
      if (c.phase === 'retrieving') {
        if (!eq.assignedTeam || !units.includes(eq.assignedTeam)) return eq;
        const back: EquipmentPhase = c.holder.kind === 'post' ? 'staged' : c.holder.kind === 'clinic' ? 'in_clinic' : 'returning';
        return withCustody(eq, { phase: back, holder: c.holder }, { t, by: 'status' });
      }
      if (c.holder.kind !== 'team' || !units.includes(c.holder.name)) return eq;
      if (clinicName) return withCustody(eq, { phase: 'in_clinic', holder: clinicHolder(clinicName) }, { t, by: 'status' });
      if (c.phase === 'returning') return eq;
      returning.add(c.holder.name);
      return withCustody(eq, { phase: 'returning', holder: c.holder }, { t, by: 'status' });
    }),
  };
  return markReturningUnits(next, event, [...returning], t);
}

/** Puts the equipment back at a post (default: its staging location). */
export function returnEquipment(
  fleet: Fleet,
  event: EventLike,
  equipmentName: string,
  t: number,
  by: CustodyActor = 'dispatcher',
  to?: string
): Fleet {
  const next: Fleet = {
    ...fleet,
    eventEquipment: fleet.eventEquipment.map((eq) =>
      eq.name === equipmentName ? withCustody(eq, { phase: 'staged', holder: postHolder(to || stagingLocation(eq, event)) }, { t, by }) : eq
    ),
  };
  return settleReturningUnits(next, event, t);
}

/** A unit marked Available after 'Returning Eq': everything it was bringing back is at its staging location. */
export function returnAllFromUnit(fleet: Fleet, event: EventLike, unit: string, t: number, by: CustodyActor = 'status'): Fleet {
  return {
    ...fleet,
    eventEquipment: fleet.eventEquipment.map((eq) => {
      const c = custodyOf(eq, event);
      if (c.phase !== 'returning' || c.holder.name !== unit) return eq;
      return withCustody(eq, { phase: 'staged', holder: postHolder(stagingLocation(eq, event)) }, { t, by });
    }),
  };
}

/**
 * The dispatcher's manual override: the equipment is now at `location`.
 * A unit name means that unit has it, a clinic means it is in that clinic,
 * anything else is a post or free-text place where it is waiting.
 */
export function moveEquipment(fleet: Fleet, event: EventLike, equipmentName: string, location: string, t: number): Fleet {
  const custody: Custody = unitNames(event).has(location)
    ? { phase: 'carried', holder: unitHolder(location) }
    : isClinicLocation(event, location)
      ? { phase: 'in_clinic', holder: clinicHolder(location === 'In Clinic' ? 'Clinic' : location) }
      : { phase: 'staged', holder: postHolder(location) };
  const next: Fleet = {
    ...fleet,
    eventEquipment: fleet.eventEquipment.map((eq) => (eq.name === equipmentName ? withCustody(eq, custody, { t, by: 'dispatcher' }) : eq)),
  };
  return settleReturningUnits(next, event, t);
}

const PHASE_LABELS: Record<EquipmentPhase, string> = {
  staged: 'At',
  retrieving: 'Being retrieved',
  carried: 'With',
  with_care_team: 'With care team',
  returning: 'Returning with',
  in_clinic: 'In',
};

/** One line for where the equipment is: "With Team 3", "Being retrieved by Team 3 from Gate A". */
export function describeCustody(custody: Custody, fetchingUnit?: string | null): string {
  const { phase, holder } = custody;
  if (phase === 'retrieving') return `${PHASE_LABELS.retrieving}${fetchingUnit ? ` by ${fetchingUnit}` : ''} from ${holder.name}`;
  if (phase === 'with_care_team') return `${PHASE_LABELS.with_care_team} (${holder.name})`;
  return `${PHASE_LABELS[phase]} ${holder.name}`;
}
