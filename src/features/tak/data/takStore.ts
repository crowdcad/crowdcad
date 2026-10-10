import { dbService, isPocketbaseBackend } from '@/lib/services';
import type { DocSnapshot, QueryConstraint } from '@/lib/services/types';
import type { HistorySegment } from '../lib/historyStats';
import type { HistoryMode } from '../types';

/**
 * TAK records for both backends, per docs/tak-integration/data-contract.md.
 * Firebase nests them under bridgeAccounts/{uid} and events/{eventId};
 * PocketBase keeps flat tak_* collections keyed by bridge and event ids.
 * Everything goes through core's dbService, so the active backend's rules
 * apply.
 */

export interface TakBridge {
  /** The bridge account's user id. */
  bridgeUid: string;
  label: string;
  allowedUsers: string[];
  defaultHistoryMode: HistoryMode;
  createdBy: string;
  /** PocketBase record id of the tak_bridges record (Firebase uses bridgeUid). */
  recordId: string;
}

export interface TakBridgeStatus {
  lastSeenAt: number;
  takConnected: boolean;
  version?: string;
  linkedEventCount?: number;
  /** Distinct TAK devices the bridge has seen since it started (bridge 0.2+). */
  devicesSeen?: number;
  /** When the bridge last received a position, or 0. */
  lastPositionAt?: number;
  /** The bridge's last TAK connection problem, in plain words. */
  takError?: string;
}

export interface TakEventConfig {
  bridgeUid: string | null;
  enabled: boolean;
  closed: boolean;
  historyMode: HistoryMode;
}

export interface TakDeviceLink {
  deviceUid: string;
  teamId: string;
  linkedAt: number;
  method: 'auto' | 'manual';
  linkedBy: string;
}

export interface TakLivePosition {
  deviceUid: string;
  lat: number;
  lon: number;
  ce?: number;
  callsign?: string;
  cotType?: string;
  deviceTime: number;
  receivedAt: number;
}

export interface TakEventStatus {
  lastSeenAt: number;
  takConnected: boolean;
  liveDeviceCount: number;
}

export interface TakDeviceMapping {
  deviceUid: string;
  teamName: string;
  callsign?: string;
}

const HISTORY_MODES: readonly HistoryMode[] = ['off', 'summary', 'detailed'];
const asMode = (v: unknown): HistoryMode => (HISTORY_MODES.includes(v as HistoryMode) ? (v as HistoryMode) : 'summary');
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
type Rec = Record<string, unknown>;

/** Device UIDs are URL-encoded as Firestore document ids (data contract, Identifiers). */
export const deviceDocId = (deviceUid: string) => encodeURIComponent(deviceUid);
const deviceUidFromDocId = (id: string) => decodeURIComponent(id);

const fs = {
  config: (e: string) => `events/${e}/takConfig`,
  links: (e: string) => `events/${e}/takDeviceLinks`,
  live: (e: string) => `events/${e}/takLive`,
  status: (e: string) => `events/${e}/takStatus`,
  mappings: (b: string) => `bridgeAccounts/${b}/deviceMappings`,
  bridgeStatus: (b: string) => `bridgeAccounts/${b}/status`,
};

const data = <T,>(snaps: DocSnapshot<T>[]) => snaps.filter((s) => s.data) as (DocSnapshot<T> & { data: T })[];

async function pbFirst(col: string, constraints: QueryConstraint[]): Promise<(DocSnapshot<Rec> & { data: Rec }) | undefined> {
  return data(await dbService.queryCollection<Rec>(col, constraints))[0];
}

/** PocketBase upsert on a natural key: update the matching record, or create one. */
async function pbUpsert(col: string, key: QueryConstraint[], identity: Rec, fields: Rec): Promise<void> {
  const existing = await pbFirst(col, key);
  if (existing) await dbService.updateDocument(col, existing.id, fields);
  else await dbService.addDocument(col, { ...identity, ...fields });
}

// ---------------------------------------------------------------- bridges

