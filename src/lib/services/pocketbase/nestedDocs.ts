import type { DocSnapshot, QueryConstraint, Unsubscribe } from '../types';
import { pb } from './client';
import { toPbServiceError } from './utils';
import { applyUpdate, EVENT_DOCS, fromNestedRecord, mergeDeep, nestedCollectionFilter, nestedRecord, pbDocRef } from './docPaths';

/**
 * Nested (Firestore-style) documents on PocketBase, stored in EVENT_DOCS (see docPaths.ts). Used by
 * PocketbaseDbService for any collection path with a `/` in it.
 */

const col = () => pb.collection(EVENT_DOCS);

function snapshotOf<T>(record: Record<string, unknown>): DocSnapshot<T> {
  const { id, data } = fromNestedRecord(record);
  return { id, exists: true, data: data as T };
}

async function readRecord(path: string, id: string): Promise<Record<string, unknown> | null> {
  try {
    return (await col().getOne(pbDocRef(path, id).id)) as unknown as Record<string, unknown>;
  } catch (err) {
    const sErr = toPbServiceError(err);
    if (sErr.code === 'not-found') return null;
    throw sErr;
  }
}

export async function getNested<T>(path: string, id: string): Promise<DocSnapshot<T>> {
  const record = await readRecord(path, id);
  return record ? snapshotOf<T>(record) : { id, exists: false, data: null };
}

async function write(path: string, id: string, data: Record<string, unknown>, existed: boolean): Promise<void> {
  const ref = pbDocRef(path, id);
  const body = nestedRecord(ref, data);
  try {
    if (existed) await col().update(ref.id, body);
    else await col().create(body);
  } catch (err) {
    throw toPbServiceError(err);
  }
}

export async function setNested(path: string, id: string, data: Record<string, unknown>, merge: boolean): Promise<void> {
  const record = await readRecord(path, id);
  const current = record ? fromNestedRecord(record).data : {};
  await write(path, id, merge ? mergeDeep(current, data) : data, !!record);
}

export async function updateNested(path: string, id: string, patch: Record<string, unknown>): Promise<void> {
  const record = await readRecord(path, id);
  if (!record) throw toPbServiceError({ status: 404, message: `No document at ${path}/${id}` });
  await write(path, id, applyUpdate(fromNestedRecord(record).data, patch), true);
}

export async function deleteNested(path: string, id: string): Promise<void> {
  try {
    await col().delete(pbDocRef(path, id).id);
  } catch (err) {
    const sErr = toPbServiceError(err);
    if (sErr.code !== 'not-found') throw sErr;
  }
}

/** A query's constraints, on the document's fields (inside `data`). */
function filterOf(path: string, constraints: QueryConstraint[]): string {
  const parts = [nestedCollectionFilter(path)];
  for (const c of constraints) {
    const field = `data.${c.field}`;
    if (c.op === '==') parts.push(pb.filter(`${field} = {:val}`, { val: c.value }));
    else if (c.op === '!=') parts.push(pb.filter(`${field} != {:val}`, { val: c.value }));
    else if (c.op === '>=') parts.push(pb.filter(`${field} >= {:val}`, { val: c.value }));
    else if (c.op === 'array-contains') parts.push(pb.filter(`${field} ~ {:val}`, { val: c.value }));
  }
  return parts.join(' && ');
}

export async function queryNested<T>(path: string, constraints: QueryConstraint[]): Promise<DocSnapshot<T>[]> {
  try {
    const records = await col().getFullList({ filter: filterOf(path, constraints) });
    return records.map((r) => snapshotOf<T>(r as unknown as Record<string, unknown>));
  } catch (err) {
    throw toPbServiceError(err);
  }
}

/**
 * A live document. A missing one is reported at once (exists: false), like Firestore; its creation
 * arrives later through the subscription. Each subscriber removes only its own listener.
 */
export function subscribeNested<T>(path: string, id: string, callback: (s: DocSnapshot<T>) => void, onError?: (e: Error) => void): Unsubscribe {
  const recordId = pbDocRef(path, id).id;
  let cancelled = false;
  let live = false;
  let stop: (() => Promise<void>) | null = null;
  col()
    .subscribe(recordId, (e: { action: string; record: unknown }) => {
      if (cancelled) return;
      live = true;
      callback(e.action === 'delete' ? { id, exists: false, data: null } : snapshotOf<T>(e.record as Record<string, unknown>));
    })
    .then((unsub) => (cancelled ? void unsub() : (stop = unsub)))
    .catch((err: unknown) => onError?.(toPbServiceError(err)));
  getNested<T>(path, id)
    .then((snap) => {
      if (!cancelled && !live) callback(snap);
    })
    .catch((err: unknown) => {
      if (!cancelled) onError?.(err as Error);
    });
  return () => {
    cancelled = true;
    void stop?.();
  };
}

/** A live query over one nested collection: re-read whenever one of its records changes. */
export function subscribeNestedQuery<T>(path: string, constraints: QueryConstraint[], callback: (s: DocSnapshot<T>[]) => void, onError?: (e: Error) => void): Unsubscribe {
  let cancelled = false;
  let stop: (() => Promise<void>) | null = null;
  const refetch = () =>
    queryNested<T>(path, constraints)
      .then((snaps) => {
        if (!cancelled) callback(snaps);
      })
      .catch((err: unknown) => {
        if (!cancelled) onError?.(err as Error);
      });
  void refetch();
  col()
    .subscribe('*', () => (cancelled ? undefined : void refetch()), { filter: nestedCollectionFilter(path) })
    .then((unsub) => (cancelled ? void unsub() : (stop = unsub)))
    .catch((err: unknown) => onError?.(toPbServiceError(err)));
  return () => {
    cancelled = true;
    void stop?.();
  };
}
