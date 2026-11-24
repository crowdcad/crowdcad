/**
 * The backend as this app's server routes see it: check a caller's token, read and write documents (in a
 * transaction where needed), find and delete them. Paths are Firestore-style (`events/{e}/mci/state`) on
 * both backends. Firebase uses the Admin SDK (firestoreServerStore.ts); PocketBase a superuser client
 * (pocketbaseServerStore.ts). Server-only: imported by route handlers, never by components.
 *
 * Used by /api/records (deleting events, the retention purge) and by extension packs' own routes.
 */

export interface ServerDoc<T> {
  exists: boolean;
  data: T | undefined;
}

export interface ServerTx {
  get<T>(path: string): Promise<ServerDoc<T>>;
  /** Replaces the document, or with merge, merges maps key by key. */
  set(path: string, data: object, options?: { merge?: boolean }): void;
  /** Changes fields of an existing document; dotted keys reach into maps, null clears. */
  update(path: string, patch: Record<string, unknown>): void;
  /** A new document with its own id in a collection (audit rows). */
  add(collection: string, data: object): void;
}

export interface ServerCaller {
  uid: string;
  email?: string;
}

export interface ServerStore {
  /** Who sent the token. Rejects a token that is invalid, expired or revoked. */
  verify(token: string): Promise<ServerCaller>;
  get<T>(path: string): Promise<ServerDoc<T>>;
  update(path: string, patch: Record<string, unknown>): Promise<void>;
  /** A new document with its own id in a top-level collection (audit rows). */
  add(collection: string, data: object): Promise<void>;
  /** Reads then writes, all or nothing. `lockKey` serializes writers where the backend has no transactions. */
  runTransaction<T>(lockKey: string, fn: (tx: ServerTx) => Promise<T>): Promise<T>;
  /** Every document of a collection, top-level or under a document (`events/{e}/field`), with its id. */
  list<T>(collectionPath: string): Promise<{ id: string; data: T }[]>;
  /** The documents of a top-level collection whose `field` equals `value`, with their ids. */
  where<T>(collection: string, field: string, value: string | number | boolean): Promise<{ id: string; data: T }[]>;
  /** Deletes the documents of a top-level collection whose `field` equals `value`; the number deleted. A collection this backend doesn't have counts as empty. */
  deleteWhere(collection: string, field: string, value: string | number | boolean): Promise<number>;
  /** Deletes a document and every document under its path (`events/{e}` takes `events/{e}/mci/state` with it). */
  deleteTree(path: string): Promise<void>;
  isAdmin(uid: string): Promise<boolean>;
  orgMembers(orgId: string): Promise<string[]>;
}

/** The token is missing its mark: sign in again (401). */
export class ServerAuthError extends Error {}
/** The server has no credentials for the backend (501): the browser falls back where it can. */
export class ServerConfigError extends Error {}

/** The HTTP status for a store failure the routes answer specially, or null for a real error (500). */
export function serverErrorStatus(err: unknown): 401 | 501 | null {
  if (err instanceof ServerAuthError) return 401;
  if (err instanceof ServerConfigError) return 501;
  return null;
}

export const usesPocketbase = () => process.env.NEXT_PUBLIC_BACKEND === 'pocketbase';

/** The bearer token of a request, or null. */
export const bearerToken = (req: Request): string | null => req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null;

let store: Promise<ServerStore> | null = null;

export function getServerStore(): Promise<ServerStore> {
  store ??= (async () => {
    if (usesPocketbase()) return (await import('./pocketbaseServerStore')).createPocketbaseServerStore();
    return (await import('./firestoreServerStore')).createFirestoreServerStore();
  })();
  // A failed start (no credentials) is tried again on the next request.
  store.catch(() => {
    store = null;
  });
  return store;
}
