import { dbService, isPocketbaseBackend } from '@/lib/services';
import type { HistoryMode } from '../types';
import { createBridgeRecord } from '../data/takStore';
import { randomString } from '@/lib/randomString';
import { createFirebaseUserInBrowser } from '@/lib/services/firebase/provisionUser';

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
export { randomString } from '@/lib/randomString';

export interface BridgeCredentials {
  bridgeUid: string;
  email: string;
  password: string;
}

function createFirebaseUser(email: string, password: string): Promise<string> {
  return createFirebaseUserInBrowser(email, password, 'bridge account');
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