function bridgeFromFs(id: string, d: Rec): TakBridge {
  return {
    bridgeUid: id,
    recordId: id,
    label: String(d.label ?? ''),
    allowedUsers: Array.isArray(d.allowedUsers) ? (d.allowedUsers as string[]) : [],
    defaultHistoryMode: asMode(d.defaultHistoryMode),
    createdBy: String(d.createdBy ?? ''),
  };
}

function bridgeFromPb(id: string, d: Rec): TakBridge {
  return { ...bridgeFromFs(String(d.bridgeUser ?? ''), d), recordId: id };
}

/** Every bridge (admins). */
export async function listAllBridges(): Promise<TakBridge[]> {
  if (isPocketbaseBackend) return data(await dbService.getCollection<Rec>('tak_bridges')).map((s) => bridgeFromPb(s.id, s.data));
  return data(await dbService.getCollection<Rec>('bridgeAccounts')).map((s) => bridgeFromFs(s.id, s.data));
}

/** Bridges the user may link to their events. */
export async function listAllowedBridges(uid: string): Promise<TakBridge[]> {
  if (isPocketbaseBackend) {
    const all = data(await dbService.getCollection<Rec>('tak_bridges')).map((s) => bridgeFromPb(s.id, s.data));
    return all.filter((b) => b.allowedUsers.includes(uid));
  }
  const snaps = await dbService.queryCollection<Rec>('bridgeAccounts', [{ field: 'allowedUsers', op: 'array-contains', value: uid }]);
  return data(snaps).map((s) => bridgeFromFs(s.id, s.data));
}

export async function createBridgeRecord(
  bridgeUid: string,
  fields: { label: string; allowedUsers: string[]; defaultHistoryMode: HistoryMode; createdBy: string },
): Promise<void> {
  const now = Date.now();
  if (isPocketbaseBackend) {
    await dbService.addDocument('tak_bridges', { bridgeUser: bridgeUid, ...fields });
    return;
  }
  await dbService.setDocument('bridgeAccounts', bridgeUid, { ...fields, createdAt: now, updatedAt: now });
}

export async function updateBridge(
  bridge: TakBridge,
  fields: Partial<Pick<TakBridge, 'label' | 'allowedUsers' | 'defaultHistoryMode'>>,
): Promise<void> {
  if (isPocketbaseBackend) {
    await dbService.updateDocument('tak_bridges', bridge.recordId, fields as Rec);
    return;
  }
  await dbService.updateDocument('bridgeAccounts', bridge.bridgeUid, { ...fields, updatedAt: Date.now() });
}

/** Revokes a bridge: deleting its record removes all of its access. */
export async function revokeBridge(bridge: TakBridge): Promise<void> {
  if (isPocketbaseBackend) await dbService.deleteDocument('tak_bridges', bridge.recordId);
  else await dbService.deleteDocument('bridgeAccounts', bridge.bridgeUid);
}

export function subscribeBridgeStatus(bridgeUid: string, cb: (s: TakBridgeStatus | null) => void, onError?: (e: Error) => void) {
  if (isPocketbaseBackend) {
    return dbService.subscribeToQuery<Rec>('tak_bridge_status', [{ field: 'bridge', op: '==', value: bridgeUid }], (snaps) => {
      const d = data(snaps)[0]?.data;
      cb(d ? toBridgeStatus(d) : null);
    }, onError);
  }
  return dbService.subscribeToDocument<Rec>(fs.bridgeStatus(bridgeUid), 'current', (snap) => cb(snap.data ? toBridgeStatus(snap.data) : null), onError);
}

function toBridgeStatus(d: Rec): TakBridgeStatus {
  return {
    lastSeenAt: num(d.lastSeenAt),
    takConnected: d.takConnected === true,
    version: typeof d.version === 'string' ? d.version : undefined,
    linkedEventCount: num(d.linkedEventCount),
    devicesSeen: typeof d.devicesSeen === 'number' ? d.devicesSeen : undefined,
    lastPositionAt: typeof d.lastPositionAt === 'number' ? d.lastPositionAt : undefined,
    takError: typeof d.takError === 'string' && d.takError ? d.takError : undefined,
  };
}

// -------------------------------------------------------------- mappings

