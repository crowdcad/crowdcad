import type { Event, EventEquipment, IncomingEta, IncomingTeam, MciHospital, MciLogistics, MciState, Staff, Supervisor } from '@/app/types';
import { deriveMci, emptyCounts, MCI_COLORS, sumCounts, type MciCounts } from './mci';
import { newTeamId } from '@/lib/teamId';
import { RESOLVED_CALL_STATUSES } from '@/lib/clinics';
import { changedFleet, custodyOf, fleetOf, materializeEventEquipment, moveEquipment, returnEquipment, unitNames } from './equipmentCustody';

/**
 * The MCI Logistics tab (#139): staff reported on their way ("incoming"),
 * tracked until they arrive and become a team. Pure functions returning the
 * event patch for the dispatch page's functional updateEvent, like src/lib/mci.ts.
 * Equipment issued to teams is ordinary event equipment (src/lib/equipmentCustody.ts).
 */

export const ETA_STATUS_LABELS: Record<Exclude<IncomingEta['kind'], 'time'>, string> = {
  pending: 'Pending',
  en_route: 'En route',
  attempted: 'Attempted contact',
};

const TIME_RE = /^([01]?\d|2[0-3]):?([0-5]\d)$/;

/** "0930", "9:30" or "09:30" as "09:30"; null if it isn't a time. */
export function normalizeEtaTime(input: string): string | null {
  const m = TIME_RE.exec(input.trim());
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : null;
}

export function etaLabel(eta: IncomingEta): string {
  return eta.kind === 'time' ? eta.time : ETA_STATUS_LABELS[eta.kind];
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/**
 * Whether a clock-time ETA has passed. Times up to 12 hours behind now count
 * as passed; anything further back is taken as tomorrow (an event running past midnight).
 */
export function isOverdue(eta: IncomingEta, now: Date): boolean {
  if (eta.kind !== 'time') return false;
  const diff = now.getHours() * 60 + now.getMinutes() - minutesOf(eta.time);
  return diff > 0 && diff <= 12 * 60;
}

/** Incoming teams in the order to show: clock times soonest first, then en route, pending, attempted contact. */
export function sortIncoming(teams: IncomingTeam[], now: Date): IncomingTeam[] {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const rank = (t: IncomingTeam): number => {
    if (t.eta.kind === 'time') {
      // Minutes from now, overdue ones (up to 12 hours back) first.
      let d = minutesOf(t.eta.time) - nowMin;
      if (d < -12 * 60) d += 24 * 60;
      return d;
    }
    return { en_route: 10_000, pending: 20_000, attempted: 30_000 }[t.eta.kind];
  };
  return [...teams].sort((a, b) => rank(a) - rank(b) || a.reportedAt - b.reportedAt);
}

function logisticsOf(mci: MciState): MciLogistics {
  return mci.logistics ?? { incoming: [] };
}

function withIncoming(mci: MciState, incoming: IncomingTeam[]): Partial<Event> {
  return { mci: { ...mci, logistics: { ...logisticsOf(mci), incoming } } };
}

/** Still on the list: on its way, or (from before D27) reported arrived by the Logistics role and waiting for the dispatcher. */
export function isOpenIncoming(t: IncomingTeam): boolean {
  return t.state === 'incoming' || t.state === 'reported';
}

export type LogisticsResult = { patch: Partial<Event>; error?: 'inactive' | 'invalid' | 'duplicate' | 'missing' | 'busy' | 'no-team' };

function nameTaken(event: Pick<Event, 'staff' | 'supervisor' | 'mci'>, name: string, exceptId?: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    (event.staff ?? []).some((s) => s.team.trim().toLowerCase() === n) ||
    (event.supervisor ?? []).some((s) => s.team.trim().toLowerCase() === n) ||
    (event.mci?.logistics?.incoming ?? []).some((t) => isOpenIncoming(t) && t.id !== exceptId && t.name.trim().toLowerCase() === n)
  );
}

