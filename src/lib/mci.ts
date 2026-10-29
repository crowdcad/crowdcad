import type {
  Event,
  Layer,
  MciAssignment,
  MciColor,
  MciLogEntry,
  MciPatientDetails,
  MciState,
  MciTreatmentArea,
  MciZone,
  Staff,
  Supervisor,
  Venue,
  Zone,
} from '@/app/types';
import { getEventClinics, isClinicCallResolved } from '@/lib/clinics';
import { deriveTeamVisualStatus } from '@/lib/statusColors';
import { isGeoLayer } from '@/lib/geo/layers';

// Mass casualty incident (MCI) mode. The log on `event.mci` is the only source
// of counts: every number on screen is derived here, nothing is stored as a
// total, and undo appends a compensating entry instead of removing anything.
// Patients in treatment locations come from the same log (one per patient
// moved or walked in); what is typed about them (age, sex, chief complaint)
// sits in `mci.patients` and never changes a count. No names or tag numbers.

export const MCI_COLORS: readonly MciColor[] = ['red', 'yellow', 'green', 'black'];

/** Team statuses available while an MCI is active (equipment-run statuses are unchanged and not listed). */
export const MCI_UNIT_STATUSES = ['Available', 'Triage', 'Treatment', 'Unavailable'] as const;

/** How many entries the log drawer lists. */
export const MCI_LOG_DRAWER_SIZE = 10;

export type MciCounts = Record<MciColor, number>;

export function emptyCounts(): MciCounts {
  return { red: 0, yellow: 0, green: 0, black: 0 };
}

export function sumCounts(counts: MciCounts): number {
  return MCI_COLORS.reduce((total, color) => total + counts[color], 0);
}

export function emptyMci(): MciState {
  return { active: false, periods: [], zones: [], areas: [], log: [] };
}

/** True while an MCI is declared and not stood down. */
export function isMciActive(event: Pick<Event, 'mci'> | null | undefined): boolean {
  return event?.mci?.active === true;
}

/** True once an MCI has ever been declared on the event: the MCI tab stays (read-only) after stand down. */
export function hasMci(event: Pick<Event, 'mci'> | null | undefined): boolean {
  return !!event?.mci && event.mci.periods.length > 0;
}

/** Same approach as src/lib/teamId.ts. */
export function newMciId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'mci-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface MciWriteContext {
  /** Epoch ms of the entry. */
  now: number;
  /** Auth uid when signed in. */
  by?: string;
  /** Overrides id generation (tests). */
  newId?: () => string;
}

/** What a write helper decided: a patch for `updateEvent`, plus whether it had to shrink the request. */
export interface MciWrite {
  patch: Partial<Event>;
  /** The request was reduced to fit what is in the zone. */
  clamped?: boolean;
  error?: 'inactive' | 'unknown-zone' | 'unknown-area' | 'unknown-patient' | 'invalid' | 'duplicate' | 'cannot-undo';
}

const NO_CHANGE: MciWrite = { patch: {} };

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/** Log entries that count: not themselves undo entries and not undone, in log order. */
function liveEntries(log: readonly MciLogEntry[]): MciLogEntry[] {
  const undone = new Set<string>();
  for (const entry of log) {
    if (entry.kind === 'undo' && entry.undoes) undone.add(entry.undoes);
  }
  return log.filter((entry) => entry.kind !== 'undo' && !undone.has(entry.id));
}

export function undoneIds(log: readonly MciLogEntry[]): Set<string> {
  return new Set(log.filter((e) => e.kind === 'undo' && e.undoes).map((e) => e.undoes as string));
}

export interface MciZoneStats {
  zone: MciZone;
  tagged: MciCounts;
  moved: MciCounts;
  inZone: MciCounts;
  taggedTotal: number;
  movedTotal: number;
  inZoneTotal: number;
  cleared: boolean;
  /** Every time the zone was marked clear (and not undone), oldest first. */
  clearedTimes: number[];
  /** In zone is 0 with patients tagged and the zone not cleared. Only ever a suggestion. */
  suggestClear: boolean;
}

/** One patient in a treatment location, rebuilt from the log on every derive. */
export interface MciPatient {
  /** See `mciPatientId`. */
  id: string;
  /** Where the patient is now, or the location they left from once transported. */
  areaId: string;
  /** Tag color now (a retriage changes it). */
  color: MciColor;
  /** The zone the patient was moved from. Unset for a walk-in. */
  fromZoneId?: string;
  arrivedAt: number;
  /** Set once the patient has left in an ambulance. */
  transportedAt?: number;
  unit?: string;
  destination?: string;
  details: MciPatientDetails;
  /** Transport order among the patients still in this location that have one, 1 first. */
  rank?: number;
}

/** A patient's id: the 'moved' or 'arrived' entry that brought them in, and their place in it. */
export function mciPatientId(entryId: string, index: number): string {
  return `${entryId}:${index}`;
}

export interface MciAreaStats {
  area: MciTreatmentArea;
  /** Current display name (a clinic area follows the clinic's name). */
  name: string;
  /** MCI patients that came in: moved from a zone, walked in or transferred from another location. */
  received: MciCounts;
  receivedTotal: number;
  /** MCI patients that left in an ambulance. */
  transported: MciCounts;
  transportedTotal: number;
  /** MCI patients sent on to another treatment location, by their color when they left. */
  transferredOut: MciCounts;
  transferredOutTotal: number;
  /** The MCI patients here now, by their current color. */
  inTreatment: MciCounts;
  inTreatmentTotal: number;
  /** The patients here now: those with a transport priority first, in that order, then by arrival. */
  patients: MciPatient[];
  /** Unresolved regular clinic patients, 0 for an MCI-only area. */
  regular: number;
  isClinic: boolean;
}

export interface MciTotals {
  tagged: MciCounts;
  taggedTotal: number;
  /** Walk-ins: patients added at a treatment location without passing through a zone. */
  arrived: MciCounts;
  arrivedTotal: number;
  transported: MciCounts;
  transportedTotal: number;
  inZonesTotal: number;
  /** MCI patients in treatment locations now (received minus transported). */
  inTreatmentTotal: number;
  regularTotal: number;
}

export interface MciDerived {
  zones: MciZoneStats[];
  areas: MciAreaStats[];
  totals: MciTotals;
  /** Every patient that reached a treatment location, transported ones included, in arrival order. */
  patients: MciPatient[];
  /** False when a patient entry no longer fits the log (its patient is gone, elsewhere or already left). Undo never leaves the log like this. */
  consistent: boolean;
}