export async function listMappings(bridgeUid: string): Promise<TakDeviceMapping[]> {
  if (isPocketbaseBackend) {
    const snaps = await dbService.queryCollection<Rec>('tak_device_mappings', [{ field: 'bridge', op: '==', value: bridgeUid }]);
    return data(snaps).map((s) => ({ deviceUid: String(s.data.deviceUid), teamName: String(s.data.teamName), callsign: s.data.callsign as string | undefined }));
  }
  const snaps = await dbService.getCollection<Rec>(fs.mappings(bridgeUid));
  return data(snaps).map((s) => ({ deviceUid: deviceUidFromDocId(s.id), teamName: String(s.data.teamName), callsign: s.data.callsign as string | undefined }));
}

export async function rememberMapping(bridgeUid: string, m: TakDeviceMapping, updatedBy: string): Promise<void> {
  const fields: Rec = { teamName: m.teamName, updatedBy, ...(m.callsign ? { callsign: m.callsign } : {}) };
  if (isPocketbaseBackend) {
    await pbUpsert(
      'tak_device_mappings',
      [{ field: 'bridge', op: '==', value: bridgeUid }, { field: 'deviceUid', op: '==', value: m.deviceUid }],
      { bridge: bridgeUid, deviceUid: m.deviceUid },
      fields,
    );
    return;
  }
  await dbService.setDocument(fs.mappings(bridgeUid), deviceDocId(m.deviceUid), { ...fields, updatedAt: Date.now() });
}

export async function forgetMapping(bridgeUid: string, deviceUid: string): Promise<void> {
  if (isPocketbaseBackend) {
    const existing = await pbFirst('tak_device_mappings', [
      { field: 'bridge', op: '==', value: bridgeUid },
      { field: 'deviceUid', op: '==', value: deviceUid },
    ]);
    if (existing) await dbService.deleteDocument('tak_device_mappings', existing.id);
    return;
  }
  await dbService.deleteDocument(fs.mappings(bridgeUid), deviceDocId(deviceUid));
}

// ---------------------------------------------------------- event config

function toConfig(d: Rec): TakEventConfig {
  const bridge = (isPocketbaseBackend ? d.bridge : d.bridgeUid) as unknown;
  return {
    bridgeUid: typeof bridge === 'string' && bridge !== '' ? bridge : null,
    enabled: d.enabled === true,
    closed: d.closed === true,
    historyMode: asMode(d.historyMode),
  };
}

export async function getEventConfig(eventId: string): Promise<TakEventConfig | null> {
  if (isPocketbaseBackend) {
    const r = await pbFirst('tak_event_config', [{ field: 'event', op: '==', value: eventId }]);
    return r ? toConfig(r.data) : null;
  }
  const snap = await dbService.getDocument<Rec>(fs.config(eventId), 'current');
  return snap.exists && snap.data ? toConfig(snap.data) : null;
}

export async function saveEventConfig(eventId: string, config: TakEventConfig): Promise<void> {
  if (isPocketbaseBackend) {
    await pbUpsert(
      'tak_event_config',
      [{ field: 'event', op: '==', value: eventId }],
      { event: eventId },
      { bridge: config.bridgeUid ?? '', enabled: config.enabled, closed: config.closed, historyMode: config.historyMode },
    );
    return;
  }
  await dbService.setDocument(fs.config(eventId), 'current', { eventId, ...config, updatedAt: Date.now() });
}

/** Marks the event's TAK config closed (end-event flow). Only the closed flag changes. */
export async function closeEventConfig(eventId: string): Promise<void> {
  if (isPocketbaseBackend) {
    const r = await pbFirst('tak_event_config', [{ field: 'event', op: '==', value: eventId }]);
    if (r) await dbService.updateDocument('tak_event_config', r.id, { closed: true });
    return;
  }
  const snap = await dbService.getDocument<Rec>(fs.config(eventId), 'current');
  if (snap.exists) await dbService.updateDocument(fs.config(eventId), 'current', { closed: true, updatedAt: Date.now() });
}

