import type {
  Event,
  Layer,
  MciAssignment,
  MciColor,
  MciEarlier,
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
import { teamVisualStatusResolver } from '@/lib/statusColors';
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
  /** The unit and role of a role login making the change (#152); stamped on every entry. */
  byUnit?: string;
  byRole?: string;
  /** One id shared by the entries of one submission. */
  batch?: string;
  /** Overrides id generation (tests). */
  newId?: () => string;
}

/** What a write helper decided: a patch for `updateEvent`, plus whether it had to shrink the request. */
export interface MciWrite {
  patch: Partial<Event>;
  /** The request was reduced to fit what is in the zone. */
  clamped?: boolean;
  error?: 'inactive' | 'unknown-zone' | 'unknown-area' | 'unknown-patient' | 'invalid' | 'duplicate' | 'cannot-undo' | 'wrong-color' | 'no-area';
}

const NO_CHANGE: MciWrite = { patch: {} };

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export function undoneIds(log: readonly MciLogEntry[]): Set<string> {
  const undone = new Set<string>();
  for (const entry of log) {
    if (entry.kind === 'undo' && entry.undoes) undone.add(entry.undoes);
  }
  return undone;
}

/**
 * The current MCI's part of the log: the entries after the last archived MCI (see `mciRecords`). The log is
 * append-only and keeps every MCI the event has had.
 */
export function currentLog(mci: Pick<MciState, 'log' | 'earlier'>): MciLogEntry[] {
  const since = mci.earlier?.length ? mci.earlier[mci.earlier.length - 1].until : undefined;
  return since === undefined ? mci.log : mci.log.filter((entry) => entry.t >= since);
}

/**
 * Every MCI on the event, oldest first, each as its own state (inactive for archived ones) with only its
 * part of the log. An event that never started an entirely new MCI has one.
 */
export function mciRecords(mci: MciState | undefined): MciState[] {
  if (!mci) return [];
  const records: MciState[] = [];
  let from = -Infinity;
  for (const e of mci.earlier ?? []) {
    const until = e.until;
    const start = from;
    records.push({
      active: false,
      periods: e.periods,
      zones: e.zones,
      areas: e.areas,
      ...(e.retiredZones ? { retiredZones: e.retiredZones } : {}),
      ...(e.retiredAreas ? { retiredAreas: e.retiredAreas } : {}),
      log: mci.log.filter((entry) => entry.t >= start && entry.t < until),
      ...(mci.patients ? { patients: mci.patients } : {}),
      ...(mci.trackPatients !== undefined ? { trackPatients: mci.trackPatients } : {}),
    });
    from = until;
  }
  const { earlier: _earlier, ...current } = mci;
  void _earlier;
  records.push({ ...current, log: currentLog(mci) });
  return records;
}

/** Zones including those unticked on a re-declare, for naming log entries. */
export function mciAllZones(mci: Pick<MciState, 'zones' | 'retiredZones'>): MciZone[] {
  return [...mci.zones, ...(mci.retiredZones ?? [])];
}

/** Treatment locations including those unticked on a re-declare, for naming log entries. */
export function mciAllAreas(mci: Pick<MciState, 'areas' | 'retiredAreas'>): MciTreatmentArea[] {
  return [...mci.areas, ...(mci.retiredAreas ?? [])];
}

/** Whether a treatment location takes patients of a color: a tarp takes only its own color, anywhere else takes any. */
export function mciAreaAccepts(area: Pick<MciTreatmentArea, 'color'>, color: MciColor): boolean {
  return !area.color || area.color === color;
}

/**
 * Where a patient of `color` goes: `preferredAreaId` if it takes that color, else the color's tarp, else the
 * first location that takes any color. Undefined when nowhere takes it.
 */
export function mciRouteArea<A extends Pick<MciTreatmentArea, 'id' | 'color'>>(mci: { areas: readonly A[] } | undefined, color: MciColor, preferredAreaId?: string): A | undefined {
  if (!mci) return undefined;
  const preferred = preferredAreaId ? mci.areas.find((a) => a.id === preferredAreaId) : undefined;
  if (preferred && mciAreaAccepts(preferred, color)) return preferred;
  return mci.areas.find((a) => a.color === color) ?? mci.areas.find((a) => !a.color);
}

/** Log entries that count: not themselves undo entries and not undone, in log order. */
function liveEntries(log: readonly MciLogEntry[]): MciLogEntry[] {
  const undone = undoneIds(log);
  return log.filter((entry) => entry.kind !== 'undo' && !undone.has(entry.id));
}

function addCounts(into: MciCounts, from: MciCounts) {
  for (const color of MCI_COLORS) into[color] += from[color];
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
  /** In a tarp of another color (re-tagged with no tarp of the new color to go to): they should be moved. */
  misplaced?: boolean;
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
  /** Ambulance trips that left from here, newest first (see `mciTransportTrips`). */
  trips: MciTransportTrip[];
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
  /** Zones and treatment locations unticked on a re-declare: counted in the totals, not shown as active. */
  retiredZones: MciZoneStats[];
  retiredAreas: MciAreaStats[];
  totals: MciTotals;
  /** Every patient that reached a treatment location, transported ones included, in arrival order. */
  patients: MciPatient[];
  /** False when a patient entry no longer fits the log (its patient is gone, elsewhere or already left). Undo never leaves the log like this. */
  consistent: boolean;
}

