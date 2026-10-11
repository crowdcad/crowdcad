'use client';

import type {
  Call,
  Clinic,
  DispatchZone,
  Equipment,
  EventEquipment,
  PostAssignment,
  Post,
  Staff,
  Supervisor,
  Zone,
} from '@/app/types';
import type { MapArea } from '@/lib/geo/types';

const DB_NAME = 'crowdcad-lite';
const DB_VERSION = 1;
const EVENTS_STORE = 'events';
const LEGACY_STORAGE_PREFIX = 'lite_event_';

const hasIndexedDb = () =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const hasLocalStorage = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export interface LiteVenueSetup {
  name: string;
  posts: Post[];
  equipment: Equipment[];
  /** The event's area on the live map (coordinates, no image); posts placed on it carry lat/lng. Needs internet to show. */
  area?: MapArea;
  /** Areas drawn on that map (some flagged as dispatch zones). */
  zones?: Zone[];
}

export interface LiteEventDraft {
  id: string;
  mode: 'lite';
  name: string;
  date: string;
  postingScheduleEnabled?: boolean;
  scheduleConfig: {
    from: string;
    to: string;
    by: string;
  };
  venue: LiteVenueSetup;
  postingTimes: string[];
  staff: Staff[];
  supervisor: Supervisor[];
  eventPosts: Post[];
  postAssignments?: PostAssignment;
  pendingAssignments?: {
    [team: string]: { post: string; time: string };
  };
  eventEquipment: EventEquipment[];
  calls: Call[];
  clinics?: Clinic[];
  dispatchZones?: DispatchZone[];
  status: 'draft' | 'active';
  createdAt: string;
  updatedAt: string;
  surgeLimitPercent?: number;
  pendingTransportSurgeThreshold?: number;
  unassignedCallSurgeSeconds?: number;
  scheduleStart?: string | number;
  scheduleEnd?: string | number;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openLiteDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EVENTS_STORE)) {
        db.createObjectStore(EVENTS_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function fallbackSaveToLocalStorage(event: LiteEventDraft): void {
  if (!hasLocalStorage()) return;
  window.localStorage.setItem(`${LEGACY_STORAGE_PREFIX}${event.id}`, JSON.stringify(event));
}

function fallbackReadFromLocalStorage(id: string): LiteEventDraft | null {
  if (!hasLocalStorage()) return null;
  const raw = window.localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${id}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LiteEventDraft;
  } catch {
    return null;
  }
}

function fallbackDeleteFromLocalStorage(id: string): void {
  if (!hasLocalStorage()) return;
  window.localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}${id}`);
}

function fallbackListFromLocalStorage(): LiteEventDraft[] {
  if (!hasLocalStorage()) return [];

  const events: LiteEventDraft[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(LEGACY_STORAGE_PREFIX)) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      events.push(JSON.parse(raw) as LiteEventDraft);
    } catch {
      continue;
    }
  }

  return events.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function generateLiteEventId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);

  return `local_${Date.now()}_${random}`;
}

export function createDefaultLiteEventDraft(eventId: string, eventName = ''): LiteEventDraft {
  const now = new Date().toISOString();
  return {
    id: eventId,
    mode: 'lite',
    name: eventName,
    date: now.split('T')[0],
    postingScheduleEnabled: true,
    scheduleConfig: {
      from: '16:00',
      to: '23:59',
      by: '75',
    },
    venue: {
      name: 'Lite Event',
      posts: [],
      equipment: [],
    },
    postingTimes: [],
    staff: [],
    supervisor: [],
    eventPosts: [],
    postAssignments: {},
    pendingAssignments: {},
    eventEquipment: [],
    calls: [],
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    surgeLimitPercent: 70,
    pendingTransportSurgeThreshold: 3,
    unassignedCallSurgeSeconds: 120,
  };
}

export async function saveLiteEvent(event: LiteEventDraft): Promise<void> {
  const withUpdatedAt: LiteEventDraft = {
    ...event,
    updatedAt: new Date().toISOString(),
  };

  try {
    const db = await openLiteDb();
    const transaction = db.transaction(EVENTS_STORE, 'readwrite');
    const store = transaction.objectStore(EVENTS_STORE);
    store.put(withUpdatedAt);
    await transactionComplete(transaction);
    db.close();
    fallbackSaveToLocalStorage(withUpdatedAt);
  } catch {
    fallbackSaveToLocalStorage(withUpdatedAt);
  }
}

export async function getLiteEvent(eventId: string): Promise<LiteEventDraft | null> {
  try {
    const db = await openLiteDb();
    const transaction = db.transaction(EVENTS_STORE, 'readonly');
    const store = transaction.objectStore(EVENTS_STORE);
    const result = await requestToPromise<LiteEventDraft | undefined>(store.get(eventId));
    db.close();
    if (result) return result;
  } catch {
    // no-op, fallback below
  }

  return fallbackReadFromLocalStorage(eventId);
}

export async function listLiteEvents(): Promise<LiteEventDraft[]> {
  try {
    const db = await openLiteDb();
    const transaction = db.transaction(EVENTS_STORE, 'readonly');
    const store = transaction.objectStore(EVENTS_STORE);
    const result = await requestToPromise<LiteEventDraft[]>(store.getAll());
    db.close();

    if (Array.isArray(result) && result.length > 0) {
      return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
  } catch {
    // no-op, fallback below
  }

  return fallbackListFromLocalStorage();
}

export async function deleteLiteEvent(eventId: string): Promise<void> {
  try {
    const db = await openLiteDb();
    const transaction = db.transaction(EVENTS_STORE, 'readwrite');
    const store = transaction.objectStore(EVENTS_STORE);
    store.delete(eventId);
    await transactionComplete(transaction);
    db.close();
  } catch {
    // no-op, fallback below
  }

  fallbackDeleteFromLocalStorage(eventId);
}

/**
 * Dispatch update helpers — all mutations persist immediately to local storage
 */

export async function updateLiteEventStatus(eventId: string, status: 'draft' | 'active'): Promise<LiteEventDraft | null> {
  const event = await getLiteEvent(eventId);
  if (!event) return null;

  const updated = { ...event, status };
  await saveLiteEvent(updated);
  return updated;
}

export async function addLiteCall(eventId: string, call: Call): Promise<LiteEventDraft | null> {
  const event = await getLiteEvent(eventId);
  if (!event) return null;

  const updated = {
    ...event,
    calls: [...event.calls, call],
  };
  await saveLiteEvent(updated);
  return updated;
}

export async function updateLiteCall(eventId: string, callId: string, updates: Partial<Call>): Promise<LiteEventDraft | null> {
  const event = await getLiteEvent(eventId);
  if (!event) return null;

  const updated = {
    ...event,
    calls: event.calls.map((c) => (c.id === callId ? { ...c, ...updates } : c)),
  };
  await saveLiteEvent(updated);
  return updated;
}

export async function deleteLiteCall(eventId: string, callId: string): Promise<LiteEventDraft | null> {
  const event = await getLiteEvent(eventId);
  if (!event) return null;

  const updated = {
    ...event,
    calls: event.calls.filter((c) => c.id !== callId),
  };
  await saveLiteEvent(updated);
  return updated;
}

export async function updateLiteTeamStatus(
  eventId: string,
  teamName: string,
  status: string,
  location?: string
): Promise<LiteEventDraft | null> {
  const event = await getLiteEvent(eventId);
  if (!event) return null;

  const updated = {
    ...event,
    staff: event.staff.map((team) => {
      if (team.team === teamName) {
        return { ...team, status, location: location ?? team.location };
      }
      return team;
    }),
  };
  await saveLiteEvent(updated);
  return updated;
}

export async function updateLiteSupervisorStatus(
  eventId: string,
  supervisorTeam: string,
  status: string,
  location?: string
): Promise<LiteEventDraft | null> {
  const event = await getLiteEvent(eventId);
  if (!event) return null;

  const updated = {
    ...event,
    supervisor: event.supervisor.map((sup) => {
      if (sup.team === supervisorTeam) {
        return { ...sup, status, location: location ?? sup.location };
      }
      return sup;
    }),
  };
  await saveLiteEvent(updated);
  return updated;
}

export async function updateLiteEquipmentStatus(
  eventId: string,
  equipmentId: string,
  status: string,
  assignedTeam?: string | null,
  location?: string
): Promise<LiteEventDraft | null> {
  const event = await getLiteEvent(eventId);
  if (!event) return null;

  const updated = {
    ...event,
    eventEquipment: event.eventEquipment.map((eq) => {
      if (eq.id === equipmentId) {
        return {
          ...eq,
          status,
          assignedTeam: assignedTeam ?? eq.assignedTeam,
          location: location ?? eq.location,
        };
      }
      return eq;
    }),
  };
  await saveLiteEvent(updated);
  return updated;
}
