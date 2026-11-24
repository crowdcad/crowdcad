import PocketBase, { ClientResponseError } from 'pocketbase';
import { applyUpdate, EVENT_DOCS, fromNestedRecord, isNestedCollection, mergeDeep, nestedRecord, pbDocRef, type PbDocRef } from '@/lib/services/pocketbase/docPaths';
import { ServerAuthError, ServerConfigError, type ServerDoc, type ServerStore, type ServerTx } from './serverStore';

/**
 * The server routes' store on PocketBase: a superuser client (PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD at
 * PB_URL, else NEXT_PUBLIC_POCKETBASE_URL). Documents under an event map to EVENT_DOCS (docPaths.ts).
 *
 * PocketBase has no read-write transactions. A transaction here holds a lock per key in this process,
 * reads, then commits its writes in one batch request (all or nothing). Self-hosted PocketBase runs one
 * Next.js server, so every change that goes through the routes is serialized.
 */

const SYSTEM_FIELDS = ['collectionId', 'collectionName', 'created', 'updated', 'expand'];

function serverUrl(): string {
  return process.env.PB_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
}

function splitPath(path: string): { col: string; id: string } {
  const at = path.lastIndexOf('/');
  return { col: path.slice(0, at), id: path.slice(at + 1) };
}

export const isMissing = (err: unknown) => err instanceof ClientResponseError && err.status === 404;

/** A native record as a document: its own fields, without PocketBase's. */
function plain(record: Record<string, unknown>): Record<string, unknown> {
  const out = { ...record };
  for (const key of SYSTEM_FIELDS) delete out[key];
  return out;
}

/** Locks per key: each run waits for the one before it. */
const locks = new Map<string, Promise<void>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const before = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = before.then(() => new Promise<void>((resolve) => (release = resolve)));
  locks.set(key, mine);
  await before;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === mine) locks.delete(key);
  }
}

