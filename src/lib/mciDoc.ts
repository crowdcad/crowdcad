import isEqual from 'lodash.isequal';
import type { EquipmentHolder, EquipmentPhase, Event, MciAssignment, MciPatientDetails, MciState } from '@/app/types';
import { custodyOf, materializeEventEquipment } from './equipmentCustody';

/**
 * MCI state outside the event document (#143). On cloud events (Firebase),
 * an MCI's state lives at events/{eventId}/mci/state, so MCI role logins can
 * read it without the event document, which they never may (they would see
 * every call, team and note). Next to it, events/{eventId}/mci/units is a
 * small summary of the units (MciUnitsDoc) for role views, written in the
 * same transaction as the change that causes it, never by a background agent.
 *
 * The dispatch page merges the state back into its event (`withMciDoc`), so
 * everything that reads `event.mci` is unchanged, and its single write path
 * sends the `mci` part of a write to the state document (`splitMciWrite`).
 * Events from before this keep `mci` inline until their first MCI write or
 * the dispatch page copies it across. Lite and PocketBase events keep it inline.
 *
 * Patient details (age, sex, complaint, notes, interventions, transport
 * order: `MciState.patients`) live apart, in events/{eventId}/mci/patients
 * (MciPatientsDoc), so a role that doesn't treat or move patients
 * (Logistics) never reads them (#156). The state document never carries
 * them once written; one from before this keeps them inline until its next
 * write, which moves them.
 *
 * Pure helpers here; reads and writes are in the dispatch page and mciDocStore.ts.
 */

export const MCI_DOC_STATE = 'state';
export const MCI_DOC_UNITS = 'units';
/** The event's map layers (venue layers with MCI shapes), for role views, which can't read the event (#154). */
export const MCI_DOC_MAP = 'map';
/** Patient details, read only by dispatchers and the roles that see patients (#156). */
export const MCI_DOC_PATIENTS = 'patients';
export const mciDocCollection = (eventId: string) => `events/${eventId}/mci`;

/** What a role view needs to know about one unit during an MCI. */
export interface MciUnit {
  /** Staff.id / Supervisor.id, when the unit has one. */
  id?: string;
  name: string;
  kind: 'team' | 'supervisor';
  status: string;
  mciAssignment?: MciAssignment;
  /** Names of the equipment the unit holds. */
  equipment: string[];
}

/** One item of event equipment and who has it, for the Logistics role view (D27). */
export interface MciEquipmentItem {
  name: string;
  /** Unit, post or clinic name. */
  holder: string;
  holderKind: EquipmentHolder['kind'];
  phase: EquipmentPhase;
}

export interface MciUnitsDoc {
  units: MciUnit[];
  /** Every item of event equipment, so Logistics can hand out what no one holds (D27). Absent before D27. */
  equipment?: MciEquipmentItem[];
  updatedAt: number;
}

export interface MciPatientsDoc {
  patients: Record<string, MciPatientDetails>;
  updatedAt: number;
}

/** The MCI state with its patient details: from the patients document, else (older state documents) inline. */
export function mergeMciPatients(state: MciState, doc: MciPatientsDoc | null | undefined): MciState {
  if (!doc) return state;
  const rest = { ...state };
  delete rest.patients;
  return Object.keys(doc.patients ?? {}).length ? { ...rest, patients: doc.patients } : rest;
}

/**
 * The event with its MCI state from the state document (and patient details
 * from the patients document); inline `mci` (older events) when there is none.
 */
export function withMciDoc(event: Event, doc: MciState | null | undefined, patients?: MciPatientsDoc | null): Event {
  return doc ? { ...event, mci: mergeMciPatients(doc, patients) } : event;
}

/** The unit summary for role views. */
export function mciUnitsFor(event: Pick<Event, 'staff' | 'supervisor' | 'eventEquipment'>): MciUnit[] {
  const held = new Map<string, string[]>();
  for (const eq of event.eventEquipment ?? []) {
    if (!eq.location) continue;
    held.set(eq.location, [...(held.get(eq.location) ?? []), eq.name]);
  }
  const unit = (kind: MciUnit['kind']) => (u: { id?: string; team: string; status: string; mciAssignment?: MciAssignment }): MciUnit => ({
    ...(u.id ? { id: u.id } : {}),
    name: u.team,
    kind,
    status: u.status,
    ...(u.mciAssignment ? { mciAssignment: u.mciAssignment } : {}),
    equipment: held.get(u.team) ?? [],
  });
  return [...(event.staff ?? []).map(unit('team')), ...(event.supervisor ?? []).map(unit('supervisor'))];
}

/** The equipment summary for the Logistics role view: the event's items (or the venue catalog, before any is saved). */
export function mciEquipmentFor(event: Pick<Event, 'staff' | 'supervisor' | 'eventEquipment' | 'venue' | 'clinics'>): MciEquipmentItem[] {
  const ctx = { ...event, staff: event.staff ?? [], supervisor: event.supervisor ?? [] };
  return materializeEventEquipment(event, 0).map((eq) => {
    const c = custodyOf(eq, ctx);
    return { name: eq.name, holder: c.holder.name, holderKind: c.holder.kind, phase: c.phase };
  });
}

function sameUnits(a: MciUnit[] | MciEquipmentItem[], b: MciUnit[] | MciEquipmentItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Splits a write to an event (already guarded and cleaned) into what goes to
 * the event document and what goes to the MCI documents:
 * - `event`: every field but `mci`;
 * - `mci`: the new MCI state without patient details, when the write sets one;
 * - `patients`: the patient details, when the write sets an MCI state and they
 *   changed, or the patients document doesn't exist yet (`patientsStored` false:
 *   a new MCI, or an older state document carrying them inline);
 * - `units` and `equipment`: the new unit and equipment summaries, when the
 *   event has an MCI and the write changes what they show (written together).
 * `current` is the event as read, with its MCI state merged in.
 */
export function splitMciWrite(
  current: Event,
  updates: Partial<Event>,
  { patientsStored = true }: { patientsStored?: boolean } = {},
): { event: Partial<Event>; mci?: MciState; patients?: Record<string, MciPatientDetails>; units?: MciUnit[]; equipment?: MciEquipmentItem[] } {
  const { mci, ...event } = updates;
  const next = { ...current, ...updates } as Event;
  const nextMci = mci ?? current.mci;
  let units: MciUnit[] | undefined;
  let equipment: MciEquipmentItem[] | undefined;
  const touchesUnits = 'staff' in updates || 'supervisor' in updates || 'eventEquipment' in updates || mci !== undefined;
  if (nextMci && nextMci.periods.length > 0 && touchesUnits) {
    const after = mciUnitsFor(next);
    const afterEquipment = mciEquipmentFor(next);
    // A new MCI state (declare, stand down, a migrated event) always writes the summary, so it exists.
    if (mci !== undefined || !sameUnits(after, mciUnitsFor(current)) || !sameUnits(afterEquipment, mciEquipmentFor(current))) {
      units = after;
      equipment = afterEquipment;
    }
  }
  let state: MciState | undefined;
  let patients: Record<string, MciPatientDetails> | undefined;
  if (mci !== undefined) {
    const { patients: nextPatients, ...rest } = mci;
    state = rest;
    const after = nextPatients ?? {};
    if (!patientsStored || !isEqual(after, current.mci?.patients ?? {})) patients = after;
  }
  return { event, ...(state ? { mci: state } : {}), ...(patients ? { patients } : {}), ...(units ? { units, equipment } : {}) };
}