/** Unresolved clinic patients at a clinic area. Calls with no `clinicId` belong to the single or default clinic. */
export function regularClinicCount(event: Pick<Event, 'calls' | 'clinics'>, area: Pick<MciTreatmentArea, 'clinicId'>): number {
  if (!area.clinicId) return 0;
  const clinics = getEventClinics(event.clinics);
  const defaultId = clinics[0]?.id;
  return (event.calls || []).filter(
    (call) => call.clinic && !isClinicCallResolved(call) && (clinics.length <= 1 || (call.clinicId ?? defaultId) === area.clinicId)
  ).length;
}

interface ZoneClearState {
  cleared: boolean;
  clearedAt?: number;
  clearedTimes: number[];
}

function zoneClearStates(mci: MciState): Map<string, ZoneClearState> {
  const states = new Map<string, ZoneClearState>();
  for (const zone of mci.zones) states.set(zone.id, { cleared: false, clearedTimes: [] });
  for (const entry of liveEntries(mci.log)) {
    if (!entry.zoneId) continue;
    const state = states.get(entry.zoneId);
    if (!state) continue;
    if (entry.kind === 'zone_cleared') {
      state.cleared = true;
      state.clearedAt = entry.t;
      state.clearedTimes.push(entry.t);
    } else if (entry.kind === 'zone_reopened') {
      state.cleared = false;
      state.clearedAt = undefined;
    }
  }
  return states;
}

interface MciReplay {
  /** Arrival order. */
  patients: MciPatient[];
  received: Map<string, MciCounts>;
  transported: Map<string, MciCounts>;
  transferredOut: Map<string, MciCounts>;
  arrived: MciCounts;
  consistent: boolean;
}

function bump(map: Map<string, MciCounts>, key: string, color: MciColor, n: number) {
  const counts = map.get(key) ?? emptyCounts();
  counts[color] += n;
  map.set(key, counts);
}

/**
 * Replays the treatment side of the log patient by patient. A move or walk-in of n creates n patients; a
 * reassignment or a per-patient transport must find its patient where the entry says it was. A transport
 * written as a count (black, or an older trip) takes the patients of that color who arrived first.
 */
function replayPatients(mci: MciState, live: readonly MciLogEntry[]): MciReplay {
  const details = mci.patients ?? {};
  const byId = new Map<string, MciPatient>();
  const patients: MciPatient[] = [];
  const received = new Map<string, MciCounts>();
  const transported = new Map<string, MciCounts>();
  const transferredOut = new Map<string, MciCounts>();
  const arrived = emptyCounts();
  let consistent = true;

  const isAt = (p: MciPatient | undefined, areaId: string, color: MciColor): p is MciPatient =>
    !!p && p.transportedAt === undefined && p.areaId === areaId && p.color === color;
  const leave = (p: MciPatient, entry: MciLogEntry) => {
    p.transportedAt = entry.t;
    if (entry.unit) p.unit = entry.unit;
    if (entry.destination) p.destination = entry.destination;
  };

  for (const entry of live) {
    const { areaId, color, n } = entry;
    if (!areaId || !color || !n || n <= 0) continue;
    if (entry.kind === 'moved' || entry.kind === 'arrived') {
      for (let i = 0; i < n; i += 1) {
        const id = mciPatientId(entry.id, i);
        const patient: MciPatient = {
          id,
          areaId,
          color,
          ...(entry.kind === 'moved' && entry.zoneId ? { fromZoneId: entry.zoneId } : {}),
          arrivedAt: entry.t,
          details: details[id] ?? {},
        };
        byId.set(id, patient);
        patients.push(patient);
      }
      bump(received, areaId, color, n);
      if (entry.kind === 'arrived') arrived[color] += n;
    } else if (entry.kind === 'reassigned') {
      const p = entry.patientId ? byId.get(entry.patientId) : undefined;
      if (!isAt(p, areaId, color)) {
        consistent = false;
        continue;
      }
      const toArea = entry.toAreaId ?? p.areaId;
      const toColor = entry.toColor ?? p.color;
      if (toArea !== p.areaId) {
        bump(transferredOut, p.areaId, p.color, 1);
        bump(received, toArea, toColor, 1);
      }
      p.areaId = toArea;
      p.color = toColor;
    } else if (entry.kind === 'transported') {
      if (entry.patientId) {
        const p = byId.get(entry.patientId);
        if (!isAt(p, areaId, color)) {
          consistent = false;
          continue;
        }
        leave(p, entry);
        bump(transported, areaId, color, 1);
      } else {
        const waiting = patients.filter((p) => isAt(p, areaId, color)).slice(0, n);
        if (waiting.length < n) consistent = false;
        for (const p of waiting) leave(p, entry);
        bump(transported, areaId, color, waiting.length);
      }
    }
  }

  // Ranks: the patients still in each location that have a priority, in priority order.
  const queues = new Map<string, MciPatient[]>();
  for (const p of patients) {
    if (p.transportedAt !== undefined || typeof p.details.priority !== 'number') continue;
    queues.set(p.areaId, [...(queues.get(p.areaId) ?? []), p]);
  }
  for (const queue of queues.values()) {
    queue.sort((a, b) => (a.details.priority as number) - (b.details.priority as number) || a.arrivedAt - b.arrivedAt);
    queue.forEach((p, i) => {
      p.rank = i + 1;
    });
  }

  return { patients, received, transported, transferredOut, arrived, consistent };
}

/** Ranked patients first, in rank order, then the rest by arrival. */
function byRankThenArrival(a: MciPatient, b: MciPatient): number {
  if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank;
  if (a.rank !== undefined) return -1;
  if (b.rank !== undefined) return 1;
  return a.arrivedAt - b.arrivedAt;
}