function tokenPayload(token: string): { id?: string; collectionId?: string; type?: string } {
  try {
    const part = token.split('.')[1] ?? '';
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

/** A signed-in superuser client, signed in again when its token runs out. ServerConfigError without credentials. */
export async function pocketbaseSuperuser(): Promise<() => Promise<PocketBase>> {
  const email = process.env.PB_ADMIN_EMAIL;
  const password = process.env.PB_ADMIN_PASSWORD;
  if (!email || !password) throw new ServerConfigError('PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD are not set.');
  const su = new PocketBase(serverUrl());
  su.autoCancellation(false);
  const signIn = async () => {
    try {
      await su.collection('_superusers').authWithPassword(email, password);
    } catch (err) {
      throw new ServerConfigError(`PocketBase superuser sign-in failed: ${String((err as Error).message ?? err)}`);
    }
  };
  await signIn();
  return async () => {
    if (!su.authStore.isValid) await signIn();
    return su;
  };
}

type Write =
  | { kind: 'set'; path: string; data: Record<string, unknown>; merge: boolean }
  | { kind: 'update'; path: string; patch: Record<string, unknown> }
  | { kind: 'add'; col: string; data: Record<string, unknown> };

export async function createPocketbaseServerStore(): Promise<ServerStore> {
  const ready = await pocketbaseSuperuser();

  /** A document, and whether its record exists. */
  async function read(path: string): Promise<{ ref: PbDocRef; doc: ServerDoc<Record<string, unknown>> }> {
    const { col, id } = splitPath(path);
    const ref = pbDocRef(col, id);
    try {
      const record = (await (await ready()).collection(ref.collection).getOne(ref.id)) as unknown as Record<string, unknown>;
      return { ref, doc: { exists: true, data: ref.nested ? fromNestedRecord(record).data : plain(record) } };
    } catch (err) {
      if (isMissing(err)) return { ref, doc: { exists: false, data: undefined } };
      throw err;
    }
  }

  /** Commits a transaction's writes in one batch, from the documents as they stand (`known` from its reads). */
  async function commit(writes: Write[], known: Map<string, ServerDoc<Record<string, unknown>>>): Promise<void> {
    if (!writes.length) return;
    const client = await ready();
    const docs = new Map(known);
    const final = new Map<string, { ref: PbDocRef; data: Record<string, unknown>; existed: boolean; patch?: Record<string, unknown> }>();
    const adds: { col: string; data: Record<string, unknown> }[] = [];
    for (const w of writes) {
      if (w.kind === 'add') {
        adds.push({ col: w.col, data: w.data });
        continue;
      }
      if (!docs.has(w.path)) docs.set(w.path, (await read(w.path)).doc);
      const current = docs.get(w.path)!;
      const { col, id } = splitPath(w.path);
      const ref = pbDocRef(col, id);
      const base = final.get(w.path)?.data ?? current.data ?? {};
      if (w.kind === 'update' && !current.exists && !final.has(w.path)) throw new Error(`No document at ${w.path}`);
      const data = w.kind === 'update' ? applyUpdate(base, w.patch) : w.merge ? mergeDeep(base, w.data) : w.data;
      // A native record (an event) gets only the fields an update names, so a dispatcher's write to its
      // other fields in the meantime stands. A set, or any nested record, is written whole.
      const prior = final.get(w.path);
      let patch: Record<string, unknown> | undefined;
      if (!ref.nested && w.kind === 'update') patch = !prior ? { ...w.patch } : prior.patch ? { ...prior.patch, ...w.patch } : undefined;
      final.set(w.path, { ref, data, existed: current.exists, patch });
      docs.set(w.path, { exists: true, data });
    }

    const bodies = [...final.values()].map((f) => ({
      ...f,
      body: f.ref.nested ? nestedRecord(f.ref, f.data) : f.patch ?? { id: f.ref.id, ...f.data },
    }));
    const batch = client.createBatch();
    for (const b of bodies) {
      if (b.ref.nested || !b.patch) batch.collection(b.ref.collection).upsert({ ...b.body, id: b.ref.id });
      else batch.collection(b.ref.collection).update(b.ref.id, b.body);
    }
    for (const a of adds) batch.collection(a.col).create(a.data);
    try {
      await batch.send();
    } catch (err) {
      // Batch requests are off in this PocketBase's settings (scripts/setup-pocketbase.js turns them on):
      // write one by one, still under the lock.
      if (!(err instanceof ClientResponseError) || err.status !== 403) {
        if (err instanceof ClientResponseError) throw new Error(`PocketBase refused the batch: ${JSON.stringify(err.response)}`, { cause: err });
        throw err;
      }
      console.warn('PocketBase batch requests are off; writing one by one. Run scripts/setup-pocketbase.js to turn them on.');
      for (const b of bodies) {
        const records = client.collection(b.ref.collection);
        if (b.ref.nested || !b.patch) {
          if (b.existed) await records.update(b.ref.id, b.body);
          else await records.create({ ...b.body, id: b.ref.id });
        } else await records.update(b.ref.id, b.body);
      }
      for (const a of adds) await client.collection(a.col).create(a.data);
    }
  }

  /** Records of a native collection matching a filter (`{:v}` is `value`, escaped); none when the collection doesn't exist here. */
  async function find(collection: string, expr: string, value: string | number | boolean): Promise<Record<string, unknown>[]> {
    const client = await ready();
    try {
      return (await client.collection(collection).getFullList({ filter: client.filter(expr, { v: value }), batch: 500 })) as unknown as Record<string, unknown>[];
    } catch (err) {
      if (isMissing(err)) return [];
      throw err;
    }
  }

  async function removeAll(collection: string, records: Record<string, unknown>[]): Promise<number> {
    const client = await ready();
    for (const r of records) {
      try {
        await client.collection(collection).delete(String(r.id));
      } catch (err) {
        if (!isMissing(err)) throw err;
      }
    }
    return records.length;
  }

  async function getUser(uid: string): Promise<Record<string, unknown> | null> {
    try {
      return (await (await ready()).collection('users').getOne(uid)) as unknown as Record<string, unknown>;
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
  }

  return {
    async verify(token) {
      const payload = tokenPayload(token);
      if (payload.type !== 'auth' || !payload.collectionId) throw new ServerAuthError('Not an auth token.');
      // Refreshing checks the signature, the record's token key (a new password rotates it) and the
      // collection's authRule (a disabled account is refused).
      const caller = new PocketBase(serverUrl());
      caller.autoCancellation(false);
      caller.authStore.save(token, null);
      try {
        const { record } = await caller.collection(payload.collectionId).authRefresh();
        return { uid: record.id, email: typeof record.email === 'string' ? record.email : undefined };
      } catch (err) {
        if (err instanceof ClientResponseError && err.status > 0 && err.status < 500) throw new ServerAuthError(err.message);
        throw err;
      }
    },

    async get<T>(path: string) {
      return (await read(path)).doc as ServerDoc<T>;
    },

    async update(path, patch) {
      await withLock(path, () => commit([{ kind: 'update', path, patch }], new Map()));
    },

    async add(collection, data) {
      await (await ready()).collection(collection).create(data);
    },

    runTransaction(lockKey, fn) {
      return withLock(lockKey, async () => {
        const known = new Map<string, ServerDoc<Record<string, unknown>>>();
        const writes: Write[] = [];
        const tx: ServerTx = {
          async get<T>(path: string) {
            const { doc } = await read(path);
            known.set(path, doc);
            return doc as ServerDoc<T>;
          },
          set: (path, data, options) => void writes.push({ kind: 'set', path, data: data as Record<string, unknown>, merge: !!options?.merge }),
          update: (path, patch) => void writes.push({ kind: 'update', path, patch }),
          add: (col, data) => void writes.push({ kind: 'add', col, data: data as Record<string, unknown> }),
        };
        const result = await fn(tx);
        await commit(writes, known);
        return result;
      });
    },

    async list<T>(collectionPath: string) {
      if (isNestedCollection(collectionPath)) {
        return (await find(EVENT_DOCS, 'path = {:v}', collectionPath)).map((r) => fromNestedRecord(r) as { id: string; data: T });
      }
      return (await find(collectionPath, 'id != {:v}', '')).map((r) => ({ id: String(r.id), data: plain(r) as T }));
    },

    async where<T>(collection: string, field: string, value: string | number | boolean) {
      const records = await find(collection, `${field} = {:v}`, value);
      return records.map((r) => ({ id: String(r.id), data: plain(r) as T }));
    },

    async deleteWhere(collection, field, value) {
      return removeAll(collection, await find(collection, `${field} = {:v}`, value));
    },

    async deleteTree(path) {
      const { col, id } = splitPath(path);
      if (isNestedCollection(col)) {
        const prefix = `${path}/`;
        await removeAll(EVENT_DOCS, await find(EVENT_DOCS, 'path ~ {:v}', prefix));
        await removeAll(EVENT_DOCS, [{ id: pbDocRef(col, id).id }]);
        return;
      }
      // Documents under a native record (events/{e}/...) are EVENT_DOCS records named for it.
      if (col === 'events') await removeAll(EVENT_DOCS, await find(EVENT_DOCS, 'event = {:v}', id));
      await removeAll(EVENT_DOCS, await find(EVENT_DOCS, 'path ~ {:v}', `${path}/`));
      await removeAll(col, [{ id }]);
    },

    async isAdmin(uid) {
      return (await getUser(uid))?.isAdmin === true;
    },

    // PocketBase installs have no organizations.
    orgMembers: async () => [],
  };
}