/** Adds a team reported on its way. */
export function addIncoming(
  event: Pick<Event, 'mci' | 'staff' | 'supervisor'>,
  input: { name: string; members?: string[]; eta?: IncomingEta; notes?: string; reportedBy?: string },
  now: number,
  id = `incoming-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
): LogisticsResult {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  const name = input.name.trim();
  if (!name) return { patch: {}, error: 'invalid' };
  if (nameTaken(event, name)) return { patch: {}, error: 'duplicate' };
  const team: IncomingTeam = {
    id,
    name,
    members: (input.members ?? []).map((m) => m.trim()).filter(Boolean),
    eta: input.eta ?? { kind: 'pending' },
    notes: input.notes?.trim() ?? '',
    reportedAt: now,
    state: 'incoming',
    ...(input.reportedBy ? { reportedBy: input.reportedBy } : {}),
  };
  return { patch: withIncoming(mci, [...logisticsOf(mci).incoming, team]) };
}

/** Changes an incoming team's name, members, ETA or notes. */
export function updateIncoming(
  event: Pick<Event, 'mci' | 'staff' | 'supervisor'>,
  id: string,
  changes: Partial<Pick<IncomingTeam, 'name' | 'members' | 'eta' | 'notes'>>,
): LogisticsResult {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  const list = logisticsOf(mci).incoming;
  const current = list.find((t) => t.id === id && isOpenIncoming(t));
  if (!current) return { patch: {}, error: 'missing' };
  if (changes.name !== undefined) {
    if (!changes.name.trim()) return { patch: {}, error: 'invalid' };
    if (nameTaken(event, changes.name, id)) return { patch: {}, error: 'duplicate' };
  }
  const next: IncomingTeam = { ...current, ...changes, ...(changes.name !== undefined ? { name: changes.name.trim() } : {}) };
  return { patch: withIncoming(mci, list.map((t) => (t.id === id ? next : t))) };
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return d.getHours().toString().padStart(2, '0') + d.getMinutes().toString().padStart(2, '0');
}

/** The team arrived: it becomes a team on the board (Available) and leaves the incoming list. */
export function arriveIncoming(event: Pick<Event, 'mci' | 'staff' | 'supervisor'>, id: string, now: number): LogisticsResult {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  const list = logisticsOf(mci).incoming;
  const team = list.find((t) => t.id === id && isOpenIncoming(t));
  if (!team) return { patch: {}, error: 'missing' };
  if ((event.staff ?? []).some((s) => s.team.trim().toLowerCase() === team.name.toLowerCase())) return { patch: {}, error: 'duplicate' };
  const teamId = newTeamId();
  const staff: Staff = {
    id: teamId,
    team: team.name,
    members: team.members,
    status: 'Available',
    location: '',
    statusSince: now,
    log: [{ timestamp: now, message: `${hhmm(now)} - arrived (MCI logistics)${team.notes ? `: ${team.notes}` : ''}` }],
  };
  return {
    patch: {
      ...withIncoming(mci, list.map((t) => (t.id === id ? { ...t, state: 'arrived' as const, closedAt: now, teamId } : t))),
      staff: [...(event.staff ?? []), staff],
    },
  };
}

/** The team isn't coming after all. Kept, marked cancelled, for the summary. */
export function cancelIncoming(event: Pick<Event, 'mci'>, id: string, now: number): LogisticsResult {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  const list = logisticsOf(mci).incoming;
  if (!list.some((t) => t.id === id && isOpenIncoming(t))) return { patch: {}, error: 'missing' };
  return { patch: withIncoming(mci, list.map((t) => (t.id === id ? { ...t, state: 'cancelled' as const, closedAt: now } : t))) };
}

/**
 * Undoes an arrival or a cancellation pressed by mistake (D28): the row goes back on the incoming list. An
 * arrival also takes its team off the board, but only while that team is still as the arrival left it
 * (Available, on no call, holding nothing, with no MCI assignment): otherwise 'busy'.
 */
export function undoIncoming(event: Pick<Event, 'mci' | 'staff' | 'supervisor' | 'calls' | 'eventEquipment'>, id: string): LogisticsResult {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  const list = logisticsOf(mci).incoming;
  const row = list.find((t) => t.id === id);
  if (!row || (row.state !== 'arrived' && row.state !== 'cancelled')) return { patch: {}, error: 'missing' };
  const reopened: IncomingTeam = { ...row, state: 'incoming' };
  delete reopened.closedAt;
  delete reopened.teamId;
  const restOpen = list.some((t) => t.id !== id && isOpenIncoming(t) && sameName(t.name, row.name));
  if (restOpen) return { patch: {}, error: 'duplicate' };
  const patch = withIncoming(mci, list.map((t) => (t.id === id ? reopened : t)));
  if (row.state === 'cancelled') {
    if (nameTaken(event, row.name, id)) return { patch: {}, error: 'duplicate' };
    return { patch };
  }
  const staff = event.staff ?? [];
  const team = staff.find((s) => (row.teamId ? s.id === row.teamId : sameName(s.team, row.name)));
  if (!team) return { patch };
  const onCall = (event.calls ?? []).some((c) => !RESOLVED_CALL_STATUSES.includes(c.status) && (c.assignedTeam ?? []).includes(team.team));
  const holds = (event.eventEquipment ?? []).some((eq) => eq.location === team.team || eq.assignedTeam === team.team);
  if (team.status !== 'Available' || onCall || holds || team.mciAssignment) return { patch: {}, error: 'busy' };
  return { patch: { ...patch, staff: staff.filter((s) => s !== team) } };
}

// ---------------------------------------------------------------------------
// Equipment: Logistics hands items to teams itself (D27); the dispatcher sees
// them on the team at once. Items are ordinary event equipment
// (src/lib/equipmentCustody.ts).
// ---------------------------------------------------------------------------

/** Kinds of item offered when handing equipment to a team; "Other" types a name. */
export const LOGISTICS_ITEMS = ['Trauma bag', 'Triage bag', 'Wheelchair', 'Gurney', 'AED', 'Oxygen'] as const;

const MAX_ITEM_NAME = 60;

/**
 * Hands an item to a unit. `item` is an equipment name or a kind ("Trauma bag"): an item of that name, or a
 * numbered one ("Trauma bag 2"), that no unit holds is handed over; with none free, a new event item is made
 * ("Trauma bag", else "Trauma bag 2", ...) and handed over. With `exact`, `item` names one item, handed over
 * from wherever it is. The unit's log notes it.
 */
export function giveEquipment(
  event: Pick<Event, 'mci' | 'staff' | 'supervisor' | 'eventEquipment' | 'venue' | 'clinics'>,
  input: { item: string; unit: string; by?: string; exact?: boolean },
  now: number,
  id = `eq_${now}_${Math.random().toString(36).slice(2, 8)}`,
): LogisticsResult {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  const item = input.item.trim().replace(/\s+/g, ' ').slice(0, MAX_ITEM_NAME);
  const unit = input.unit.trim();
  if (!item || !unit) return { patch: {}, error: 'invalid' };
  if (!unitNames(event).has(unit)) return { patch: {}, error: 'no-team' };
  const ctx = { ...event, staff: event.staff ?? [], supervisor: event.supervisor ?? [] };
  let equipment = materializeEventEquipment(event, now);
  const lower = item.toLowerCase();
  const sameKind = (eq: EventEquipment) => {
    const n = eq.name.trim().toLowerCase();
    return n === lower || (n.startsWith(lower) && /^\s*#?\d+$/.test(n.slice(lower.length)));
  };
  const held = (eq: EventEquipment) => {
    const c = custodyOf(eq, ctx);
    return c.holder.kind === 'team' || c.phase === 'retrieving';
  };
  // `exact`: that very item, wherever it is (a transfer from one team to another).
  let target = input.exact ? equipment.find((eq) => eq.name === input.item) : equipment.find((eq) => sameKind(eq) && !held(eq));
  if (input.exact && !target) return { patch: {}, error: 'missing' };
  if (!target) {
    const taken = new Set(equipment.map((eq) => eq.name.trim().toLowerCase()));
    let name = item;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${item} ${n}`;
    target = { id, name, status: 'Available', location: 'Staging', defaultLocation: 'Staging', assignedTeam: null, notes: 'Added by logistics during the MCI' };
    equipment = [...equipment, target];
  }
  const before = fleetOf({ ...event, eventEquipment: equipment });
  const after = moveEquipment(before, ctx, target.name, unit, now);
  const by = input.by ? ` by ${input.by}` : '';
  const note = <T extends Staff | Supervisor>(u: T): T =>
    u.team === unit ? { ...u, log: [...(u.log ?? []), { timestamp: now, message: `${hhmm(now)} - given ${target.name} (logistics${by})` }] } : u;
  const staff = after.staff.map(note);
  const supervisor = after.supervisor.map(note);
  const changed = changedFleet(fleetOf(event), { eventEquipment: after.eventEquipment, staff, supervisor });
  // A materialized catalog is always written, so the item list doesn't fall back to the venue's.
  return { patch: { ...changed, eventEquipment: after.eventEquipment } };
}

