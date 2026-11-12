import type { Event, MciAssignment, MciState } from '@/app/types';

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
 * Pure helpers here; reads and writes are in the dispatch page and mciDocStore.ts.
 */

export const MCI_DOC_STATE = 'state';
export const MCI_DOC_UNITS = 'units';
/** The event's map layers (venue layers with MCI shapes), for role views, which can't read the event (#154). */
export const MCI_DOC_MAP = 'map';
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

export interface MciUnitsDoc {
  units: MciUnit[];
  updatedAt: number;
}

/** The event with its MCI state from the state document; inline `mci` (older events) when there is none. */
export function withMciDoc(event: Event, doc: MciState | null | undefined): Event {
  return doc ? { ...event, mci: doc } : event;
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

function sameUnits(a: MciUnit[], b: MciUnit[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Splits a write to an event (already guarded and cleaned) into what goes to
 * the event document and what goes to the MCI documents:
 * - `event`: every field but `mci`;
 * - `mci`: the new MCI state, when the write sets one;
 * - `units`: the new unit summary, when the event has an MCI and the write
 *   changes what the summary shows.
 * `current` is the event as read, with its MCI state merged in.
 */
export function splitMciWrite(
  current: Event,
  updates: Partial<Event>,
): { event: Partial<Event>; mci?: MciState; units?: MciUnit[] } {
  const { mci, ...event } = updates;
  const next = { ...current, ...updates } as Event;
  const nextMci = mci ?? current.mci;
  let units: MciUnit[] | undefined;
  const touchesUnits = 'staff' in updates || 'supervisor' in updates || 'eventEquipment' in updates || mci !== undefined;
  if (nextMci && nextMci.periods.length > 0 && touchesUnits) {
    const after = mciUnitsFor(next);
    // A new MCI state (declare, stand down, a migrated event) always writes the summary, so it exists.
    if (mci !== undefined || !sameUnits(after, mciUnitsFor(current))) units = after;
  }
  return { event, ...(mci !== undefined ? { mci } : {}), ...(units ? { units } : {}) };
}
