import type {
  Event,
  Layer,
  MciAssignment,
  MciColor,
  MciLogEntry,
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
// MCI mode holds counts only, never patient-identifying data.

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
  error?: 'inactive' | 'unknown-zone' | 'unknown-area' | 'invalid' | 'duplicate' | 'cannot-undo';
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

export interface MciAreaStats {
  area: MciTreatmentArea;
  /** Current display name (a clinic area follows the clinic's name). */
  name: string;
  /** MCI patients moved in. */
  received: MciCounts;
  receivedTotal: number;
  /** MCI patients that left in an ambulance. */
  transported: MciCounts;
  transportedTotal: number;
  /** Received minus transported: the MCI patients here now. */
  inTreatment: MciCounts;
  inTreatmentTotal: number;
  /** Unresolved regular clinic patients, 0 for an MCI-only area. */
  regular: number;
  isClinic: boolean;
}

export interface MciTotals {
  tagged: MciCounts;
  taggedTotal: number;
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

  const clinics = getEventClinics(event.clinics);
  const areas: MciAreaStats[] = mci.areas.map((area) => {
    const received = emptyCounts();
    const transported = emptyCounts();
    for (const entry of live) {
      if (entry.areaId !== area.id || !entry.color || !entry.n) continue;
      if (entry.kind === 'moved') received[entry.color] += entry.n;
      else if (entry.kind === 'transported') transported[entry.color] += entry.n;
    }
    const inTreatment = emptyCounts();
    for (const color of MCI_COLORS) inTreatment[color] = received[color] - transported[color];
    const clinicName = area.clinicId ? clinics.find((c) => c.id === area.clinicId)?.name : undefined;
    return {
      area,
      name: clinicName ?? area.name,
      received,
      receivedTotal: sumCounts(received),
      transported,
      transportedTotal: sumCounts(transported),
      inTreatment,
      inTreatmentTotal: sumCounts(inTreatment),
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
      transported,
      transportedTotal: sumCounts(transported),
      inZonesTotal: zones.reduce((n, z) => n + z.inZoneTotal, 0),
      inTreatmentTotal: areas.reduce((n, a) => n + a.inTreatmentTotal, 0),
      regularTotal: areas.reduce((n, a) => n + a.regular, 0),
    },
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

/**
 * Sends patients off site from a treatment location in an ambulance. Each color is clamped to what is in that
 * location; the ambulance number is required. One entry per color that has a count, all sharing the unit and
 * destination, so a single ambulance trip is one write.
 */
export function transportPatch(
  event: Pick<Event, 'mci' | 'calls' | 'clinics'>,
  areaId: string,
  counts: Partial<MciCounts>,
  trip: { unit: string; destination?: string },
  ctx: MciWriteContext
): MciWrite {
  if (!event.mci?.active) return { patch: {}, error: 'inactive' };
  const stats = deriveMci(event).areas.find((a) => a.area.id === areaId);
  if (!stats) return { patch: {}, error: 'unknown-area' };
  const unit = trip.unit.trim().replace(/\s+/g, ' ').slice(0, MAX_UNIT_LENGTH);
  if (!unit) return { patch: {}, error: 'invalid' };
  const destination = trip.destination?.trim().replace(/\s+/g, ' ').slice(0, MAX_DESTINATION_LENGTH);

  const entries: MciLogEntry[] = [];
  let clamped = false;
  for (const color of MCI_COLORS) {
    const asked = Math.floor(counts[color] ?? 0);
    if (asked <= 0) continue;
    const n = Math.min(asked, stats.inTreatment[color]);
    if (n < asked) clamped = true;
    if (n > 0) entries.push(makeEntry(ctx, { kind: 'transported', areaId, color, n, unit, ...(destination ? { destination } : {}) }));
  }
  if (entries.length === 0) return { patch: {}, clamped, error: 'invalid' };
  return { patch: { mci: appendMciEntries(event.mci, entries) }, ...(clamped ? { clamped } : {}) };
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

/** Appends a compensating entry. Refused when the entry is gone already or undoing it would leave a zone with negative patients. */
export function undoPatch(event: Pick<Event, 'mci' | 'calls' | 'clinics'>, entryId: string, ctx: MciWriteContext): MciWrite {
  const mci = event.mci;
  if (!mci?.active) return { patch: {}, error: 'inactive' };
  const target = mci.log.find((e) => e.id === entryId);
  if (!target || target.kind === 'undo' || undoneIds(mci.log).has(entryId)) return { patch: {}, error: 'cannot-undo' };

  const next = appendMciEntries(mci, [makeEntry(ctx, { kind: 'undo', undoes: entryId })]);
  const after = deriveMci({ ...event, mci: next });
  // Undoing a tag or a move must not leave a zone, and undoing a move must not leave a treatment location, below zero.
  const valid =
    after.zones.every((z) => MCI_COLORS.every((c) => z.inZone[c] >= 0)) &&
    after.areas.every((a) => MCI_COLORS.every((c) => a.inTreatment[c] >= 0));
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
    return [
      entry.kind,
      entry.color,
      entry.n !== undefined ? String(entry.n) : undefined,
      area ? `${entry.kind === 'transported' ? 'from' : 'to'} ${area}` : undefined,
      entry.unit ? `by ${entry.unit}` : undefined,
      entry.destination ? `to ${entry.destination}` : undefined,
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
    const scope = zoneName(scopeEntry.zoneId) ?? (scopeEntry.kind === 'transported' ? areaName(scopeEntry.areaId) : undefined) ?? '-';
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
