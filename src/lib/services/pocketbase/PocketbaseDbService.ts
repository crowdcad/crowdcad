import { pb } from './client';
import type { IDbService } from '../IDbService';
import type { DocSnapshot, QueryConstraint, TransactionContext, Unsubscribe } from '../types';
import { isArrayUnion, isArrayRemove } from '../types';
import { toPbServiceError } from './utils';

function toSnapshot<T>(record: Record<string, unknown>): DocSnapshot<T> {
  return { id: record.id as string, exists: true, data: record as T };
}

/** Build a PocketBase filter string from QueryConstraints using pb.filter() for safe value escaping. */
function buildFilter(constraints: QueryConstraint[]): string {
  if (!constraints.length) return '';
  return constraints
    .map((c) => {
      if (c.op === '==') return pb.filter(`${c.field} = {:val}`, { val: c.value });
      if (c.op === '!=') return pb.filter(`${c.field} != {:val}`, { val: c.value });
      if (c.op === '>=') return pb.filter(`${c.field} >= {:val}`, { val: c.value });
      if (c.op === 'array-contains') return pb.filter(`${c.field} ~ {:val}`, { val: c.value });
      return '';
    })
    .filter(Boolean)
    .join(' && ');
}

export class PocketbaseDbService implements IDbService {
  async getDocument<T>(col: string, id: string): Promise<DocSnapshot<T>> {
    try {
      const record = await pb.collection(col).getOne(id);
      return toSnapshot<T>(record as unknown as Record<string, unknown>);
    } catch (err) {
      const sErr = toPbServiceError(err);
      if (sErr.code === 'not-found') return { id, exists: false, data: null };
      throw sErr;
    }
  }

  async getCollection<T>(col: string): Promise<DocSnapshot<T>[]> {
    try {
      const records = await pb.collection(col).getFullList();
      return records.map((r: unknown) => toSnapshot<T>(r as unknown as Record<string, unknown>));
    } catch (err) {
      throw toPbServiceError(err);
    }
  }

  async queryCollection<T>(col: string, constraints: QueryConstraint[]): Promise<DocSnapshot<T>[]> {
    try {
      const filter = buildFilter(constraints);
      const records = await pb.collection(col).getFullList({ filter: filter || undefined });
      return records.map((r: unknown) => toSnapshot<T>(r as unknown as Record<string, unknown>));
    } catch (err) {
      throw toPbServiceError(err);
    }
  }

  async addDocument<T>(col: string, data: T): Promise<string> {
    try {
      const record = await pb.collection(col).create(data as Record<string, unknown>);
      return (record as unknown as Record<string, unknown>).id as string;
    } catch (err) {
      throw toPbServiceError(err);
    }
  }

  async setDocument<T>(
    col: string,
    id: string,
    data: Partial<T>,
    options?: { merge?: boolean },
  ): Promise<void> {
    // PocketBase PATCH always merges — only the provided fields are updated.
    // True overwrite (merge === false) is not natively supported; this adapter
    // always patches. All current call-sites pass { merge: true }, so the
    // behaviour is correct. A full overwrite would require a delete + create.
    void options;
    try {
      await pb.collection(col).update(id, data as Record<string, unknown>);
    } catch (updateErr) {
      const sErr = toPbServiceError(updateErr);
      if (sErr.code !== 'not-found') throw sErr;
      try {
        await pb.collection(col).create({ id, ...(data as Record<string, unknown>) });
      } catch (createErr) {
        throw toPbServiceError(createErr);
      }
    }
  }

  async updateDocument(col: string, id: string, data: Record<string, unknown>): Promise<void> {
    const hasArrayOps = Object.values(data).some(
      (v) => isArrayUnion(v) || isArrayRemove(v),
    );

    let resolved = data;

    if (hasArrayOps) {
      const snap = await this.getDocument<Record<string, unknown>>(col, id);
      const current = snap.data ?? {};
      resolved = {};
      for (const [key, value] of Object.entries(data)) {
        if (isArrayUnion(value)) {
          const existing = Array.isArray(current[key]) ? (current[key] as unknown[]) : [];
          const toAdd = value.items.filter(
            (item) => !existing.some((e) => JSON.stringify(e) === JSON.stringify(item)),
          );
          resolved[key] = [...existing, ...toAdd];
        } else if (isArrayRemove(value)) {
          const existing = Array.isArray(current[key]) ? (current[key] as unknown[]) : [];
          resolved[key] = existing.filter(
            (e) => !value.items.some((item) => JSON.stringify(item) === JSON.stringify(e)),
          );
        } else {
          resolved[key] = value;
        }
      }
    }

    try {
      await pb.collection(col).update(id, resolved);
    } catch (err) {
      throw toPbServiceError(err);
    }
  }

  async deleteDocument(col: string, id: string): Promise<void> {
    try {
      await pb.collection(col).delete(id);
    } catch (err) {
      throw toPbServiceError(err);
    }
  }