export function deriveMci(event: Pick<Event, 'mci' | 'calls' | 'clinics'>): MciDerived {
  const mci = event.mci ?? emptyMci();
  const live = liveEntries(mci.log);
  const clearStates = zoneClearStates(mci);

  const zones: MciZoneStats[] = mci.zones.map((zone) => {
    const tagged = emptyCounts();
    const moved = emptyCounts();
    for (const entry of live) {
      if (entry.zoneId !== zone.id || !entry.color || !entry.n) continue;
      if (entry.kind === 'tagged') tagged[entry.color] += entry.n;
      else if (entry.kind === 'moved') moved[entry.color] += entry.n;
    }
    const inZone = emptyCounts();
    for (const color of MCI_COLORS) inZone[color] = tagged[color] - moved[color];
    const state = clearStates.get(zone.id) ?? { cleared: false, clearedTimes: [] };
    const taggedTotal = sumCounts(tagged);
    const inZoneTotal = sumCounts(inZone);
    return {
      zone,
      tagged,
      moved,
      inZone,
      taggedTotal,
      movedTotal: sumCounts(moved),
      inZoneTotal,
      cleared: state.cleared,
      clearedTimes: state.clearedTimes,
      suggestClear: !state.cleared && taggedTotal > 0 && inZoneTotal === 0,
    };
  });

  const replay = replayPatients(mci, live);
  const clinics = getEventClinics(event.clinics);
  const areas: MciAreaStats[] = mci.areas.map((area) => {
    const received = { ...(replay.received.get(area.id) ?? emptyCounts()) };
    const transported = { ...(replay.transported.get(area.id) ?? emptyCounts()) };
    const transferredOut = { ...(replay.transferredOut.get(area.id) ?? emptyCounts()) };
    const patients = replay.patients.filter((p) => p.areaId === area.id && p.transportedAt === undefined).sort(byRankThenArrival);
    const inTreatment = emptyCounts();
    for (const p of patients) inTreatment[p.color] += 1;
    const clinicName = area.clinicId ? clinics.find((c) => c.id === area.clinicId)?.name : undefined;
    return {
      area,
      name: clinicName ?? area.name,
      received,
      receivedTotal: sumCounts(received),
      transported,
      transportedTotal: sumCounts(transported),
      transferredOut,
      transferredOutTotal: sumCounts(transferredOut),
      inTreatment,
      inTreatmentTotal: sumCounts(inTreatment),
      patients,
      regular: regularClinicCount(event, area),
      isClinic: !!area.clinicId,
    };
  });

  const tagged = emptyCounts();
  for (const stats of zones) for (const color of MCI_COLORS) tagged[color] += stats.tagged[color];
  const transported = emptyCounts();
  for (const stats of areas) for (const color of MCI_COLORS) transported[color] += stats.transported[color];

  return {
    zones,
    areas,
    totals: {
      tagged,
      taggedTotal: sumCounts(tagged),
      arrived: replay.arrived,
      arrivedTotal: sumCounts(replay.arrived),
      transported,
      transportedTotal: sumCounts(transported),
      inZonesTotal: zones.reduce((n, z) => n + z.inZoneTotal, 0),
      inTreatmentTotal: areas.reduce((n, a) => n + a.inTreatmentTotal, 0),
      regularTotal: areas.reduce((n, a) => n + a.regular, 0),
    },
    patients: replay.patients,
    consistent: replay.consistent,
  };
}

export interface MciSeriesPoint {
  t: number;
  inZones: number;
  inTreatment: number;
  /** Patients that have left in an ambulance so far. */
  transported: number;
}

/**
 * Patients in zones, in treatment and transported so far after each counted entry, for the summary
 * chart. Undone entries are left out entirely, as if they were never entered.
 * The first point is the start of the first period.
 */
export function mciSeries(mci: MciState | undefined): MciSeriesPoint[] {
  if (!mci || mci.periods.length === 0) return [];
  let inZones = 0;
  let inTreatment = 0;
  let transported = 0;
  const points: MciSeriesPoint[] = [{ t: mci.periods[0].startedAt, inZones, inTreatment, transported }];
  for (const entry of liveEntries(mci.log)) {
    if (!entry.n) continue;
    if (entry.kind === 'tagged' && entry.zoneId) inZones += entry.n;
    else if (entry.kind === 'arrived') inTreatment += entry.n;
    else if (entry.kind === 'moved' && entry.zoneId) {
      inZones -= entry.n;
      inTreatment += entry.n;
    } else if (entry.kind === 'transported') {
      inTreatment -= entry.n;
      transported += entry.n;
    } else continue;
    points.push({ t: entry.t, inZones, inTreatment, transported });
  }
  // Hold the last values to the end of a finished MCI so the chart shows the whole period.
  const endedAt = mci.periods[mci.periods.length - 1].endedAt;
  if (endedAt !== undefined && endedAt > points[points.length - 1].t) points.push({ t: endedAt, inZones, inTreatment, transported });
  return points;
}

// ---------------------------------------------------------------------------
// Writes. Each returns a patch for `updateEvent`; call them inside the
// functional form so they see the transaction's event, never React state.
// ---------------------------------------------------------------------------

function makeEntry(ctx: MciWriteContext, entry: Omit<MciLogEntry, 'id' | 't' | 'by'>): MciLogEntry {
  return { id: (ctx.newId ?? newMciId)(), t: ctx.now, ...(ctx.by ? { by: ctx.by } : {}), ...entry };
}

/** Appends entries and keeps each zone's `clearedAt` in step with the log. */
export function appendMciEntries(mci: MciState | undefined, entries: MciLogEntry[]): MciState {
  const base = mci ?? emptyMci();
  const next: MciState = { ...base, log: [...base.log, ...entries] };
  const states = zoneClearStates(next);
  return {
    ...next,
    zones: next.zones.map((zone) => {
      const clearedAt = states.get(zone.id)?.clearedAt;
      const { clearedAt: _previous, ...rest } = zone;
      void _previous;
      return clearedAt === undefined ? rest : { ...rest, clearedAt };
    }),
  };
}

const lowerTrim = (name: string) => name.trim().toLowerCase();

/** True if `name` matches an existing name, ignoring case and surrounding spaces. */
export function isDuplicateMciName(existing: readonly { name: string }[], name: string): boolean {
  const wanted = lowerTrim(name);
  return existing.some((item) => lowerTrim(item.name) === wanted);
}

export interface DeclareMciInput {
  zones: MciZone[];
  areas: MciTreatmentArea[];
  /** Show patient boxes in treatment locations. Left unset, a re-declare keeps the earlier choice. */
  trackPatients?: boolean;
}

/** Starts an MCI period. Declaring again keeps existing zones, areas and log and appends a period. */
export function declareMci(
  event: Pick<Event, 'mci' | 'manualSurgeActive' | 'surgeLog'>,
  input: DeclareMciInput,
  now: number
): Partial<Event> {
  const base = event.mci ?? emptyMci();
  const zones = [...base.zones];
  for (const zone of input.zones) {
    if (zones.some((z) => z.id === zone.id) || isDuplicateMciName(zones, zone.name)) continue;
    zones.push(zone);
  }
  const areas = [...base.areas];
  for (const area of input.areas) {
    if (areas.some((a) => a.id === area.id) || isDuplicateMciName(areas, area.name)) continue;
    areas.push(area);
  }
  const hasOpenPeriod = base.periods.length > 0 && base.periods[base.periods.length - 1].endedAt === undefined;
  // An MCI replaces a surge: close any open surge period so its time is kept in the surge log.
  const surgeLog = event.surgeLog || [];
  const surgeEnd: Partial<Event> = event.manualSurgeActive
    ? {
        manualSurgeActive: false,
        manualSurgeStartedAt: undefined,
        surgeLog: surgeLog.map((period, i) => (i === surgeLog.length - 1 && period.endedAt === undefined ? { ...period, endedAt: now } : period)),
      }
    : {};
  return {
    ...surgeEnd,
    mci: {
      ...base,
      active: true,
      periods: hasOpenPeriod ? base.periods : [...base.periods, { startedAt: now }],
      zones,
      areas,
      ...(input.trackPatients !== undefined ? { trackPatients: input.trackPatients } : {}),
    },
  };
}

