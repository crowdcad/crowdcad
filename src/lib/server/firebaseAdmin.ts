/**
 * The Firebase Admin SDK for this app's server routes (role logins, role
 * actions). On Firebase Hosting the function's own service account is used;
 * elsewhere set GOOGLE_APPLICATION_CREDENTIALS. With FIRESTORE_EMULATOR_HOST
 * and FIREBASE_AUTH_EMULATOR_HOST set (tests, local emulators) it talks to the
 * emulators. Server-only: imported by route handlers, never by components.
 */

export interface Admin {
  auth: import('firebase-admin/auth').Auth;
  db: import('firebase-admin/firestore').Firestore;
}

let admin: Promise<Admin> | null = null;

export function getAdmin(): Promise<Admin> {
  admin ??= (async () => {
    const { getApps, initializeApp } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const { getFirestore } = await import('firebase-admin/firestore');
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const app = getApps()[0] ?? initializeApp(projectId ? { projectId } : undefined);
    const db = getFirestore(app);
    try {
      // Patches leave optional fields undefined; the client SDK path strips them the same way.
      db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Already set by an earlier request in this process.
    }
    return { auth: getAuth(app), db };
  })();
  return admin;
}

/** An Admin SDK failure that means "no usable credentials here" rather than a real refusal. */
export function isCredentialError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return (
    (e.code ?? '').startsWith('app/') ||
    /credential|could not load the default|metadata\.google\.internal|unable to detect a project id/i.test(e.message ?? '')
  );
}
