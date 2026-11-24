import { getAdmin, isCredentialError, type Admin } from './firebaseAdmin';
import { ServerAuthError, ServerConfigError, type ServerStore, type ServerTx } from './serverStore';

/** The server routes' store on Firebase: the Admin SDK (see serverStore.ts). */

function rethrow(err: unknown): never {
  if (isCredentialError(err)) throw new ServerConfigError(String((err as Error).message ?? err));
  const code = (err as { code?: string }).code ?? '';
  if (code.startsWith('auth/id-token') || code === 'auth/argument-error' || code === 'auth/user-disabled') throw new ServerAuthError(code);
  throw err;
}

/** Runs an Admin SDK call, turning credential and token failures into the store's own errors. */
export async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    rethrow(err);
  }
}

/** The Admin SDK, or ServerConfigError when this server has no credentials. */
export async function adminOrConfigError(): Promise<Admin> {
  try {
    return await getAdmin();
  } catch (err) {
    throw new ServerConfigError(String(err));
  }
}

export async function createFirestoreServerStore(): Promise<ServerStore> {
  const a = await adminOrConfigError();
  const doc = (path: string) => a.db.doc(path);

  return {
    verify: (token) =>
      guarded(async () => {
        // Checking revocation means a reset or disabled account stops at once.
        const decoded = await a.auth.verifyIdToken(token, true);
        return { uid: decoded.uid, email: decoded.email };
      }),

    get: (path) =>
      guarded(async () => {
        const snap = await doc(path).get();
        return { exists: snap.exists, data: snap.data() as never };
      }),

    update: (path, patch) => guarded(async () => void (await doc(path).update(patch))),

    add: (collection, data) => guarded(async () => void (await a.db.collection(collection).add(data))),

    runTransaction: (_lockKey, fn) =>
      guarded(() =>
        a.db.runTransaction(async (t) => {
          const tx: ServerTx = {
            async get(path) {
              const snap = await t.get(doc(path));
              return { exists: snap.exists, data: snap.data() as never };
            },
            set: (path, data, options) => void (options?.merge ? t.set(doc(path), data, { merge: true }) : t.set(doc(path), data)),
            update: (path, patch) => void t.update(doc(path), patch as { [key: string]: Partial<unknown> }),
            add: (collection, data) => void t.set(a.db.collection(collection).doc(), data),
          };
          return fn(tx);
        }),
      ),

    list: (collectionPath) =>
      guarded(async () => (await a.db.collection(collectionPath).get()).docs.map((d) => ({ id: d.id, data: d.data() as never }))),

    where: (collection, field, value) =>
      guarded(async () => {
        const snap = await a.db.collection(collection).where(field, '==', value).get();
        return snap.docs.map((d) => ({ id: d.id, data: d.data() as never }));
      }),

    deleteWhere: (collection, field, value) =>
      guarded(async () => {
        const snap = await a.db.collection(collection).where(field, '==', value).get();
        // recursiveDelete takes each document's subcollections too.
        for (const d of snap.docs) await a.db.recursiveDelete(d.ref);
        return snap.size;
      }),

    deleteTree: (path) => guarded(async () => void (await a.db.recursiveDelete(doc(path)))),

    isAdmin: (uid) => guarded(async () => (await doc(`users/${uid}`).get()).get('isAdmin') === true),
    orgMembers: (orgId) =>
      guarded(async () => {
        const members = (await doc(`organizations/${orgId}`).get()).get('members');
        return Array.isArray(members) ? members.filter((m): m is string => typeof m === 'string') : [];
      }),
  };
}