export async function deleteEventConfig(eventId: string): Promise<void> {
  if (isPocketbaseBackend) {
    const r = await pbFirst('tak_event_config', [{ field: 'event', op: '==', value: eventId }]);
    if (r) await dbService.deleteDocument('tak_event_config', r.id);
    return;
  }
  const snap = await dbService.getDocument<Rec>(fs.config(eventId), 'current');
  if (snap.exists) await dbService.deleteDocument(fs.config(eventId), 'current');
}

export function subscribeEventConfig(eventId: string, cb: (c: TakEventConfig | null) => void, onError?: (e: Error) => void) {
  if (isPocketbaseBackend) {
    return dbService.subscribeToQuery<Rec>('tak_event_config', [{ field: 'event', op: '==', value: eventId }], (snaps) => {
      const d = data(snaps)[0]?.data;
      cb(d ? toConfig(d) : null);
    }, onError);
  }
  return dbService.subscribeToDocument<Rec>(fs.config(eventId), 'current', (snap) => cb(snap.exists && snap.data ? toConfig(snap.data) : null), onError);
}

// ------------------------------------------------------ links, live, status

function toLink(deviceUid: string, d: Rec): TakDeviceLink {
  return {
    deviceUid,
    teamId: String(d.teamId ?? ''),
    linkedAt: num(d.linkedAt),
    method: d.method === 'auto' ? 'auto' : 'manual',
    linkedBy: String(d.linkedBy ?? ''),
  };
}

export function subscribeDeviceLinks(eventId: string, cb: (links: TakDeviceLink[]) => void, onError?: (e: Error) => void) {
  if (isPocketbaseBackend) {
    return dbService.subscribeToQuery<Rec>('tak_device_links', [{ field: 'event', op: '==', value: eventId }], (snaps) =>
      cb(data(snaps).map((s) => toLink(String(s.data.deviceUid), s.data))), onError);
  }
  return dbService.subscribeToQuery<Rec>(fs.links(eventId), [], (snaps) =>
    cb(data(snaps).map((s) => toLink(deviceUidFromDocId(s.id), s.data))), onError);
}

export async function linkDevice(eventId: string, deviceUid: string, teamId: string, method: 'auto' | 'manual', linkedBy: string): Promise<void> {
  const fields: Rec = { teamId, linkedAt: Date.now(), method, linkedBy };
  if (isPocketbaseBackend) {
    await pbUpsert(
      'tak_device_links',
      [{ field: 'event', op: '==', value: eventId }, { field: 'deviceUid', op: '==', value: deviceUid }],
      { event: eventId, deviceUid },
      fields,
    );
    return;
  }
  await dbService.setDocument(fs.links(eventId), deviceDocId(deviceUid), fields);
}

export async function unlinkDevice(eventId: string, deviceUid: string): Promise<void> {
  if (isPocketbaseBackend) {
    const r = await pbFirst('tak_device_links', [
      { field: 'event', op: '==', value: eventId },
      { field: 'deviceUid', op: '==', value: deviceUid },
    ]);
    if (r) await dbService.deleteDocument('tak_device_links', r.id);
    return;
  }
  await dbService.deleteDocument(fs.links(eventId), deviceDocId(deviceUid));
}

function toLive(deviceUid: string, d: Rec): TakLivePosition {
  return {
    deviceUid,
    lat: num(d.lat),
    lon: num(d.lon),
    ce: typeof d.ce === 'number' ? d.ce : undefined,
    callsign: typeof d.callsign === 'string' ? d.callsign : undefined,
    cotType: typeof d.cotType === 'string' ? d.cotType : undefined,
    deviceTime: num(d.deviceTime),
    receivedAt: num(d.receivedAt),
  };
}

export function subscribeLive(eventId: string, cb: (live: TakLivePosition[]) => void, onError?: (e: Error) => void) {
  if (isPocketbaseBackend) {
    return dbService.subscribeToQuery<Rec>('tak_live', [{ field: 'event', op: '==', value: eventId }], (snaps) =>
      cb(data(snaps).map((s) => toLive(String(s.data.deviceUid), s.data))), onError);
  }
  return dbService.subscribeToQuery<Rec>(fs.live(eventId), [], (snaps) =>
    cb(data(snaps).map((s) => toLive(deviceUidFromDocId(s.id), s.data))), onError);
}