const MCI_STATUS_SET = new Set<string>(['Triage', 'Treatment', 'Unavailable']);

function hhmm(ms: number): string {
  const d = new Date(ms);
  return d.getHours().toString().padStart(2, '0') + d.getMinutes().toString().padStart(2, '0');
}

/**
 * Closes the period, clears every unit's MCI assignment and returns units in
 * Triage, Treatment or Unavailable to Available. The data stays on the event.
 * On a standard event a unit whose Location was set by its assignment goes back
 * to its post; on a TAK event Location is never touched (D66).
 */
export function standDownMci(event: Event, now: number): Partial<Event> {
  const base = event.mci ?? emptyMci();
  const periods = base.periods.map((period, i) =>
    i === base.periods.length - 1 && period.endedAt === undefined ? { ...period, endedAt: now } : period
  );
  const tak = event.mapMode === 'tak';

  const reset = <T extends Staff | Supervisor>(unit: T): T => {
    const wasMci = MCI_STATUS_SET.has(unit.status);
    if (!wasMci && !unit.mciAssignment) return unit;
    const { mciAssignment: assigned, ...rest } = unit;
    const next = { ...rest } as T;
    if (!wasMci) return next;
    next.status = 'Available';
    const targetName = assigned ? mciAssignmentName(base, assigned) : undefined;
    const restore = unit.originalPost || event.pendingAssignments?.[unit.team]?.post;
    if (!tak && restore && targetName && unit.location === targetName) next.location = restore;
    next.log = [...(unit.log || []), { timestamp: now, message: `${hhmm(now)} - status changed to Available (MCI stand down)` }];
    return next;
  };

  return {
    mci: { ...base, active: false, periods },
    staff: (event.staff || []).map(reset),
    supervisor: (event.supervisor || []).map(reset),
  };
}

export function addMciZone(event: Pick<Event, 'mci'>, zone: { name: string; venueZoneId?: string }, ctx: MciWriteContext): MciWrite {
  const mci = event.mci;
  const name = zone.name.trim();
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  if (!name) return { patch: {}, error: 'invalid' };
  if (isDuplicateMciName(mci.zones, name)) return { patch: {}, error: 'duplicate' };
  const id = zone.venueZoneId ?? `mci-zone-${(ctx.newId ?? newMciId)()}`;
  if (mci.zones.some((z) => z.id === id)) return { patch: {}, error: 'duplicate' };
  const added: MciZone = { id, name, ...(zone.venueZoneId ? { venueZoneId: zone.venueZoneId } : {}) };
  return { patch: { mci: { ...mci, zones: [...mci.zones, added] } } };
}

export function addMciArea(event: Pick<Event, 'mci'>, area: { name: string; clinicId?: string }, ctx: MciWriteContext): MciWrite {
  const mci = event.mci;
  const name = area.name.trim();
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  if (!name) return { patch: {}, error: 'invalid' };
  if (isDuplicateMciName(mci.areas, name)) return { patch: {}, error: 'duplicate' };
  const id = area.clinicId ?? `mci-area-${(ctx.newId ?? newMciId)()}`;
  if (mci.areas.some((a) => a.id === id)) return { patch: {}, error: 'duplicate' };
  const added: MciTreatmentArea = { id, name, ...(area.clinicId ? { clinicId: area.clinicId } : {}) };
  return { patch: { mci: { ...mci, areas: [...mci.areas, added] } } };
}

function zoneStatsOf(event: Pick<Event, 'mci' | 'calls' | 'clinics'>, zoneId: string): MciZoneStats | undefined {
  return deriveMci(event).zones.find((z) => z.zone.id === zoneId);
}

/** Adds (or, when `delta` is negative, removes) found patients of one color. A removal is clamped to what is in the zone. Tagging into a cleared zone reopens it. */
export function tagPatch(event: Pick<Event, 'mci' | 'calls' | 'clinics'>, zoneId: string, color: MciColor, delta: number, ctx: MciWriteContext): MciWrite {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  const stats = zoneStatsOf(event, zoneId);
  if (!stats) return { patch: {}, error: 'unknown-zone' };
  if (!Number.isInteger(delta) || delta === 0) return NO_CHANGE;

  let n = delta;
  let clamped = false;
  if (delta < 0) {
    n = -Math.min(-delta, stats.inZone[color]);
    clamped = n !== delta;
    if (n === 0) return { patch: {}, clamped, error: 'invalid' };
  }

  const entries: MciLogEntry[] = [];
  if (n > 0 && stats.cleared) entries.push(makeEntry(ctx, { kind: 'zone_reopened', zoneId }));
  entries.push(makeEntry(ctx, { kind: 'tagged', zoneId, color, n }));
  return { patch: { mci: appendMciEntries(event.mci, entries) }, ...(clamped ? { clamped } : {}) };
}

/** Sets the Tagged total for one color, written as a single delta entry. Never goes below what was already moved. */
export function setTaggedTotalPatch(event: Pick<Event, 'mci' | 'calls' | 'clinics'>, zoneId: string, color: MciColor, total: number, ctx: MciWriteContext): MciWrite {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  const stats = zoneStatsOf(event, zoneId);
  if (!stats) return { patch: {}, error: 'unknown-zone' };
  if (!Number.isInteger(total) || total < 0) return { patch: {}, error: 'invalid' };
  return tagPatch(event, zoneId, color, total - stats.tagged[color], ctx);
}

/** Moves patients from a zone to a treatment location. Each color is clamped to what is in the zone. */
export function movePatch(
  event: Pick<Event, 'mci' | 'calls' | 'clinics'>,
  zoneId: string,
  areaId: string,
  counts: Partial<MciCounts>,
  ctx: MciWriteContext
): MciWrite {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  const stats = zoneStatsOf(event, zoneId);
  if (!stats) return { patch: {}, error: 'unknown-zone' };
  if (!event.mci.areas.some((a) => a.id === areaId)) return { patch: {}, error: 'unknown-area' };

  const entries: MciLogEntry[] = [];
  let clamped = false;
  for (const color of MCI_COLORS) {
    const asked = Math.floor(counts[color] ?? 0);
    if (asked <= 0) continue;
    const n = Math.min(asked, stats.inZone[color]);
    if (n < asked) clamped = true;
    if (n > 0) entries.push(makeEntry(ctx, { kind: 'moved', zoneId, areaId, color, n }));
  }
  if (entries.length === 0) return { patch: {}, clamped, error: 'invalid' };
  return { patch: { mci: appendMciEntries(event.mci, entries) }, ...(clamped ? { clamped } : {}) };
}

