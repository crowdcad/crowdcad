import { dbService, isPocketbaseBackend } from '@/lib/services';
import type { HistoryMode } from '../types';
import { createBridgeRecord } from '../data/takStore';

/**
 * Creating a TAK bridge account from the Admin > TAK section, without signing
 * the admin out and without the Admin SDK:
 * - Firebase: a secondary Firebase app with in-memory auth creates the user,
 *   then is signed out and deleted; the admin's own session is untouched.
 * - PocketBase: an admin creates a user with role 'bridge'; creating a record
 *   doesn't change who is signed in.
 * The password is generated here and shown once; CrowdCAD never stores it.
 */

export const BRIDGE_EMAIL_DOMAIN = 'bridge.crowdcad.org';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function randomString(length: number, alphabet = ALPHABET): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  // Rejection sampling keeps the distribution uniform.
  let out = '';
  let i = 0;
  const limit = 256 - (256 % alphabet.length);
  while (out.length < length) {
    if (i >= bytes.length) {
      globalThis.crypto.getRandomValues(bytes);
      i = 0;
    }
    const b = bytes[i++]!;
    if (b < limit) out += alphabet[b % alphabet.length];
  }
  return out;
}

export interface BridgeCredentials {
  bridgeUid: string;
  email: string;
  password: string;
}

async function createFirebaseUser(email: string, password: string): Promise<string> {
  const { getApp, initializeApp, deleteApp } = await import('firebase/app');
  const { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, initializeAuth, inMemoryPersistence, signOut } =
    await import('firebase/auth');
  const secondary = initializeApp(getApp().options, `tak-bridge-provisioning-${randomString(8)}`);
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
        'This Firebase project does not allow creating accounts from the browser (email/password sign-up is disabled). ' +
          'Enable it in Firebase Authentication, or create the bridge account another way.',
        { cause: err },
      );
    }
    throw err;
  } finally {
    await deleteApp(secondary);
  }
}

async function createPocketBaseUser(email: string, password: string): Promise<string> {
  return dbService.addDocument('users', { email, password, passwordConfirm: password, role: 'bridge' });
}

/** Creates the bridge's account and its bridge record. Admins only (enforced by the rules). */
export async function createBridgeAccount(options: {
  label: string;
  allowedUsers: string[];
  defaultHistoryMode: HistoryMode;
  createdBy: string;
}): Promise<BridgeCredentials> {
  const email = `${randomString(12, 'abcdefghijkmnpqrstuvwxyz23456789')}@${BRIDGE_EMAIL_DOMAIN}`;
  const password = randomString(32);
  const bridgeUid = isPocketbaseBackend ? await createPocketBaseUser(email, password) : await createFirebaseUser(email, password);
  await createBridgeRecord(bridgeUid, options);
  return { bridgeUid, email, password };
}