  /**
   * PocketBase does not support multi-document atomic transactions.
   * This implementation is a sequential read-modify-write. For CrowdCAD's
   * dispatch use case (single document, low write concurrency), this is
   * acceptable. A concurrent write could cause the last writer to win.
   */
  async runTransaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const pendingWrites: Array<() => Promise<void>> = [];

    const ctx: TransactionContext = {
      async get<U>(col: string, id: string): Promise<DocSnapshot<U>> {
        const record = await pb.collection(col).getOne(id);
        return toSnapshot<U>(record as unknown as Record<string, unknown>);
      },
      set<U>(col: string, id: string, data: Partial<U>) {
        pendingWrites.push(async () => {
          try {
            await pb.collection(col).update(id, data as Record<string, unknown>);
          } catch {
            await pb.collection(col).create({ id, ...(data as Record<string, unknown>) });
          }
        });
      },
      update<U>(col: string, id: string, data: Partial<U>) {
        pendingWrites.push(async () => {
          await pb.collection(col).update(id, data as Record<string, unknown>);
        });
      },
      delete(col: string, id: string) {
        pendingWrites.push(async () => {
          await pb.collection(col).delete(id);
        });
      },
    };

    const result = await fn(ctx);
    for (const write of pendingWrites) {
      await write();
    }
    return result;
  }

  subscribeToDocument<T>(
    col: string,
    id: string,
    callback: (snapshot: DocSnapshot<T>) => void,
    onError?: (error: Error) => void,
  ): Unsubscribe {
    let cancelled = false;
    // Prevents a double-fire when an SSE event races ahead of the initial poll.
    // Once either the poll or SSE delivers the first snapshot, this is set to
    // true so the other path becomes a no-op.
    let initialLoadDone = false;

    // Subscribe to SSE immediately so we don't miss any events that arrive
    // while the initial poll is in-flight.
    pb.collection(col).subscribe(id, (event: { action: string; record: unknown }) => {
      if (cancelled) return;
      // SSE beat the poll — mark initial load done so the poll callback is skipped.
      initialLoadDone = true;
      if (event.action === 'delete') {
        callback({ id, exists: false, data: null });
      } else {
        callback(toSnapshot<T>(event.record as unknown as Record<string, unknown>));
      }
    }).catch((err: unknown) => onError?.(toPbServiceError(err)));

    // Poll until the document appears (handles the case where the record was
    // just created and PocketBase's SSE has not emitted the create event yet).
    const POLL_INTERVAL_MS = 100;
    // PocketBase (SQLite WAL) can take several seconds to surface a record
    // that was just written under heavy parallel write load. Give it 30s before
    // concluding the document truly does not exist.
    const GIVE_UP_AFTER_MS = 30_000;
    const deadline = Date.now() + GIVE_UP_AFTER_MS;

    const pollInitial = async () => {
      while (!cancelled && !initialLoadDone) {
        try {
          const record = await pb.collection(col).getOne(id);
          if (!cancelled && !initialLoadDone) {
            initialLoadDone = true;
            callback(toSnapshot<T>(record as unknown as Record<string, unknown>));
          }
          return;
        } catch (err) {
          const sErr = toPbServiceError(err);
          // Only bail immediately on permission errors — those are not transient.
          // Treat not-found, server errors (5xx), and network errors as retryable:
          // PocketBase/SQLite can take several seconds to surface a just-written
          // record under heavy parallel load, and may return transient 5xx errors.
          if (sErr.code === 'permission-denied' || sErr.code === 'unauthenticated') {
            if (!cancelled) onError?.(sErr);
            return;
          }
          if (Date.now() >= deadline) {
            // After the deadline, distinguish "confirmed not-found" from "slow server".
            if (sErr.code === 'not-found') {
              if (!cancelled && !initialLoadDone) callback({ id, exists: false, data: null });
            } else {
              if (!cancelled) onError?.(sErr);
            }
            return;
          }
          await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
        }
      }
    };
    pollInitial();

    return () => {
      cancelled = true;
      pb.collection(col).unsubscribe(id);
    };
  }

  subscribeToQuery<T>(
    col: string,
    constraints: QueryConstraint[],
    callback: (snapshots: DocSnapshot<T>[]) => void,
    onError?: (error: Error) => void,
  ): Unsubscribe {
    let cancelled = false;
    const filter = buildFilter(constraints);

    const refetch = () =>
      pb.collection(col)
        .getFullList({ filter: filter || undefined })
        .then((records: unknown[]) => {
          if (!cancelled)
            callback(records.map((r: unknown) => toSnapshot<T>(r as unknown as Record<string, unknown>)));
        })
        .catch((err: unknown) => { if (!cancelled) onError?.(toPbServiceError(err)); });

    // Initial load
    refetch();

    // Re-fetch on any change in the collection
    pb.collection(col).subscribe('*', () => { if (!cancelled) refetch(); })
      .catch((err: unknown) => onError?.(toPbServiceError(err)));

    return () => {
      cancelled = true;
      pb.collection(col).unsubscribe('*');
    };
  }
}