/** Takes an item back from whoever has it, to its staging location. */
export function takeBackEquipment(event: Pick<Event, 'mci' | 'staff' | 'supervisor' | 'eventEquipment' | 'venue' | 'clinics'>, name: string, now: number): LogisticsResult {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  const ctx = { ...event, staff: event.staff ?? [], supervisor: event.supervisor ?? [] };
  const equipment = materializeEventEquipment(event, now);
  if (!equipment.some((eq) => eq.name === name)) return { patch: {}, error: 'missing' };
  const before = fleetOf({ ...event, eventEquipment: equipment });
  const after = returnEquipment(before, ctx, name, now, 'dispatcher');
  return { patch: { ...changedFleet(fleetOf(event), after), eventEquipment: after.eventEquipment } };
}

const csvQuote = (text: string) => `"${text.replace(/"/g, '""')}"`;

/**
 * Lines for the summary's CSV export, in its "Type,Entity,Time,Detail" shape:
 * when each team was reported (with members, ETA and notes), and when it
 * arrived or was cancelled. In time order.
 */
export function logisticsCsvLines(event: Pick<Event, 'mci'>, formatTime: (ms: number) => string): string[] {
  const rows: { t: number; line: string }[] = [];
  for (const team of event.mci?.logistics?.incoming ?? []) {
    const entity = csvQuote(team.name);
    const detail = [
      `reported on the way, ETA ${etaLabel(team.eta)}`,
      team.members.length ? `members: ${team.members.join('; ')}` : '',
      team.notes ? `notes: ${team.notes}` : '',
    ].filter(Boolean).join(', ');
    rows.push({ t: team.reportedAt, line: `Logistics,${entity},${formatTime(team.reportedAt)},${csvQuote(detail)}` });
    if (team.closedAt) {
      rows.push({ t: team.closedAt, line: `Logistics,${entity},${formatTime(team.closedAt)},${csvQuote(team.state === 'arrived' ? 'arrived' : 'cancelled')}` });
    }
  }
  return rows.sort((a, b) => a.t - b.t).map((r) => r.line);
}