const MAX_UNIT_LENGTH = 40;
const MAX_DESTINATION_LENGTH = 80;

/** The distinct ambulance numbers used so far (live entries), oldest first, for the dialog's suggestions. */
export function mciTransportUnits(mci: MciState | undefined): string[] {
  if (!mci) return [];
  const seen: string[] = [];
  for (const entry of liveEntries(mci.log)) {
    if (entry.kind === 'transported' && entry.unit && !seen.includes(entry.unit)) seen.push(entry.unit);
  }
  return seen;
}

/** Collapses spaces and trims to `max` characters. */
const tidy = (text: string, max: number) => text.trim().replace(/\s+/g, ' ').slice(0, max);

/**
 * Sends patients off site from a treatment location in an ambulance. Named patients (`patientIds`) leave as
 * one entry each; `counts` take the patients of each color who arrived first. Each is clamped to who is in
 * that location; the ambulance number is required. All entries share the unit and destination, so a single
 * ambulance trip is one write.
 */
export function transportPatch(
  event: Pick<Event, 'mci' | 'calls' | 'clinics'>,
  areaId: string,
  counts: Partial<MciCounts>,
  trip: { unit: string; destination?: string },
  ctx: MciWriteContext,
  patientIds: readonly string[] = []
): MciWrite {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  const stats = deriveMci(event).areas.find((a) => a.area.id === areaId);
  if (!stats) return { patch: {}, error: 'unknown-area' };
  const unit = tidy(trip.unit, MAX_UNIT_LENGTH);
  if (!unit) return { patch: {}, error: 'invalid' };
  const destination = trip.destination ? tidy(trip.destination, MAX_DESTINATION_LENGTH) : '';
  const tripFields = { unit, ...(destination ? { destination } : {}) };

  const entries: MciLogEntry[] = [];
  let clamped = false;
  const left = { ...stats.inTreatment };
  for (const id of new Set(patientIds)) {
    const patient = stats.patients.find((p) => p.id === id);
    if (!patient) {
      clamped = true;
      continue;
    }
    left[patient.color] -= 1;
    entries.push(makeEntry(ctx, { kind: 'transported', areaId, color: patient.color, n: 1, patientId: id, ...tripFields }));
  }
  for (const color of MCI_COLORS) {
    const asked = Math.floor(counts[color] ?? 0);
    if (asked <= 0) continue;
    const n = Math.min(asked, left[color]);
    if (n < asked) clamped = true;
    if (n > 0) entries.push(makeEntry(ctx, { kind: 'transported', areaId, color, n, ...tripFields }));
  }
  if (entries.length === 0) return { patch: {}, clamped, error: 'invalid' };
  return { patch: { mci: appendMciEntries(event.mci, entries) }, ...(clamped ? { clamped } : {}) };
}

// ---------------------------------------------------------------------------
// Patients in treatment locations
// ---------------------------------------------------------------------------

const MAX_AGE_LENGTH = 5;
const MAX_COMPLAINT_LENGTH = 40;
const MAX_TEAM_LENGTH = 40;
const MAX_NOTE_LENGTH = 120;

/** A patient still in a treatment location, with the derive it came from. */
function patientInTreatment(event: Pick<Event, 'mci' | 'calls' | 'clinics'>, patientId: string) {
  const derived = deriveMci(event);
  const patient = derived.patients.find((p) => p.id === patientId && p.transportedAt === undefined);
  return { derived, patient };
}

/** Returns `patients` with one patient's details replaced, dropping the key when nothing is left. */
function withDetails(patients: Record<string, MciPatientDetails>, id: string, details: MciPatientDetails): Record<string, MciPatientDetails> {
  const next = { ...patients };
  if (Object.keys(details).length === 0) delete next[id];
  else next[id] = details;
  return next;
}

function withoutPriority(details: MciPatientDetails | undefined): MciPatientDetails {
  const { priority: _dropped, ...rest } = details ?? {};
  void _dropped;
  return rest;
}

/** Walk-ins: patients who reached a treatment location without passing through a zone. */
export function arrivePatch(event: Pick<Event, 'mci' | 'calls' | 'clinics'>, areaId: string, color: MciColor, n: number, ctx: MciWriteContext): MciWrite {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  if (!event.mci.areas.some((a) => a.id === areaId)) return { patch: {}, error: 'unknown-area' };
  if (!Number.isInteger(n) || n <= 0) return { patch: {}, error: 'invalid' };
  return { patch: { mci: appendMciEntries(event.mci, [makeEntry(ctx, { kind: 'arrived', areaId, color, n })]) } };
}

/**
 * Retriages a patient (a new color), sends them to another treatment location, or both, with an optional
 * note. A patient who changes location loses their transport priority, which belonged to the old one.
 */
export function reassignPatientPatch(
  event: Pick<Event, 'mci' | 'calls' | 'clinics'>,
  patientId: string,
  target: { areaId?: string; color?: MciColor },
  note: string | undefined,
  ctx: MciWriteContext
): MciWrite {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  const { patient } = patientInTreatment(event, patientId);
  if (!patient) return { patch: {}, error: 'unknown-patient' };
  const toAreaId = target.areaId && target.areaId !== patient.areaId ? target.areaId : undefined;
  if (toAreaId && !mci.areas.some((a) => a.id === toAreaId)) return { patch: {}, error: 'unknown-area' };
  const toColor = target.color && target.color !== patient.color ? target.color : undefined;
  if (!toAreaId && !toColor) return NO_CHANGE;
  const text = note ? tidy(note, MAX_NOTE_LENGTH) : '';

  const entry = makeEntry(ctx, {
    kind: 'reassigned',
    areaId: patient.areaId,
    color: patient.color,
    n: 1,
    patientId,
    ...(toColor ? { toColor } : {}),
    ...(toAreaId ? { toAreaId } : {}),
    ...(text ? { note: text } : {}),
  });
  const next = appendMciEntries(mci, [entry]);
  if (toAreaId && mci.patients?.[patientId]?.priority !== undefined) {
    next.patients = withDetails(mci.patients ?? {}, patientId, withoutPriority(mci.patients?.[patientId]));
  }
  return { patch: { mci: next } };
}