/**
 * Counts unresolved clinic patients per clinic in one pass over the calls, for every clinic area at once.
 * Calls with no `clinicId` belong to the single or default clinic; with one clinic, every clinic call counts.
 */
function regularClinicCounter(event: Pick<Event, 'calls' | 'clinics'>): (clinicId: string | undefined) => number {
  const clinics = getEventClinics(event.clinics);
  const single = clinics.length <= 1;
  const defaultId = clinics[0]?.id;
  const counts = new Map<string | undefined, number>();
  for (const call of event.calls || []) {
    if (!call.clinic || isClinicCallResolved(call)) continue;
    const key = single ? undefined : call.clinicId ?? defaultId;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return (clinicId) => (clinicId ? counts.get(single ? undefined : clinicId) ?? 0 : 0);
}

/** Unresolved clinic patients at a clinic area. Calls with no `clinicId` belong to the single or default clinic. */
export function regularClinicCount(event: Pick<Event, 'calls' | 'clinics'>, area: Pick<MciTreatmentArea, 'clinicId'>): number {
  return regularClinicCounter(event)(area.clinicId);
}

interface ZoneClearState {
  cleared: boolean;
  clearedAt?: number;
  clearedTimes: number[];
}

function zoneClearStates(mci: MciState, live: readonly MciLogEntry[] = liveEntries(currentLog(mci))): Map<string, ZoneClearState> {
  const states = new Map<string, ZoneClearState>();
  for (const zone of mci.zones) states.set(zone.id, { cleared: false, clearedTimes: [] });
  for (const entry of live) {
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
    const queue = queues.get(p.areaId);
    if (queue) queue.push(p);
    else queues.set(p.areaId, [p]);
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

/** Zone stats from the live entries: one pass over the log for every zone (`zones`, the active ones by default). */
function deriveZones(mci: MciState, live: readonly MciLogEntry[], zones: readonly MciZone[] = mci.zones): MciZoneStats[] {
  const taggedBy = new Map<string, MciCounts>();
  const movedBy = new Map<string, MciCounts>();
  for (const entry of live) {
    if (!entry.zoneId || !entry.color || !entry.n) continue;
    if (entry.kind === 'tagged') bump(taggedBy, entry.zoneId, entry.color, entry.n);
    else if (entry.kind === 'moved') bump(movedBy, entry.zoneId, entry.color, entry.n);
  }
  const clearStates = zoneClearStates(mci, live);

  return zones.map((zone) => {
    const tagged = taggedBy.get(zone.id) ?? emptyCounts();
    const moved = movedBy.get(zone.id) ?? emptyCounts();
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
}

/** Transport entries grouped into trips per treatment location (same time and ambulance), newest first. */
function tripsByArea(live: readonly MciLogEntry[], patients: readonly MciPatient[]): Map<string, MciTransportTrip[]> {
  const byId = new Map(patients.map((p) => [p.id, p]));
  const trips = new Map<string, MciTransportTrip>();
  const byArea = new Map<string, MciTransportTrip[]>();
  for (const entry of live) {
    if (entry.kind !== 'transported' || !entry.areaId || !entry.color || !entry.n) continue;
    const key = `${entry.areaId}|${entry.t}|${entry.unit ?? ''}|${entry.destination ?? ''}`;
    let trip = trips.get(key);
    if (!trip) {
      trip = { t: entry.t, unit: entry.unit ?? '', ...(entry.destination ? { destination: entry.destination } : {}), counts: emptyCounts(), total: 0, patients: [] };
      trips.set(key, trip);
      const list = byArea.get(entry.areaId);
      if (list) list.push(trip);
      else byArea.set(entry.areaId, [trip]);
    }
    trip.counts[entry.color] += entry.n;
    trip.total += entry.n;
    const patient = entry.patientId ? byId.get(entry.patientId) : undefined;
    if (patient) trip.patients.push(patient);
  }
  for (const list of byArea.values()) list.sort((a, b) => b.t - a.t);
  return byArea;
}

export function deriveMci(event: Pick<Event, 'mci' | 'calls' | 'clinics'>): MciDerived {
  const mci = event.mci ?? emptyMci();
  const live = liveEntries(currentLog(mci));
  const zones = deriveZones(mci, live);
  const retiredZones = deriveZones(mci, live, mci.retiredZones ?? []);

  const replay = replayPatients(mci, live);
  const trips = tripsByArea(live, replay.patients);
  const inArea = new Map<string, MciPatient[]>();
  for (const p of replay.patients) {
    if (p.transportedAt !== undefined) continue;
    const list = inArea.get(p.areaId);
    if (list) list.push(p);
    else inArea.set(p.areaId, [p]);
  }
  const clinicNames = new Map(getEventClinics(event.clinics).map((c) => [c.id, c.name]));
  const regularAt = regularClinicCounter(event);

  const areaStats = (area: MciTreatmentArea): MciAreaStats => {
    const received = { ...(replay.received.get(area.id) ?? emptyCounts()) };
    const transported = { ...(replay.transported.get(area.id) ?? emptyCounts()) };
    const transferredOut = { ...(replay.transferredOut.get(area.id) ?? emptyCounts()) };
    const patients = (inArea.get(area.id) ?? []).sort(byRankThenArrival);
    const inTreatment = emptyCounts();
    for (const p of patients) {
      inTreatment[p.color] += 1;
      if (!mciAreaAccepts(area, p.color)) p.misplaced = true;
    }
    const clinicName = area.clinicId ? clinicNames.get(area.clinicId) : undefined;
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
      trips: trips.get(area.id) ?? [],
      regular: regularAt(area.clinicId),
      isClinic: !!area.clinicId,
    };
  };
  const areas = mci.areas.map(areaStats);
  const retiredAreas = (mci.retiredAreas ?? []).map(areaStats);

  const tagged = emptyCounts();
  for (const stats of [...zones, ...retiredZones]) addCounts(tagged, stats.tagged);
  const transported = emptyCounts();
  for (const stats of [...areas, ...retiredAreas]) addCounts(transported, stats.transported);

  return {
    zones,
    areas,
    retiredZones,
    retiredAreas,
    totals: {
      tagged,
      taggedTotal: sumCounts(tagged),
      arrived: replay.arrived,
      arrivedTotal: sumCounts(replay.arrived),
      transported,
      transportedTotal: sumCounts(transported),
      inZonesTotal: [...zones, ...retiredZones].reduce((n, z) => n + z.inZoneTotal, 0),
      inTreatmentTotal: [...areas, ...retiredAreas].reduce((n, a) => n + a.inTreatmentTotal, 0),
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
  // Each MCI on the event starts again from zero.
  if (mci?.earlier?.length) return mciRecords(mci).flatMap((record) => mciSeries(record));
  if (!mci || mci.periods.length === 0) return [];
  let inZones = 0;
  let inTreatment = 0;
  let transported = 0;
  const points: MciSeriesPoint[] = [{ t: mci.periods[0].startedAt, inZones, inTreatment, transported }];
  for (const entry of liveEntries(currentLog(mci))) {
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

function makeEntry(ctx: MciWriteContext, entry: Omit<MciLogEntry, 'id' | 't' | 'by' | 'byUnit' | 'byRole' | 'batch'>): MciLogEntry {
  return {
    id: (ctx.newId ?? newMciId)(),
    t: ctx.now,
    ...(ctx.by ? { by: ctx.by } : {}),
    ...(ctx.byUnit ? { byUnit: ctx.byUnit } : {}),
    ...(ctx.byRole ? { byRole: ctx.byRole } : {}),
    ...(ctx.batch ? { batch: ctx.batch } : {}),
    ...entry,
  };
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
  /**
   * For a re-declare after a stand-down:
   * - 'keep': carry on the earlier MCI, counts and all. `zones` and `areas` are the whole lists wanted: an
   *   earlier one left out is retired (kept for the log and summary), unless patients are still in it.
   * - 'new': archive the earlier MCI (see `mciRecords`) and start from zero with exactly `zones` and `areas`.
   * Unset (a first declare): `zones` and `areas` are added to whatever is there.
   */
  mode?: 'keep' | 'new';
}

/** Adds items not already in `into` by id or name, in order. A retired one with the same id comes back as it was. */
function mergeByIdAndName<T extends { id: string; name: string }>(into: T[], add: readonly T[], retired: readonly T[] = []): T[] {
  const out = [...into];
  for (const item of add) {
    if (out.some((x) => x.id === item.id) || isDuplicateMciName(out, item.name)) continue;
    out.push(retired.find((r) => r.id === item.id) ?? item);
  }
  return out;
}

/** The zones and areas a 'keep' re-declare ends with, and those it retires. */
function keepWanted(base: MciState, input: DeclareMciInput) {
  const derived = deriveMci({ mci: base, calls: [], clinics: [] });
  const zoneIds = new Set(input.zones.map((z) => z.id));
  const areaIds = new Set(input.areas.map((a) => a.id));
  const zoneBusy = new Set(derived.zones.filter((z) => z.inZoneTotal > 0).map((z) => z.zone.id));
  const areaBusy = new Set(derived.areas.filter((a) => a.inTreatmentTotal > 0).map((a) => a.area.id));
  const keptZones = base.zones.filter((z) => zoneIds.has(z.id) || zoneBusy.has(z.id));
  const keptAreas = base.areas.filter((a) => areaIds.has(a.id) || areaBusy.has(a.id));
  const oldRetiredZones = base.retiredZones ?? [];
  const oldRetiredAreas = base.retiredAreas ?? [];
  const zones = mergeByIdAndName(keptZones, input.zones, oldRetiredZones);
  const areas = mergeByIdAndName(keptAreas, input.areas, oldRetiredAreas);
  const retiredZones = [...oldRetiredZones, ...base.zones].filter((z) => !zones.some((k) => k.id === z.id));
  const retiredAreas = [...oldRetiredAreas, ...base.areas].filter((a) => !areas.some((k) => k.id === a.id));
  return { zones, areas, retiredZones, retiredAreas };
}

/**
 * Starts an MCI period. A re-declare after a stand-down either carries on the earlier MCI (`mode: 'keep'`,
 * appending a period) or archives it and starts an entirely new one (`mode: 'new'`); see `DeclareMciInput`.
 */
export function declareMci(
  event: Pick<Event, 'mci' | 'manualSurgeActive' | 'surgeLog'>,
  input: DeclareMciInput,
  now: number
): Partial<Event> {
  const base = event.mci ?? emptyMci();
  const hasOpenPeriod = base.periods.length > 0 && base.periods[base.periods.length - 1].endedAt === undefined;
  const redeclare = base.periods.length > 0 && !hasOpenPeriod;
  const mode = redeclare ? input.mode : undefined;

  let next: MciState;
  if (mode === 'new') {
    const { retiredZones: rz, retiredAreas: ra, ...rest } = base;
    const archived: MciEarlier = {
      periods: base.periods,
      zones: base.zones,
      areas: base.areas,
      ...(rz?.length ? { retiredZones: rz } : {}),
      ...(ra?.length ? { retiredAreas: ra } : {}),
      until: now,
    };
    const fresh = <T extends { clearedAt?: number }>(item: T): T => {
      const { clearedAt: _c, ...clean } = item;
      void _c;
      return clean as T;
    };
    next = {
      ...rest,
      periods: [{ startedAt: now }],
      zones: mergeByIdAndName([], input.zones.map(fresh)),
      areas: mergeByIdAndName([], input.areas),
      earlier: [...(base.earlier ?? []), archived],
      ...(base.logistics ? { logistics: { ...base.logistics, ...(base.logistics.hospitals ? { hospitals: base.logistics.hospitals.map(({ sentAdjust: _s, ...h }) => (void _s, h)) } : {}) } } : {}),
    };
  } else if (mode === 'keep') {
    const wanted = keepWanted(base, input);
    const { retiredZones: _rz, retiredAreas: _ra, ...rest } = base;
    void _rz;
    void _ra;
    next = {
      ...rest,
      zones: wanted.zones,
      areas: wanted.areas,
      ...(wanted.retiredZones.length ? { retiredZones: wanted.retiredZones } : {}),
      ...(wanted.retiredAreas.length ? { retiredAreas: wanted.retiredAreas } : {}),
      periods: [...base.periods, { startedAt: now }],
    };
  } else {
    next = {
      ...base,
      zones: mergeByIdAndName(base.zones, input.zones),
      areas: mergeByIdAndName(base.areas, input.areas),
      periods: hasOpenPeriod ? base.periods : [...base.periods, { startedAt: now }],
    };
  }
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
      ...next,
      active: true,
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
 * A unit whose Location was set by its assignment goes back to its post; a
 * unit with live tracking (`tracked`, D66) keeps its tracked Location.
 */
export function standDownMci(event: Event, now: number, tracked: ReadonlySet<string> = new Set()): Partial<Event> {
  const base = event.mci ?? emptyMci();
  const periods = base.periods.map((period, i) =>
    i === base.periods.length - 1 && period.endedAt === undefined ? { ...period, endedAt: now } : period
  );
  const reset = <T extends Staff | Supervisor>(unit: T): T => {
    const wasMci = MCI_STATUS_SET.has(unit.status);
    if (!wasMci && !unit.mciAssignment) return unit;
    const { mciAssignment: assigned, ...rest } = unit;
    const next = { ...rest } as T;
    if (!wasMci) return next;
    next.status = 'Available';
    const targetName = assigned ? mciAssignmentName(base, assigned) : undefined;
    const restore = unit.originalPost || event.pendingAssignments?.[unit.team]?.post;
    if (!tracked.has(unit.team) && restore && targetName && unit.location === targetName) next.location = restore;
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

/** One zone's stats. Only the zone side of the log is replayed; treatment patients are not needed here. */
function zoneStatsOf(event: Pick<Event, 'mci'>, zoneId: string): MciZoneStats | undefined {
  const mci = event.mci;
  if (!mci) return undefined;
  return deriveZones(mci, liveEntries(currentLog(mci))).find((z) => z.zone.id === zoneId);
}

/** Adds (or, when `delta` is negative, removes) found patients of one color. A removal is clamped to what is in the zone. Tagging into a cleared zone reopens it. */
export function tagPatch(event: Pick<Event, 'mci' | 'calls' | 'clinics'>, zoneId: string, color: MciColor, delta: number, ctx: MciWriteContext): MciWrite {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  const stats = zoneStatsOf(event, zoneId);
  if (!stats) return { patch: {}, error: 'unknown-zone' };
  return tagWithStats(event.mci, stats, color, delta, ctx);
}

function tagWithStats(mci: MciState, stats: MciZoneStats, color: MciColor, delta: number, ctx: MciWriteContext): MciWrite {
  const zoneId = stats.zone.id;
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
  return { patch: { mci: appendMciEntries(mci, entries) }, ...(clamped ? { clamped } : {}) };
}

/** Sets the Tagged total for one color, written as a single delta entry. Never goes below what was already moved. */
export function setTaggedTotalPatch(event: Pick<Event, 'mci' | 'calls' | 'clinics'>, zoneId: string, color: MciColor, total: number, ctx: MciWriteContext): MciWrite {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  const stats = zoneStatsOf(event, zoneId);
  if (!stats) return { patch: {}, error: 'unknown-zone' };
  if (!Number.isInteger(total) || total < 0) return { patch: {}, error: 'invalid' };
  return tagWithStats(event.mci, stats, color, total - stats.tagged[color], ctx);
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
  const area = event.mci.areas.find((a) => a.id === areaId);
  if (!area) return { patch: {}, error: 'unknown-area' };
  if (MCI_COLORS.some((color) => Math.floor(counts[color] ?? 0) > 0 && !mciAreaAccepts(area, color))) return { patch: {}, error: 'wrong-color' };

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

/**
 * Moves patients from a zone with each color sent where `mciRouteArea` says: `preferredAreaId` when it takes
 * that color, else the color's tarp. One submission, so the entries share a batch id.
 */
export function routedMovePatch(
  event: Pick<Event, 'mci' | 'calls' | 'clinics'>,
  zoneId: string,
  counts: Partial<MciCounts>,
  preferredAreaId: string | undefined,
  ctx: MciWriteContext
): MciWrite {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  const byArea = new Map<string, Partial<MciCounts>>();
  for (const color of MCI_COLORS) {
    if (Math.floor(counts[color] ?? 0) <= 0) continue;
    const area = mciRouteArea(event.mci, color, preferredAreaId);
    if (!area) return { patch: {}, error: 'no-area' };
    byArea.set(area.id, { ...(byArea.get(area.id) ?? {}), [color]: counts[color] });
  }
  if (byArea.size === 0) return { patch: {}, error: 'invalid' };
  const batchCtx: MciWriteContext = { ...ctx, batch: ctx.batch ?? (ctx.newId ?? newMciId)() };
  let current = event;
  let clamped = false;
  let changed = false;
  for (const [areaId, part] of byArea) {
    const w = movePatch(current, zoneId, areaId, part, batchCtx);
    if (w.error === 'invalid') {
      clamped = clamped || !!w.clamped;
      continue;
    }
    if (w.error) return w;
    if (w.clamped) clamped = true;
    current = withPatch(current, w);
    changed = true;
  }
  if (!changed) return { patch: {}, clamped, error: 'invalid' };
  return { patch: { mci: current.mci }, ...(clamped ? { clamped } : {}) };
}

const MAX_UNIT_LENGTH = 40;
const MAX_DESTINATION_LENGTH = 80;

/** The distinct ambulance numbers used so far (live entries), oldest first, for the dialog's suggestions. */
export function mciTransportUnits(mci: MciState | undefined): string[] {
  if (!mci) return [];
  const seen: string[] = [];
  for (const entry of liveEntries(currentLog(mci))) {
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
  const area = event.mci.areas.find((a) => a.id === areaId);
  if (!area) return { patch: {}, error: 'unknown-area' };
  if (!mciAreaAccepts(area, color)) return { patch: {}, error: 'wrong-color' };
  if (!Number.isInteger(n) || n <= 0) return { patch: {}, error: 'invalid' };
  return { patch: { mci: appendMciEntries(event.mci, [makeEntry(ctx, { kind: 'arrived', areaId, color, n })]) } };
}

/**
 * Retriages a patient (a new color), sends them to another treatment location, or both, with an optional
 * note. A patient who changes location loses their transport priority, which belonged to the old one.
 * Tarps take only their own color: a new color with no location given moves the patient to that color's tarp
 * when they are in a tarp of another color (they stay, `misplaced`, if there is none); a location that does not
 * take the patient's color is refused.
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
  const toColor = target.color && target.color !== patient.color ? target.color : undefined;
  const color = toColor ?? patient.color;
  let toAreaId = target.areaId && target.areaId !== patient.areaId ? target.areaId : undefined;
  if (toAreaId) {
    const to = mci.areas.find((a) => a.id === toAreaId);
    if (!to) return { patch: {}, error: 'unknown-area' };
    if (!mciAreaAccepts(to, color)) return { patch: {}, error: 'wrong-color' };
  } else if (toColor) {
    const here = mci.areas.find((a) => a.id === patient.areaId);
    const tarp = mci.areas.find((a) => a.color === toColor);
    if (here && !mciAreaAccepts(here, toColor) && tarp) toAreaId = tarp.id;
  }
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

/**
 * The location a zone's quick move prefers: the one other than a tarp last moved to from this zone, else none,
 * meaning each color goes to its tarp (see `mciRouteArea`).
 */
export function mciQuickMoveArea(mci: MciState | undefined, zoneId: string): string | undefined {
  return mciQuickMoveAreas(mci)(zoneId);
}

/** `mciQuickMoveArea` for every zone, with one pass over the log. */
export function mciQuickMoveAreas(mci: MciState | undefined): (zoneId: string) => string | undefined {
  if (!mci || mci.areas.length === 0) return () => undefined;
  const anyColor = new Set(mci.areas.filter((a) => !a.color).map((a) => a.id));
  const hasTarps = mci.areas.some((a) => a.color);
  const last = new Map<string, string | undefined>();
  for (const entry of liveEntries(currentLog(mci))) {
    if (entry.kind !== 'moved' || !entry.zoneId || !entry.areaId) continue;
    if (anyColor.has(entry.areaId)) last.set(entry.zoneId, entry.areaId);
    else if (mci.areas.some((a) => a.id === entry.areaId)) last.set(entry.zoneId, undefined);
  }
  const fallback = hasTarps ? undefined : mci.areas[0].id;
  return (zoneId) => (last.has(zoneId) ? last.get(zoneId) : fallback);
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
  const log = currentLog(mci);
  const undone = undoneIds(log);
  return [...log].reverse().slice(0, limit).map((entry) => ({ entry, undone: undone.has(entry.id) }));
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
 * the assignment the dispatcher picks, never from a location (D66, D68). The
 * unit's Location becomes the assignment, unless the unit has live tracking
 * (`tracked`): its Location is then where it is, so MCI code never writes it (D66).
 */
export function mciAssignmentPatch(
  event: Pick<Event, 'mci'>,
  assignment: MciAssignment | null,
  tracked = false
): MciAssignmentPatch {
  if (!assignment) return { patch: { mciAssignment: undefined } };
  const name = mciAssignmentName(event.mci, assignment);
  if (!name) return { patch: { mciAssignment: undefined } };
  if (tracked) {
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
  event: Pick<Event, 'mci'>,
  unit: Pick<Staff, 'mciAssignment'>,
  newStatus: string,
  assignment?: MciAssignment,
  tracked = false
): MciAssignmentPatch {
  const kind = mciAssignmentKindFor(newStatus);
  if (kind) {
    const chosen = assignment?.kind === kind ? assignment : unit.mciAssignment?.kind === kind ? unit.mciAssignment : null;
    return chosen ? mciAssignmentPatch(event, chosen, tracked) : { patch: {} };
  }
  if (newStatus === 'Available' || newStatus === 'Unavailable') return mciAssignmentPatch(event, null);
  return { patch: {} };
}

/** Names of the units working at a zone or treatment location right now. */
export function mciUnitsAt(event: Event, assignment: MciAssignment): string[] {
  return mciUnitsByAssignment(event)(assignment);
}

/** `mciUnitsAt` for every zone and treatment location, with one pass over the units and calls. */
export function mciUnitsByAssignment(event: Pick<Event, 'staff' | 'supervisor' | 'calls'>): (assignment: MciAssignment) => string[] {
  const visualStatus = teamVisualStatusResolver(event);
  const byTarget = new Map<string, string[]>();
  const units: (Staff | Supervisor)[] = [...(event.staff || []), ...(event.supervisor || [])];
  for (const unit of units) {
    const assigned = unit.mciAssignment;
    if (!assigned) continue;
    // A unit sent to a normal call is on that call, whatever its stored status says.
    if (visualStatus(unit.status, unit.team) !== (assigned.kind === 'zone' ? 'Triage' : 'Treatment')) continue;
    const key = `${assigned.kind}:${assigned.id}`;
    const list = byTarget.get(key);
    if (list) list.push(unit.team);
    else byTarget.set(key, [unit.team]);
  }
  return (assignment) => byTarget.get(`${assignment.kind}:${assignment.id}`) ?? [];
}

export interface MciAvailability {
  available: number;
  triage: number;
  treatment: number;
  unavailable: number;
}

/** The availability strip's MCI buckets: a unit on a call, on break or in the clinic counts as Unavailable. */
export function mciAvailability(event: Pick<Event, 'staff' | 'calls'>): MciAvailability {
  const result: MciAvailability = { available: 0, triage: 0, treatment: 0, unavailable: 0 };
  const visualStatus = teamVisualStatusResolver(event);
  for (const unit of event.staff || []) {
    const status = visualStatus(unit.status, unit.team);
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
  const records = mciRecords(event.mci);
  if (records.length > 1) return records.flatMap((mci, i) => recordCsvLines(mci, formatTimestamp, `MCI ${i + 1}`));
  return records.length ? recordCsvLines(records[0], formatTimestamp) : [];
}

/** One MCI's CSV rows; `label` ("MCI 2") names it when the event had more than one. */
function recordCsvLines(mci: MciState, formatTimestamp: (ms: number) => string, label?: string): string[] {
  const named = (text: string) => (label ? `${label} ${text.replace(/^MCI /, '')}` : text);
  const zoneNames = new Map(mciAllZones(mci).map((z) => [z.id, z.name]));
  const areaNames = new Map(mciAllAreas(mci).map((a) => [a.id, a.name]));
  const entriesById = new Map(mci.log.map((e) => [e.id, e]));
  const zoneName = (id?: string) => (id ? zoneNames.get(id) : undefined);
  const areaName = (id?: string) => (id ? areaNames.get(id) : undefined);
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
    rows.push({ t: period.startedAt, order: -1, line: `MCI,-,${formatTimestamp(period.startedAt)},${csvQuote(named('MCI declared'))}` });
    if (period.endedAt !== undefined) {
      const minutes = Math.round((period.endedAt - period.startedAt) / 60000);
      rows.push({ t: period.endedAt, order: 1e9 + i, line: `MCI,-,${formatTimestamp(period.endedAt)},${csvQuote(named(`MCI stood down (active for ${minutes} min)`))}` });
    }
  });
  mci.log.forEach((entry, i) => {
    // An undo row names the zone of the entry it reverses.
    const target = entry.kind === 'undo' && entry.undoes ? entriesById.get(entry.undoes) : undefined;
    const scopeEntry = target ?? entry;
    const scope = zoneName(scopeEntry.zoneId) ?? (scopeEntry.kind !== 'moved' ? areaName(scopeEntry.areaId) : undefined) ?? '-';
    const text = entry.kind === 'undo' && target ? `undo ${describe(target)}` : describe(entry);
    // Who made the change, for a role login (#152): "[Alpha, responder]".
    const who = entry.byUnit ? ` [${entry.byUnit}${entry.byRole ? `, ${entry.byRole}` : ''}]` : '';
    rows.push({ t: entry.t, order: i, line: `MCI,${scope},${formatTimestamp(entry.t)},${csvQuote(text + who)}` });
  });
  return rows.sort((a, b) => a.t - b.t || a.order - b.order).map((r) => r.line);
}

/**
 * One summary CSV row per patient who reached a treatment location, in arrival order:
 * `MCI patient,<location>,<arrived>,"<color> <age sex complaint> from <zone> team <team>; transported <time> by <unit> to <destination>"`.
 */
export function mciPatientCsvLines(event: Pick<Event, 'mci' | 'calls' | 'clinics'>, formatTimestamp: (ms: number) => string): string[] {
  return mciRecords(event.mci).flatMap((mci) => {
  const derived = deriveMci({ ...event, mci });
  const zoneName = (id?: string) => mciAllZones(mci).find((z) => z.id === id)?.name;
  const areaName = (id: string) => [...derived.areas, ...derived.retiredAreas].find((a) => a.area.id === id)?.name ?? id;
  return derived.patients.map((p) => {
    const parts = [
      p.color,
      mciPatientLabel(p.details) || undefined,
      p.fromZoneId ? `from ${zoneName(p.fromZoneId) ?? p.fromZoneId}` : 'walk-in',
      p.details.team ? `team ${p.details.team}` : undefined,
    ].filter(Boolean);
    const left =
      p.transportedAt !== undefined
        ? `; transported ${formatTimestamp(p.transportedAt)}${p.unit ? ` by ${p.unit}` : ''}${p.destination ? ` to ${p.destination}` : ''} (${Math.round((p.transportedAt - p.arrivedAt) / 60000)} min in treatment)`
        : '; still in treatment';
    return `MCI patient,${areaName(p.areaId)},${formatTimestamp(p.arrivedAt)},${csvQuote(parts.join(' ') + left)}`;
  });
  });
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
    // A tarp is drawn in its tag color (#154).
    color: 'color' in item && item.color ? MCI_TARP_HEX[item.color] : previous?.color ?? (target.kind === 'zone' ? MCI_ZONE_COLOR : MCI_AREA_COLOR),
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
  /** The patients on this trip that were picked by name (not by count), with their details. */
  patients: MciPatient[];
}

/**
 * The ambulance trips that left a treatment location, newest first. Entries written together (same time and
 * ambulance) are one trip; undone entries are left out.
 */
export function mciTransportTrips(mci: MciState | undefined, areaId: string): MciTransportTrip[] {
  if (!mci) return [];
  const live = liveEntries(currentLog(mci));
  return tripsByArea(live, replayPatients(mci, live).patients).get(areaId) ?? [];
}


// ---------------------------------------------------------------------------
// Role views (#144, #152, #153): batched counts, patients with details and care, notes
// ---------------------------------------------------------------------------

const MAX_PATIENT_NOTES_LENGTH = 600;
const MAX_INTERVENTION_LENGTH = 40;
const MAX_NOTED_LENGTH = 160;

/** Applies one write's patch to an event, for chaining helpers. */
function withPatch<E extends Pick<Event, 'mci'>>(event: E, write: MciWrite): E {
  return { ...event, ...write.patch } as E;
}

/**
 * One submission of tag changes for a zone: a signed delta per color, written
 * as one entry per color sharing a batch id, so the log shows the submission
 * as one change by one unit. Removing more than is in the zone is clamped.
 */
export function tagBatchPatch(
  event: Pick<Event, 'mci' | 'calls' | 'clinics'>,
  zoneId: string,
  deltas: Partial<MciCounts>,
  ctx: MciWriteContext
): MciWrite {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  if (!event.mci.zones.some((z) => z.id === zoneId)) return { patch: {}, error: 'unknown-zone' };
  const batchCtx: MciWriteContext = { ...ctx, batch: ctx.batch ?? (ctx.newId ?? newMciId)() };
  let current = event;
  let clamped = false;
  let changed = false;
  for (const color of MCI_COLORS) {
    const delta = deltas[color] ?? 0;
    if (!delta) continue;
    const w = tagPatch(current, zoneId, color, delta, batchCtx);
    if (w.error) return w;
    if (w.clamped) clamped = true;
    if (w.patch.mci) {
      current = withPatch(current, w);
      changed = true;
    }
  }
  if (!changed) return NO_CHANGE;
  return { patch: { mci: current.mci }, ...(clamped ? { clamped } : {}) };
}

/** A new patient at a treatment location, with what is known about them, in one change. Returns the patient's id. */
export function addPatientPatch(
  event: Pick<Event, 'mci' | 'calls' | 'clinics'>,
  areaId: string,
  color: MciColor,
  fields: Partial<Record<MciPatientField, string>>,
  ctx: MciWriteContext
): MciWrite & { patientId?: string } {
  const entryId = (ctx.newId ?? newMciId)();
  const arrived = arrivePatch(event, areaId, color, 1, { ...ctx, newId: () => entryId });
  if (arrived.error) return arrived;
  const patientId = mciPatientId(entryId, 0);
  const detailed = setPatientDetailsPatch(withPatch(event, arrived), patientId, fields);
  return { patch: detailed.patch.mci ? detailed.patch : arrived.patch, patientId };
}

/** An attributed entry that moves no count: a unit's assignment, a patient update, a logistics change. */
export function notedPatch(
  event: Pick<Event, 'mci'>,
  note: string,
  where: { zoneId?: string; areaId?: string; patientId?: string },
  ctx: MciWriteContext
): MciWrite {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  const text = tidy(note, MAX_NOTED_LENGTH);
  if (!text) return { patch: {}, error: 'invalid' };
  return { patch: { mci: appendMciEntries(event.mci, [makeEntry(ctx, { kind: 'noted', note: text, ...where })]) } };
}

/**
 * Treatment notes and interventions for a patient (#153). An intervention is
 * timed and attributed; notes replace the previous notes. Logged as a 'noted' entry.
 */
export function patientCarePatch(
  event: Pick<Event, 'mci' | 'calls' | 'clinics'>,
  patientId: string,
  care: { notes?: string; intervention?: string },
  ctx: MciWriteContext
): MciWrite {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  const patient = deriveMci(event).patients.find((p) => p.id === patientId);
  if (!patient) return { patch: {}, error: 'unknown-patient' };
  const current = mci.patients?.[patientId] ?? {};
  const next: MciPatientDetails = { ...current };
  const said: string[] = [];
  if (care.notes !== undefined) {
    const notes = care.notes.trim().slice(0, MAX_PATIENT_NOTES_LENGTH);
    if (notes !== (current.notes ?? '')) {
      if (notes) next.notes = notes;
      else delete next.notes;
      said.push('notes updated');
    }
  }
  const name = care.intervention ? tidy(care.intervention, MAX_INTERVENTION_LENGTH) : '';
  if (name) {
    next.interventions = [...(current.interventions ?? []), { t: ctx.now, name, ...(ctx.byUnit ? { byUnit: ctx.byUnit } : {}) }];
    said.push(name);
  }
  if (!said.length) return NO_CHANGE;
  const withCare: MciState = { ...mci, patients: withDetails(mci.patients ?? {}, patientId, next) };
  // No age, sex or complaint in the text: the log is in the state document, which every role reads (#156).
  // The log shows who it was from `patientId`, for those who may see patient details.
  const entry = makeEntry(ctx, { kind: 'noted', patientId, areaId: patient.areaId, note: tidy(`Patient: ${said.join('; ')}`, MAX_NOTED_LENGTH) });
  return { patch: { mci: appendMciEntries(withCare, [entry]) } };
}

/** A triage tarp's treatment zone name: "Red treatment" (#154). */
export function mciTarpName(color: MciColor): string {
  return `${color.charAt(0).toUpperCase()}${color.slice(1)} treatment`;
}

/** The map color of a tarp's shape, by tag color (#154). */
export const MCI_TARP_HEX: Record<MciColor, string> = { red: '#dc2626', yellow: '#facc15', green: '#16a34a', black: '#262626' };

/**
 * Moves a patient one place up or down their location's transport order, as shown (ranked first, then by
 * arrival), past the next patient of the same color (a location taking several colors shows a column per
 * color), and writes the whole shown order as ranks, so every view keeps the order the Treatment Lead sees.
 */
export function movePatientInOrderPatch(event: Pick<Event, 'mci' | 'calls' | 'clinics'>, patientId: string, direction: 'up' | 'down'): MciWrite {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  const { derived, patient } = patientInTreatment(event, patientId);
  if (!patient) return { patch: {}, error: 'unknown-patient' };
  const order = [...(derived.areas.find((a) => a.area.id === patient.areaId)?.patients ?? [])];
  const i = order.findIndex((p) => p.id === patientId);
  const step = direction === 'up' ? -1 : 1;
  let j = i + step;
  while (j >= 0 && j < order.length && order[j]!.color !== patient.color) j += step;
  if (i < 0 || j < 0 || j >= order.length) return NO_CHANGE;
  [order[i], order[j]] = [order[j]!, order[i]!];
  let patients = mci.patients ?? {};
  order.forEach((p, k) => {
    if (patients[p.id]?.priority !== k + 1) patients = withDetails(patients, p.id, { ...(patients[p.id] ?? {}), priority: k + 1 });
  });
  return { patch: { mci: { ...mci, patients } } };
}
