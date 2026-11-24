import { sha256Hex } from '@/lib/sha256';
import { isArrayRemove, isArrayUnion } from '../types';

/**
 * Firestore-style nested paths on PocketBase, whose collections are flat. A document under an event
 * (`events/{e}/mci/state`) or in a collection PocketBase has no table for (`roleAccountIndex/{uid}`)
 * is one record in EVENT_DOCS:
 * - `path`: its collection path (`events/{e}/mci`);
 * - `kind`: the last segment of that path (`mci`), what the API rules look at;
 * - `key`: its document id (`state`);
 * - `event`: the event it belongs to (from the path, or the document's `eventId`), for the rules;
 * - `owner`: the document's `uid`, if any (a receipt's login), for the rules;
 * - `data`: the document itself.
 * The record id is the first 15 hex characters of sha256(`path/key`), so the browser and the server
 * find a document's record without a lookup. Every other collection maps to itself.
 */
export const EVENT_DOCS = 'event_docs';

/** Top-level collections stored in EVENT_DOCS rather than a table of their own. */
const MAPPED_ROOTS = new Set(['roleAccountIndex']);

export interface PbDocRef {
  collection: string;
  id: string;
  /** Set for documents stored in EVENT_DOCS. */
  nested?: { path: string; kind: string; key: string; event: string };
}

export const isNestedCollection = (col: string) => col.includes('/') || MAPPED_ROOTS.has(col);

export function nestedRecordId(col: string, key: string): string {
  return sha256Hex(`${col}/${key}`).slice(0, 15);
}

export function pbDocRef(col: string, id: string): PbDocRef {
  if (!isNestedCollection(col)) return { collection: col, id };
  const segments = col.split('/');
  const event = segments[0] === 'events' && segments.length > 1 ? segments[1] : '';
  return { collection: EVENT_DOCS, id: nestedRecordId(col, id), nested: { path: col, kind: segments[segments.length - 1], key: id, event } };
}

/** A document's EVENT_DOCS record body. */
export function nestedRecord(ref: PbDocRef, data: Record<string, unknown>): Record<string, unknown> {
  const n = ref.nested!;
  const event = n.event || (typeof data.eventId === 'string' ? data.eventId : '');
  return { id: ref.id, path: n.path, kind: n.kind, key: n.key, event, owner: typeof data.uid === 'string' ? data.uid : '', data };
}

/** The document an EVENT_DOCS record holds, and its id. */
export function fromNestedRecord(record: Record<string, unknown>): { id: string; data: Record<string, unknown> } {
  return { id: String(record.key ?? record.id), data: (record.data as Record<string, unknown> | null) ?? {} };
}

/** A filter for every record in one nested collection. */
export const nestedCollectionFilter = (col: string) => `path = "${col.replace(/["\\]/g, '')}"`;

/**
 * Applies an update patch the way Firestore's update does: dotted keys reach into maps
 * (`member.lastActiveAt`), and array union/remove sentinels apply to the current array.
 */
export function applyUpdate(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = structuredClone(current);
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split('.');
    let target = next;
    for (const key of keys.slice(0, -1)) {
      const child = target[key];
      if (!child || typeof child !== 'object' || Array.isArray(child)) target[key] = {};
      target = target[key] as Record<string, unknown>;
    }
    const last = keys[keys.length - 1];
    const existing = Array.isArray(target[last]) ? (target[last] as unknown[]) : [];
    const has = (list: unknown[], item: unknown) => list.some((e) => JSON.stringify(e) === JSON.stringify(item));
    if (isArrayUnion(value)) target[last] = [...existing, ...value.items.filter((item) => !has(existing, item))];
    else if (isArrayRemove(value)) target[last] = existing.filter((e) => !has(value.items, e));
    else target[last] = value;
  }
  return next;
}

/** A set with merge: maps merge key by key, all the way down; anything else replaces. */
export function mergeDeep(current: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(data)) {
    const prev = out[key];
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value) && prev && typeof prev === 'object' && !Array.isArray(prev)
        ? mergeDeep(prev as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }
  return out;
}
