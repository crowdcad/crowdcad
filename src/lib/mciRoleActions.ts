import type { Event, IncomingEta, MciAssignment, MciColor, Staff, Supervisor } from '@/app/types';
import {
  addPatientPatch,
  mciAssignmentName,
  mciAssignmentPatch,
  movePatch,
  notedPatch,
  movePatientInOrderPatch,
  patientCarePatch,
  reassignPatientPatch,
  routedMovePatch,
  setPatientDetailsPatch,
  tagBatchPatch,
  transportPatientPatch,
  type MciCounts,
  type MciPatientField,
  type MciWrite,
  type MciWriteContext,
} from './mci';
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
} from './mciLogistics';
import { effectiveRole, type EventRole } from './roleAccounts';

/**
 * What an MCI role login (#144) may do, as the same patches the dispatcher's
 * MCI tab writes. Run by the server route /api/mci-role inside a transaction,
 * against the event with its MCI state merged in; every log entry is stamped
 * with the login's unit and role (#152), so the attribution can't be forged
 * from the phone. Pure, so it is unit tested here.
 */

export type RoleAction =
  | { type: 'assign'; assignment: MciAssignment }
  | { type: 'counts'; zoneId: string; deltas: Partial<MciCounts> }
  /** Without `areaId`, each color goes to its own tarp (`routedMovePatch`). */
  | { type: 'move'; zoneId: string; areaId?: string; counts: Partial<MciCounts> }
  | { type: 'addPatient'; areaId: string; color: MciColor; fields: Partial<Record<MciPatientField, string>> }
  | { type: 'patientDetails'; patientId: string; fields: Partial<Record<MciPatientField, string>> }
  | { type: 'patientCare'; patientId: string; notes?: string; intervention?: string }
  /** The Treatment Lead moves a patient one place up or down the transport order shown. */
  | { type: 'priority'; patientId: string; direction: 'up' | 'down' }
  | { type: 'reassign'; patientId: string; color?: MciColor; areaId?: string }
  | { type: 'transport'; patientId: string; unit?: string; destination?: string }
  | { type: 'incomingAdd'; name: string; eta?: IncomingEta; notes?: string }
  | { type: 'incomingUpdate'; id: string; eta?: IncomingEta; notes?: string; members?: string[] }
  /** The team arrived: it goes on the board at once (D27). */
  | { type: 'incomingArrived'; id: string }
  | { type: 'incomingCancel'; id: string }
  /** An arrival or cancellation pressed by mistake goes back on the list (D28). */
  | { type: 'incomingUndo'; id: string }
  /** Hands an item (a name or a kind, "Trauma bag") to a unit, making one if none is free (D27). */
  | { type: 'equipmentGive'; item: string; unit: string; exact?: boolean }
  | { type: 'equipmentReturn'; name: string }
  | { type: 'hospitalAdd'; name: string }
  | { type: 'hospitalUpdate'; id: string; capacity?: number | null; sent?: number }
  | { type: 'hospitalRemove'; id: string };

const ALLOWED: Record<ReturnType<typeof effectiveRole>, readonly RoleAction['type'][]> = {
  responder: ['assign', 'counts', 'move', 'addPatient', 'patientDetails', 'patientCare', 'reassign'],
  // The transport order is the Treatment Lead's (and the dispatcher's) alone.
  treatment_lead: ['assign', 'addPatient', 'patientDetails', 'patientCare', 'priority', 'reassign'],
  transport: ['transport'],
  // Everything the dispatcher's Logistics tab does (D27).
  logistics: ['incomingAdd', 'incomingUpdate', 'incomingArrived', 'incomingCancel', 'incomingUndo', 'equipmentGive', 'equipmentReturn', 'hospitalAdd', 'hospitalUpdate', 'hospitalRemove'],
  incident_command: [],
};

export interface RoleActor {
  uid: string;
  role: EventRole;
  /** The unit the login belongs to; required for every action. */
  unitName: string;
  unitId?: string;
}

export interface RoleActionResult {
  patch: Partial<Event>;
  error?: string;
}