// ---------------------------------------------------------------------------
// Hospitals: where patients are sent. Logistics adds them by name and types
// each one's capacity; the number sent and its colors are counted from the
// transports whose destination is the hospital's name.
// ---------------------------------------------------------------------------

const MAX_HOSPITAL_NAME = 60;

function withHospitals(mci: MciState, hospitals: MciHospital[]): Partial<Event> {
  return { mci: { ...mci, logistics: { ...logisticsOf(mci), hospitals } } };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Patients sent to each hospital in the current MCI, by color, keyed by hospital id. */
export function hospitalSentCounts(mci: MciState | undefined): Map<string, MciCounts> {
  const out = new Map<string, MciCounts>();
  const hospitals = mci?.logistics?.hospitals ?? [];
  if (!mci || hospitals.length === 0) return out;
  for (const h of hospitals) out.set(h.id, emptyCounts());
  const derived = deriveMci({ mci, calls: [], clinics: [] });
  for (const area of [...derived.areas, ...derived.retiredAreas]) {
    for (const trip of area.trips) {
      const h = trip.destination ? hospitals.find((x) => sameName(x.name, trip.destination!)) : undefined;
      if (!h) continue;
      const counts = out.get(h.id)!;
      for (const color of MCI_COLORS) counts[color] += trip.counts[color];
    }
  }
  return out;
}

/** What a hospital box shows as Sent: the counted transports plus any correction typed in. */
export function hospitalSentTotal(hospital: MciHospital, counted: MciCounts | undefined): number {
  return Math.max(0, sumCounts(counted ?? emptyCounts()) + (hospital.sentAdjust ?? 0));
}

export function addHospital(event: Pick<Event, 'mci'>, name: string, now: number, id = `hospital-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`): LogisticsResult {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, MAX_HOSPITAL_NAME);
  if (!clean) return { patch: {}, error: 'invalid' };
  const list = logisticsOf(mci).hospitals ?? [];
  if (list.some((h) => sameName(h.name, clean))) return { patch: {}, error: 'duplicate' };
  return { patch: withHospitals(mci, [...list, { id, name: clean }]) };
}

/**
 * Sets a hospital's capacity (`null` clears it) or what it shows as Sent. Typing Sent stores the difference
 * from the counted transports, so later transports still add to it.
 */
export function updateHospital(event: Pick<Event, 'mci'>, id: string, changes: { capacity?: number | null; sent?: number }): LogisticsResult {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  const list = logisticsOf(mci).hospitals ?? [];
  const current = list.find((h) => h.id === id);
  if (!current) return { patch: {}, error: 'missing' };
  const valid = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100000;
  const next: MciHospital = { ...current };
  if (changes.capacity !== undefined) {
    if (changes.capacity === null) delete next.capacity;
    else if (!valid(changes.capacity)) return { patch: {}, error: 'invalid' };
    else next.capacity = changes.capacity;
  }
  if (changes.sent !== undefined) {
    if (!valid(changes.sent)) return { patch: {}, error: 'invalid' };
    const counted = sumCounts(hospitalSentCounts(mci).get(id) ?? emptyCounts());
    const adjust = changes.sent - counted;
    if (adjust) next.sentAdjust = adjust;
    else delete next.sentAdjust;
  }
  return { patch: withHospitals(mci, list.map((h) => (h.id === id ? next : h))) };
}

export function removeHospital(event: Pick<Event, 'mci'>, id: string): LogisticsResult {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  const list = logisticsOf(mci).hospitals ?? [];
  if (!list.some((h) => h.id === id)) return { patch: {}, error: 'missing' };
  return { patch: withHospitals(mci, list.filter((h) => h.id !== id)) };
}
