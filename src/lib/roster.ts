import type { Event } from '@/app/types';
import { dbService } from '@/lib/services';

/**
 * The organization's staff roster (the Roster page, admins only): people who staff events, used to fill in
 * team members during event setup. No photos. `eventsStaffed` goes up once per event a person is on when the
 * event is saved (`staffedEventIds` remembers which), and admins can correct it by hand.
 */
export interface RosterPerson {
  id: string;
  name: string;
  /** Licensure or certification, e.g. "EMT", "Paramedic". */
  licensure?: string;
  eventsStaffed?: number;
  /** Events already counted in `eventsStaffed`. */
  staffedEventIds?: string[];
  region?: string;
  email?: string;
  phone?: string;
  notes?: string;
  updatedAt?: number;
}

export type RosterFields = Omit<RosterPerson, 'id' | 'staffedEventIds' | 'updatedAt'>;

export const ROSTER_COLLECTION = 'roster';

const LIMITS: Record<keyof Omit<RosterFields, 'eventsStaffed'>, number> = { name: 80, licensure: 40, region: 80, email: 120, phone: 40, notes: 1000 };

/** Trimmed, length-capped fields; empty optional fields dropped. */
export function cleanRosterFields(input: RosterFields): RosterFields {
  const out: RosterFields = { name: input.name.trim().replace(/\s+/g, ' ').slice(0, LIMITS.name) };
  for (const key of ['licensure', 'region', 'email', 'phone', 'notes'] as const) {
    const v = (input[key] ?? '').trim().slice(0, LIMITS[key]);
    if (v) out[key] = v;
  }
  const n = Math.floor(Number(input.eventsStaffed ?? 0));
  out.eventsStaffed = Number.isFinite(n) && n > 0 ? n : 0;
  return out;
}

/** A stored member string ("Jane Doe [EMT] (Lead)") as a plain name. */
export function memberName(member: string): string {
  return member.replace(/\s*\(Lead\)\s*$/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

/** Everyone named on an event's teams and supervisor units. */
export function staffedNames(event: Partial<Pick<Event, 'staff' | 'supervisor'>>): string[] {
  const names = [...(event.staff ?? []).flatMap((t) => t.members ?? []), ...(event.supervisor ?? []).map((s) => s.member ?? '')].map(memberName);
  return [...new Set(names.filter(Boolean))];
}

const norm = (s: string) => s.trim().toLowerCase();

/** The roster person with this name (case-insensitive), if exactly one. */
export function findRosterPerson(roster: RosterPerson[], name: string): RosterPerson | undefined {
  const hits = roster.filter((p) => norm(p.name) === norm(name));
  return hits.length === 1 ? hits[0] : undefined;
}

/** The count updates for people on this event who haven't been counted for it yet. */
export function staffedUpdates(roster: RosterPerson[], eventId: string, names: string[]): { id: string; eventsStaffed: number; staffedEventIds: string[] }[] {
  const out: { id: string; eventsStaffed: number; staffedEventIds: string[] }[] = [];
  for (const name of names) {
    const p = findRosterPerson(roster, name);
    if (!p || (p.staffedEventIds ?? []).includes(eventId) || out.some((u) => u.id === p.id)) continue;
    // Keep the most recent events only: enough to stop an edited event counting twice.
    out.push({ id: p.id, eventsStaffed: (p.eventsStaffed ?? 0) + 1, staffedEventIds: [...(p.staffedEventIds ?? []), eventId].slice(-200) });
  }
  return out;
}

export async function listRoster(): Promise<RosterPerson[]> {
  const docs = await dbService.getCollection<Omit<RosterPerson, 'id'>>(ROSTER_COLLECTION);
  return docs
    .filter((d) => d.exists && d.data)
    .map((d) => ({ ...(d.data as Omit<RosterPerson, 'id'>), id: d.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveRosterPerson(id: string | null, fields: RosterFields): Promise<void> {
  const data = { ...cleanRosterFields(fields), updatedAt: Date.now() };
  if (id) await dbService.updateDocument(ROSTER_COLLECTION, id, data as Record<string, unknown>);
  else await dbService.addDocument(ROSTER_COLLECTION, { ...data, staffedEventIds: [] });
}

export async function deleteRosterPerson(id: string): Promise<void> {
  await dbService.deleteDocument(ROSTER_COLLECTION, id);
}

/** Counts this event for these people where they are on the roster (once per event). Admins only; quiet on failure. */
export async function recordStaffed(eventId: string, names: string[]): Promise<void> {
  if (!names.length) return;
  try {
    const updates = staffedUpdates(await listRoster(), eventId, names);
    await Promise.all(updates.map(({ id, ...data }) => dbService.updateDocument(ROSTER_COLLECTION, id, data)));
  } catch (err) {
    console.error('Roster: could not update events staffed', err);
  }
}