const ERROR_TEXT: Record<string, string> = {
  inactive: 'The MCI has stood down.',
  'unknown-zone': 'That zone no longer exists.',
  'unknown-area': 'That treatment zone no longer exists.',
  'unknown-patient': 'That patient is no longer here.',
  'wrong-color': 'That treatment zone only takes patients of its own color.',
  'no-area': 'There is no treatment zone for one of those colors yet. Ask the dispatcher.',
  invalid: 'Nothing to send.',
  duplicate: 'That name is already in use.',
  missing: 'That entry is no longer in the list.',
  'no-team': 'That team is no longer on the board.',
  busy: 'That team is already working (or holds equipment), so it stays on the board.',
  forbidden: 'Your role cannot do that.',
  'no-unit': 'This login is not assigned to a team. Ask the dispatcher to replace it.',
  'unknown-unit': 'Your team is no longer on the board. Ask the dispatcher.',
};

export function roleActionAllowed(role: EventRole, type: RoleAction['type']): boolean {
  return ALLOWED[effectiveRole(role)].includes(type);
}

function fromMci(w: MciWrite): RoleActionResult {
  return w.error ? { patch: {}, error: ERROR_TEXT[w.error] ?? w.error } : { patch: w.patch };
}

function fromLogistics(w: LogisticsResult): RoleActionResult {
  return w.error ? { patch: {}, error: ERROR_TEXT[w.error] ?? w.error } : { patch: w.patch };
}

/** Chains a 'noted' entry after a patch, so a change that moves no count is still in the log under the unit. */
function andNote(event: Event, w: RoleActionResult, note: string, where: { zoneId?: string; areaId?: string; patientId?: string }, ctx: MciWriteContext): RoleActionResult {
  if (w.error || Object.keys(w.patch).length === 0) return w;
  const after = { ...event, ...w.patch } as Event;
  const noted = notedPatch(after, note, where, ctx);
  return noted.error ? w : { patch: { ...w.patch, ...noted.patch } };
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return d.getHours().toString().padStart(2, '0') + d.getMinutes().toString().padStart(2, '0');
}

/** Sets the unit's own Triage zone or Treatment zone on the board, as the dispatcher's status picker would. */
function assign(event: Event, actor: RoleActor, assignment: MciAssignment, ctx: MciWriteContext): RoleActionResult {
  const name = mciAssignmentName(event.mci, assignment);
  if (!event.mci?.active) return { patch: {}, error: ERROR_TEXT.inactive };
  if (!name) return { patch: {}, error: ERROR_TEXT[assignment.kind === 'zone' ? 'unknown-zone' : 'unknown-area'] };
  const status = assignment.kind === 'zone' ? 'Triage' : 'Treatment';
  // On a live-tracking event Location stays where the unit is (D66); the MCI assignment says where it works.
  const { patch: unitPatch, logMessage } = mciAssignmentPatch(event, assignment, event.mapMode === 'tak');
  const matches = (u: Staff | Supervisor) => (actor.unitId ? u.id === actor.unitId : false) || u.team === actor.unitName;
  const update = <T extends Staff | Supervisor>(u: T): T =>
    matches(u)
      ? ({
          ...u,
          ...unitPatch,
          status,
          statusSince: ctx.now,
          log: [...(u.log || []), { timestamp: ctx.now, message: `${hhmm(ctx.now)} - ${status} at ${name} (from ${actor.unitName}'s phone)${logMessage ? `; ${logMessage}` : ''}` }],
        } as T)
      : u;
  const staff = (event.staff || []).map(update);
  const supervisor = (event.supervisor || []).map(update);
  const found = staff.some(matches) || supervisor.some(matches);
  if (!found) return { patch: {}, error: ERROR_TEXT['unknown-unit'] };
  const noted = notedPatch(event, `${actor.unitName}: ${status}, ${name}`, assignment.kind === 'zone' ? { zoneId: assignment.id } : { areaId: assignment.id }, ctx);
  if (noted.error) return fromMci(noted);
  return { patch: { staff, supervisor, ...noted.patch } };
}

