import { randomString } from '@/lib/randomString';

/**
 * Creates a Firebase Auth email/password account from the browser without
 * signing the current user out and without the Admin SDK: a secondary
 * Firebase app with in-memory auth creates the user, then is signed out and
 * deleted. Used for TAK bridge accounts and, where sign-up is allowed, MCI
 * role logins. Fails with a clear message when the project has email/password
 * sign-up turned off.
 */
export async function createFirebaseUserInBrowser(email: string, password: string, purpose = 'account'): Promise<string> {
  const { getApp, initializeApp, deleteApp } = await import('firebase/app');
  const { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, initializeAuth, inMemoryPersistence, signOut } =
    await import('firebase/auth');
  const secondary = initializeApp(getApp().options, `provisioning-${randomString(8)}`);
  try {
    const auth = initializeAuth(secondary, { persistence: inMemoryPersistence });
    // Follow the app's own Auth instance onto the emulator when it uses one.
    const emu = getAuth(getApp()).emulatorConfig;
    if (emu) connectAuthEmulator(auth, `${emu.protocol}://${emu.host}${emu.port ? `:${emu.port}` : ''}`, { disableWarnings: true });
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await signOut(auth);
    return cred.user.uid;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') {
      throw new Error(
        `This Firebase project does not allow creating accounts from the browser (email/password sign-up is disabled). ` +
          `Enable it in Firebase Authentication, or create the ${purpose} another way.`,
        { cause: err },
      );
    }
    throw err;
  } finally {
    await deleteApp(secondary);
  }
}

/** The signed-in user's Firebase ID token, for calling this app's own API routes. */
export async function currentIdToken(): Promise<string | null> {
  const { getApp } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  const user = getAuth(getApp()).currentUser;
  return user ? user.getIdToken() : null;
}