/** The owner clears live docs when unlinking a bridge (the bridge stops writing once unlinked). */
export async function clearLive(eventId: string): Promise<void> {
  if (isPocketbaseBackend) {
    const snaps = await dbService.queryCollection<Rec>('tak_live', [{ field: 'event', op: '==', value: eventId }]);
    for (const s of snaps) await dbService.deleteDocument('tak_live', s.id);
    return;
  }
  const snaps = await dbService.getCollection<Rec>(fs.live(eventId));
  for (const s of snaps) await dbService.deleteDocument(fs.live(eventId), s.id);
}

export function subscribeEventStatus(eventId: string, cb: (s: TakEventStatus | null) => void, onError?: (e: Error) => void) {
  const toStatus = (d: Rec): TakEventStatus => ({
    lastSeenAt: num(d.lastSeenAt),
    takConnected: d.takConnected === true,
    liveDeviceCount: num(d.liveDeviceCount),
  });
  if (isPocketbaseBackend) {
    return dbService.subscribeToQuery<Rec>('tak_event_status', [{ field: 'event', op: '==', value: eventId }], (snaps) => {
      const d = data(snaps)[0]?.data;
      cb(d ? toStatus(d) : null);
    }, onError);
  }
  return dbService.subscribeToDocument<Rec>(fs.status(eventId), 'current', (snap) => cb(snap.data ? toStatus(snap.data) : null), onError);
}

// ---------------------------------------------------------------- history

/** History segments for an event. Only the event owner can read them (v1). */
export async function loadHistory(eventId: string): Promise<HistorySegment[]> {
  const toSeg = (id: string, d: Rec): HistorySegment => ({
    segmentId: typeof d.segmentId === 'string' ? d.segmentId : decodeURIComponent(id),
    deviceUid: String(d.deviceUid ?? ''),
    teamId: String(d.teamId ?? ''),
    startedAt: num(d.startedAt),
    // PocketBase stores an open segment's endedAt as 0.
    endedAt: typeof d.endedAt === 'number' && d.endedAt > 0 ? d.endedAt : null,
    windows: Array.isArray(d.windows) ? (d.windows as HistorySegment['windows']) : [],
    grid: (d.grid as HistorySegment['grid']) ?? { cellM: 5, originLat: 0, originLon: 0, cells: {} },
  });
  if (isPocketbaseBackend) {
    const snaps = await dbService.queryCollection<Rec>('tak_history', [{ field: 'event', op: '==', value: eventId }]);
    return data(snaps).map((s) => toSeg(s.id, s.data));
  }
  const snaps = await dbService.getCollection<Rec>(`events/${eventId}/takHistory`);
  return data(snaps).map((s) => toSeg(s.id, s.data));
}

// ------------------------------------------------------------ call state

/** Publishes which teams are on a call (opaque ids only) for Detailed history. */
export async function saveCallState(eventId: string, teamIdsOnCall: string[]): Promise<void> {
  const fields = { teamIdsOnCall, updatedAt: Date.now() };
  if (isPocketbaseBackend) {
    await pbUpsert('tak_call_state', [{ field: 'event', op: '==', value: eventId }], { event: eventId }, fields);
    return;
  }
  await dbService.setDocument(`events/${eventId}/takCallState`, 'current', fields);
}

// ------------------------------------------------------------------ users

/** Finds a user's id by email (admins; used to fill allowedUsers). */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const value = email.trim().toLowerCase();
  if (!value) return null;
  const snaps = await dbService.queryCollection<Rec>('users', [{ field: 'email', op: '==', value }]);
  return snaps[0]?.id ?? null;
}

export async function getUserEmails(uids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const uid of uids) {
    try {
      const snap = await dbService.getDocument<Rec>('users', uid);
      if (snap.data && typeof snap.data.email === 'string') out[uid] = snap.data.email;
    } catch {
      // Unknown or unreadable user: shown by id.
    }
  }
  return out;
}