/** One patient leaves in an ambulance. The ambulance number and destination are optional here, so one tap is enough. */
export function transportPatientPatch(
  event: Pick<Event, 'mci' | 'calls' | 'clinics'>,
  patientId: string,
  trip: { unit?: string; destination?: string },
  ctx: MciWriteContext
): MciWrite {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  const { patient } = patientInTreatment(event, patientId);
  if (!patient) return { patch: {}, error: 'unknown-patient' };
  const unit = trip.unit ? tidy(trip.unit, MAX_UNIT_LENGTH) : '';
  const destination = trip.destination ? tidy(trip.destination, MAX_DESTINATION_LENGTH) : '';
  const entry = makeEntry(ctx, {
    kind: 'transported',
    areaId: patient.areaId,
    color: patient.color,
    n: 1,
    patientId,
    ...(unit ? { unit } : {}),
    ...(destination ? { destination } : {}),
  });
  return { patch: { mci: appendMciEntries(event.mci, [entry]) } };
}

export type MciPatientField = 'age' | 'sex' | 'complaint' | 'team';

export const MCI_PATIENT_FIELDS: readonly MciPatientField[] = ['age', 'sex', 'complaint', 'team'];

/** What a typed value is stored as: age up to 5 characters, sex one capital letter, complaint and team trimmed. */
export function normalizePatientField(field: MciPatientField, raw: string): string {
  switch (field) {
    case 'age':
      return tidy(raw, MAX_AGE_LENGTH);
    case 'sex':
      return (raw.trim().match(/[a-z]/i)?.[0] ?? '').toUpperCase();
    case 'complaint':
      return tidy(raw, MAX_COMPLAINT_LENGTH);
    case 'team':
      return tidy(raw, MAX_TEAM_LENGTH);
  }
}

/** Saves typed details for a patient (in treatment or already transported). An empty value clears that field. */
export function setPatientDetailsPatch(
  event: Pick<Event, 'mci' | 'calls' | 'clinics'>,
  patientId: string,
  fields: Partial<Record<MciPatientField, string>>
): MciWrite {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  if (!deriveMci(event).patients.some((p) => p.id === patientId)) return { patch: {}, error: 'unknown-patient' };
  const current = mci.patients?.[patientId] ?? {};
  const next: MciPatientDetails = { ...current };
  for (const field of MCI_PATIENT_FIELDS) {
    if (fields[field] === undefined) continue;
    const value = normalizePatientField(field, fields[field] as string);
    if (value) next[field] = value;
    else delete next[field];
  }
  if (MCI_PATIENT_FIELDS.every((f) => next[f] === current[f])) return NO_CHANGE;
  return { patch: { mci: { ...mci, patients: withDetails(mci.patients ?? {}, patientId, next) } } };
}

/**
 * Puts a patient at `rank` in their location's transport order (1 first), moving whoever held that place and
 * everyone after down one; `null` takes them out of the order. The order is renumbered 1, 2, 3 in the same
 * write. Ranks are derived, so a transport moves everyone after it up one with no write at all.
 */
export function setPatientPriorityPatch(event: Pick<Event, 'mci' | 'calls' | 'clinics'>, patientId: string, rank: number | null): MciWrite {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  const { derived, patient } = patientInTreatment(event, patientId);
  if (!patient) return { patch: {}, error: 'unknown-patient' };
  if (rank !== null && (!Number.isInteger(rank) || rank < 1)) return { patch: {}, error: 'invalid' };
  if (rank === null ? patient.rank === undefined : rank === patient.rank) return NO_CHANGE;

  const area = derived.areas.find((a) => a.area.id === patient.areaId);
  const queue = (area?.patients ?? []).filter((p) => p.rank !== undefined && p.id !== patientId);
  if (rank !== null) queue.splice(Math.min(rank - 1, queue.length), 0, patient);

  let patients = mci.patients ?? {};
  if (rank === null) patients = withDetails(patients, patientId, withoutPriority(patients[patientId]));
  queue.forEach((p, i) => {
    patients = withDetails(patients, p.id, { ...(patients[p.id] ?? {}), priority: i + 1 });
  });
  return { patch: { mci: { ...mci, patients } } };
}

/** "34 M chest pain", or '' when nothing has been typed. */
export function mciPatientLabel(details: MciPatientDetails | undefined): string {
  if (!details) return '';
  return [details.age, details.sex, details.complaint].filter(Boolean).join(' ');
}

/** Where a zone's quick move sends a patient: the treatment location last moved to from this zone, else the first. */
export function mciQuickMoveArea(mci: MciState | undefined, zoneId: string): string | undefined {
  if (!mci || mci.areas.length === 0) return undefined;
  const live = liveEntries(mci.log);
  for (let i = live.length - 1; i >= 0; i -= 1) {
    const entry = live[i];
    if (entry.kind === 'moved' && entry.zoneId === zoneId && mci.areas.some((a) => a.id === entry.areaId)) return entry.areaId;
  }
  return mci.areas[0].id;
}

/** Turns the patient boxes on or off. Counts and the log are unaffected. */
export function setTrackPatientsPatch(event: Pick<Event, 'mci'>, on: boolean): MciWrite {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  if (!!mci.trackPatients === on) return NO_CHANGE;
  return { patch: { mci: { ...mci, trackPatients: on } } };
}

export function clearZonePatch(event: Pick<Event, 'mci' | 'calls' | 'clinics'>, zoneId: string, ctx: MciWriteContext): MciWrite {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  const stats = zoneStatsOf(event, zoneId);
  if (!stats) return { patch: {}, error: 'unknown-zone' };
  if (stats.cleared) return NO_CHANGE;
  return { patch: { mci: appendMciEntries(event.mci, [makeEntry(ctx, { kind: 'zone_cleared', zoneId })]) } };
}

export function reopenZonePatch(event: Pick<Event, 'mci' | 'calls' | 'clinics'>, zoneId: string, ctx: MciWriteContext): MciWrite {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  const stats = zoneStatsOf(event, zoneId);
  if (!stats) return { patch: {}, error: 'unknown-zone' };
  if (!stats.cleared) return NO_CHANGE;
  return { patch: { mci: appendMciEntries(event.mci, [makeEntry(ctx, { kind: 'zone_reopened', zoneId })]) } };
}

/** The entries the log drawer lists: newest first, with whether each can still be undone. */
export function mciRecentEntries(mci: MciState | undefined, limit = MCI_LOG_DRAWER_SIZE): { entry: MciLogEntry; undone: boolean }[] {
  if (!mci) return [];
  const undone = undoneIds(mci.log);
  return [...mci.log].reverse().slice(0, limit).map((entry) => ({ entry, undone: undone.has(entry.id) }));
}

/**
 * Appends a compensating entry. Refused when the entry is gone already, when undoing it would leave a zone
 * with negative patients, or when a later entry depends on it (a patient who was since retriaged, moved on
 * or transported: undo that first).
 */