/** Applies a role login's action to the event (MCI state merged in). */
export function applyRoleAction(event: Event, action: RoleAction, actor: RoleActor, now: number, newId?: () => string): RoleActionResult {
  if (!roleActionAllowed(actor.role, action.type)) return { patch: {}, error: ERROR_TEXT.forbidden };
  if (!actor.unitName) return { patch: {}, error: ERROR_TEXT['no-unit'] };
  const ctx: MciWriteContext = { now, by: actor.uid, byUnit: actor.unitName, byRole: effectiveRole(actor.role), ...(newId ? { newId } : {}) };
  switch (action.type) {
    case 'assign':
      return assign(event, actor, action.assignment, ctx);
    case 'counts':
      return fromMci(tagBatchPatch(event, action.zoneId, action.deltas, ctx));
    case 'move':
      return fromMci(
        action.areaId
          ? movePatch(event, action.zoneId, action.areaId, action.counts, { ...ctx, batch: (newId ?? (() => `b${now}`))() })
          : routedMovePatch(event, action.zoneId, action.counts, undefined, ctx)
      );
    case 'addPatient':
      return fromMci(addPatientPatch(event, action.areaId, action.color, action.fields, ctx));
    case 'patientDetails': {
      const w = fromMci(setPatientDetailsPatch(event, action.patientId, action.fields));
      return andNote(event, w, `Patient details updated`, { patientId: action.patientId }, ctx);
    }
    case 'patientCare':
      return fromMci(patientCarePatch(event, action.patientId, { notes: action.notes, intervention: action.intervention }, ctx));
    case 'priority': {
      const w = fromMci(movePatientInOrderPatch(event, action.patientId, action.direction));
      return andNote(event, w, `Patient moved ${action.direction} the transport order`, { patientId: action.patientId }, ctx);
    }
    case 'reassign':
      return fromMci(reassignPatientPatch(event, action.patientId, { color: action.color, areaId: action.areaId }, undefined, ctx));
    case 'transport':
      return fromMci(transportPatientPatch(event, action.patientId, { unit: action.unit, destination: action.destination }, ctx));
    case 'incomingAdd': {
      const w = fromLogistics(addIncoming(event, { name: action.name, eta: action.eta, notes: action.notes, reportedBy: actor.unitName }, now));
      return andNote(event, w, `Incoming staff added: ${action.name.trim()}`, {}, ctx);
    }
    case 'incomingUpdate': {
      const changes = { ...(action.eta ? { eta: action.eta } : {}), ...(action.notes !== undefined ? { notes: action.notes } : {}), ...(action.members ? { members: action.members } : {}) };
      return fromLogistics(updateIncoming(event, action.id, changes));
    }
    case 'incomingArrived': {
      const team = event.mci?.logistics?.incoming.find((t) => t.id === action.id);
      const w = fromLogistics(arriveIncoming(event, action.id, now));
      return andNote(event, w, `Arrived: ${team?.name ?? 'incoming team'}, now on the board`, {}, ctx);
    }
    case 'incomingUndo': {
      const team = event.mci?.logistics?.incoming.find((t) => t.id === action.id);
      const w = fromLogistics(undoIncoming(event, action.id));
      return andNote(event, w, `${team?.name ?? 'Team'} back on the incoming list (${team?.state === 'cancelled' ? 'cancel' : 'arrival'} undone)`, {}, ctx);
    }
    case 'incomingCancel': {
      const team = event.mci?.logistics?.incoming.find((t) => t.id === action.id);
      const w = fromLogistics(cancelIncoming(event, action.id, now));
      return andNote(event, w, `Incoming staff cancelled: ${team?.name ?? 'team'}`, {}, ctx);
    }
    case 'equipmentGive': {
      const w = fromLogistics(giveEquipment(event, { item: action.item, unit: action.unit, by: actor.unitName, exact: action.exact }, now, newId ? `eq_${newId()}` : undefined));
      return andNote(event, w, `Equipment: ${action.item.trim()} given to ${action.unit.trim()}`, {}, ctx);
    }
    case 'equipmentReturn': {
      const w = fromLogistics(takeBackEquipment(event, action.name, now));
      return andNote(event, w, `Equipment: ${action.name} returned`, {}, ctx);
    }
    case 'hospitalAdd': {
      const w = fromLogistics(addHospital(event, action.name, now, newId ? `hospital-${newId()}` : undefined));
      return andNote(event, w, `Hospital added: ${action.name.trim()}`, {}, ctx);
    }
    case 'hospitalUpdate': {
      const name = event.mci?.logistics?.hospitals?.find((h) => h.id === action.id)?.name ?? 'hospital';
      const w = fromLogistics(updateHospital(event, action.id, { capacity: action.capacity, sent: action.sent }));
      const said = [action.capacity !== undefined ? `capacity ${action.capacity ?? 'cleared'}` : '', action.sent !== undefined ? `sent ${action.sent}` : ''].filter(Boolean).join(', ');
      return andNote(event, w, `${name}: ${said}`, {}, ctx);
    }
    case 'hospitalRemove': {
      const name = event.mci?.logistics?.hospitals?.find((h) => h.id === action.id)?.name ?? 'hospital';
      return andNote(event, fromLogistics(removeHospital(event, action.id)), `Hospital removed: ${name}`, {}, ctx);
    }
  }
}