export function undoPatch(event: Pick<Event, 'mci' | 'calls' | 'clinics'>, entryId: string, ctx: MciWriteContext): MciWrite {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  const target = mci.log.find((e) => e.id === entryId);
  if (!target || target.kind === 'undo' || undoneIds(mci.log).has(entryId)) return { patch: {}, error: 'cannot-undo' };

  const next = appendMciEntries(mci, [makeEntry(ctx, { kind: 'undo', undoes: entryId })]);
  const after = deriveMci({ ...event, mci: next });
  // Undoing a tag or a move must not leave a zone below zero, or leave a later patient entry without its patient.
  const valid = after.consistent && after.zones.every((z) => MCI_COLORS.every((c) => z.inZone[c] >= 0));
  if (!valid) return { patch: {}, error: 'cannot-undo' };
  return { patch: { mci: next } };
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

/** Which kind of target a status needs: Triage a zone, Treatment a treatment location. */
export function mciAssignmentKindFor(status: string): MciAssignment['kind'] | null {
  if (status === 'Triage') return 'zone';
  if (status === 'Treatment') return 'area';
  return null;
}

export function mciAssignmentName(mci: MciState | undefined, assignment: MciAssignment | undefined): string | undefined {
  if (!mci || !assignment) return undefined;
  return (assignment.kind === 'zone' ? mci.zones : mci.areas).find((x) => x.id === assignment.id)?.name;
}

/**
 * The status menu for a unit that is not on a call or an equipment run while an
 * MCI is active. A leftover status from before the declaration (On Break, In
 * Clinic) stays visible so the select is never blank.
 */
export function mciStatusOptions(unit: Pick<Staff, 'status'>): string[] {
  const options: string[] = [...MCI_UNIT_STATUSES];
  if (unit.status && !options.includes(unit.status) && ['On Break', 'In Clinic'].includes(unit.status)) options.push(unit.status);
  return options;
}

export interface MciAssignmentPatch {
  patch: Pick<Partial<Staff>, 'mciAssignment' | 'location'>;
  /** Team log text, without the time prefix. */
  logMessage?: string;
}

/**
 * What picking (or clearing) an assignment does to a unit. Status comes from
 * the assignment the dispatcher picks, never from a location (D66, D68), and on
 * a TAK event Location is where the unit is, so MCI code never writes it (D66).
 */
export function mciAssignmentPatch(
  event: Pick<Event, 'mci' | 'mapMode'>,
  assignment: MciAssignment | null
): MciAssignmentPatch {
  if (!assignment) return { patch: { mciAssignment: undefined } };
  const name = mciAssignmentName(event.mci, assignment);
  if (!name) return { patch: { mciAssignment: undefined } };
  if (event.mapMode === 'tak') {
    return { patch: { mciAssignment: assignment }, logMessage: `MCI assignment set to ${name}` };
  }
  return { patch: { mciAssignment: assignment, location: name }, logMessage: `Post changed to ${name} (MCI)` };
}

/**
 * What a status change does to a unit's MCI assignment. Triage and Treatment
 * take the picked zone or treatment location (or keep a matching one the unit
 * already has); Available and Unavailable clear it; any other status (a call's
 * En Route, an equipment run) leaves it alone.
 */
export function mciStatusPatch(
  event: Pick<Event, 'mci' | 'mapMode'>,
  unit: Pick<Staff, 'mciAssignment'>,
  newStatus: string,
  assignment?: MciAssignment
): MciAssignmentPatch {
  const kind = mciAssignmentKindFor(newStatus);
  if (kind) {
    const chosen = assignment?.kind === kind ? assignment : unit.mciAssignment?.kind === kind ? unit.mciAssignment : null;
    return chosen ? mciAssignmentPatch(event, chosen) : { patch: {} };
  }
  if (newStatus === 'Available' || newStatus === 'Unavailable') return mciAssignmentPatch(event, null);
  return { patch: {} };
}

/** Names of the units working at a zone or treatment location right now. */
export function mciUnitsAt(event: Event, assignment: MciAssignment): string[] {
  const wanted = assignment.kind === 'zone' ? 'Triage' : 'Treatment';
  const units: (Staff | Supervisor)[] = [...(event.staff || []), ...(event.supervisor || [])];
  return units
    .filter((u) => u.mciAssignment?.kind === assignment.kind && u.mciAssignment.id === assignment.id)
    // A unit sent to a normal call is on that call, whatever its stored status says.
    .filter((u) => deriveTeamVisualStatus(u.status, event, u.team) === wanted)
    .map((u) => u.team);
}

export interface MciAvailability {
  available: number;
  triage: number;
  treatment: number;
  unavailable: number;
}

/** The availability strip's MCI buckets: a unit on a call, on break or in the clinic counts as Unavailable. */
export function mciAvailability(event: Event): MciAvailability {
  const result: MciAvailability = { available: 0, triage: 0, treatment: 0, unavailable: 0 };
  for (const unit of event.staff || []) {
    const status = deriveTeamVisualStatus(unit.status, event, unit.team);
    if (status === 'Available') result.available += 1;
    else if (status === 'Triage') result.triage += 1;
    else if (status === 'Treatment') result.treatment += 1;
    else result.unavailable += 1;
  }
  return result;
}

const csvQuote = (text: string) => `"${text.replace(/"/g, '""')}"`;

/**
 * MCI rows for the summary CSV, in time order: period start and end rows (like
 * Surge) and one row per log entry, undone entries and undo entries included.
 * Format: `MCI,<zone or area>,<timestamp>,"<kind> <color> <n> ..."`.
 */
export function mciCsvLines(event: Pick<Event, 'mci'>, formatTimestamp: (ms: number) => string): string[] {
  const mci = event.mci;
  if (!mci) return [];
  const zoneName = (id?: string) => mci.zones.find((z) => z.id === id)?.name;
  const areaName = (id?: string) => mci.areas.find((a) => a.id === id)?.name;
  const describe = (entry: MciLogEntry): string => {
    const area = entry.areaId ? areaName(entry.areaId) ?? entry.areaId : undefined;
    const label = mciPatientLabel(entry.patientId ? mci.patients?.[entry.patientId] : undefined);
    return [
      entry.kind,
      entry.color,
      entry.n !== undefined ? String(entry.n) : undefined,
      label ? `(${label})` : undefined,
      area ? `${entry.kind === 'transported' || entry.kind === 'reassigned' ? 'from' : 'to'} ${area}` : undefined,
      entry.toColor ? `as ${entry.toColor}` : undefined,
      entry.toAreaId ? `to ${areaName(entry.toAreaId) ?? entry.toAreaId}` : undefined,
      entry.unit ? `by ${entry.unit}` : undefined,
      entry.destination ? `to ${entry.destination}` : undefined,
      entry.note ? `note: ${entry.note}` : undefined,
    ]
      .filter(Boolean)
      .join(' ');
  };
  const rows: { t: number; order: number; line: string }[] = [];
  mci.periods.forEach((period, i) => {
    rows.push({ t: period.startedAt, order: -1, line: `MCI,-,${formatTimestamp(period.startedAt)},${csvQuote('MCI declared')}` });
    if (period.endedAt !== undefined) {
      const minutes = Math.round((period.endedAt - period.startedAt) / 60000);
      rows.push({ t: period.endedAt, order: 1e9 + i, line: `MCI,-,${formatTimestamp(period.endedAt)},${csvQuote(`MCI stood down (active for ${minutes} min)`)}` });
    }
  });
  mci.log.forEach((entry, i) => {
    // An undo row names the zone of the entry it reverses.
    const target = entry.kind === 'undo' ? mci.log.find((e) => e.id === entry.undoes) : undefined;
    const scopeEntry = target ?? entry;
    const scope = zoneName(scopeEntry.zoneId) ?? (scopeEntry.kind !== 'moved' ? areaName(scopeEntry.areaId) : undefined) ?? '-';
    const text = entry.kind === 'undo' && target ? `undo ${describe(target)}` : describe(entry);
    rows.push({ t: entry.t, order: i, line: `MCI,${scope},${formatTimestamp(entry.t)},${csvQuote(text)}` });
  });
  return rows.sort((a, b) => a.t - b.t || a.order - b.order).map((r) => r.line);
}

// ---------------------------------------------------------------------------
// Map shapes. A zone or treatment area can be drawn on the venue map. The
// shape is an ordinary zone on the event's copy of the venue layers, so the
// map shows it like any other, and the MCI item keeps its id in `venueZoneId`.
// ---------------------------------------------------------------------------

const MCI_ZONE_COLOR = '#ef4444';
const MCI_AREA_COLOR = '#3b82f6';

export interface MciShape {
  layerId: string;
  /** Percent-of-image vertices (an image layer). */
  points: { x: number; y: number }[];
  /** Real coordinates (a live-map layer). */
  coords?: { lat: number; lng: number }[];
}

/** The layers a shape can be drawn on: those with a map image or a live map. Empty when the event has no map. */
export function mciMapLayers(venue: Pick<Venue, 'layers'> | undefined | null): Layer[] {
  return (venue?.layers || []).filter((layer) => !!layer.mapUrl || isGeoLayer(layer));
}

/** The id an item's map shape is stored under: the venue zone it came from, else its own id. */
export function mciShapeId(item: { id: string; venueZoneId?: string }): string {
  return item.venueZoneId ?? item.id;
}

/** The drawn shape of a zone or treatment area, with the layer it is on. */
export function mciShapeOf(
  venue: Pick<Venue, 'layers'> | undefined | null,
  item: { id: string; venueZoneId?: string }
): { layer: Layer; zone: Zone } | undefined {
  const shapeId = mciShapeId(item);
  for (const layer of venue?.layers || []) {
    const zone = (layer.zones || []).find((z) => z.id === shapeId);
    if (zone && (zone.points.length >= 3 || (zone.coords?.length ?? 0) >= 3)) return { layer, zone };
  }
  return undefined;
}

/**
 * Stores a drawn shape for a zone or treatment area on a layer of the event's
 * venue, replacing any earlier shape (on any layer) so a redraw moves it.
 * Allowed after stand down too, so the record's map can be tidied.
 */
export function mciShapePatch(event: Pick<Event, 'venue' | 'mci'>, target: { kind: 'zone' | 'area'; id: string }, shape: MciShape): MciWrite {
  const mci = event.mci;
  const layers = event.venue?.layers;
  if (!mci || !layers) return { patch: {}, error: 'invalid' };
  const item = (target.kind === 'zone' ? mci.zones : mci.areas).find((x) => x.id === target.id);
  if (!item) return { patch: {}, error: target.kind === 'zone' ? 'unknown-zone' : 'unknown-area' };
  if (!layers.some((l) => l.id === shape.layerId)) return { patch: {}, error: 'invalid' };
  if (shape.points.length < 3 && (shape.coords?.length ?? 0) < 3) return { patch: {}, error: 'invalid' };

  const shapeId = mciShapeId(item);
  const previous = layers.flatMap((l) => l.zones || []).find((z) => z.id === shapeId);
  const zone: Zone = {
    id: shapeId,
    name: item.name,
    color: previous?.color ?? (target.kind === 'zone' ? MCI_ZONE_COLOR : MCI_AREA_COLOR),
    points: shape.points,
    ...(shape.coords ? { coords: shape.coords } : {}),
    ...(previous?.isDispatchZone ? { isDispatchZone: true } : {}),
  };
  const nextLayers = layers.map((layer) => {
    const others = (layer.zones || []).filter((z) => z.id !== shapeId);
    if (layer.id === shape.layerId) return { ...layer, zones: [...others, zone] };
    return layer.zones ? { ...layer, zones: others } : layer;
  });
  const link = <T extends { id: string; venueZoneId?: string }>(list: T[]): T[] =>
    list.map((x) => (x.id === item.id && !x.venueZoneId ? { ...x, venueZoneId: shapeId } : x));
  return {
    patch: {
      venue: { ...event.venue, layers: nextLayers },
      mci: { ...mci, zones: target.kind === 'zone' ? link(mci.zones) : mci.zones, areas: target.kind === 'area' ? link(mci.areas) : mci.areas },
    },
  };
}

export interface MciTransportTrip {
  t: number;
  unit: string;
  destination?: string;
  /** Patients by tag color on this trip. */
  counts: MciCounts;
  total: number;
}

/**
 * The ambulance trips that left a treatment location, newest first. Entries written together (same time and
 * ambulance) are one trip; undone entries are left out.
 */
export function mciTransportTrips(mci: MciState | undefined, areaId: string): MciTransportTrip[] {
  if (!mci) return [];
  const trips = new Map<string, MciTransportTrip>();
  for (const entry of liveEntries(mci.log)) {
    if (entry.kind !== 'transported' || entry.areaId !== areaId || !entry.color || !entry.n) continue;
    const key = `${entry.t}|${entry.unit ?? ''}|${entry.destination ?? ''}`;
    const trip = trips.get(key) ?? { t: entry.t, unit: entry.unit ?? '', ...(entry.destination ? { destination: entry.destination } : {}), counts: emptyCounts(), total: 0 };
    trip.counts[entry.color] += entry.n;
    trip.total += entry.n;
    trips.set(key, trip);
  }
  return [...trips.values()].sort((a, b) => b.t - a.t);
}
