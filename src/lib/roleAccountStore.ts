import { dbService, isPocketbaseBackend } from '@/lib/services';
import type { Unsubscribe } from '@/lib/services/types';
import {
  newRolePassword,
  newRoleUsername,
  roleLoginEmail,
  type EventRole,
  type RoleAccount,
  type RoleAccountIndex,
  type RoleLoginCredentials,
} from './roleAccounts';

/**
 * Reads and writes for MCI role logins (src/lib/roleAccounts.ts).
 *
 * Creating a login makes a real account. On a hosted Firebase project with
 * email/password sign-up turned off, only the server can do that, so the
 * app's /api/role-accounts route creates it with the Admin SDK. Where that
 * route has no admin credentials (it answers 501) or the app runs on the
 * emulators, the browser creates the account itself, which needs sign-up on.
 * PocketBase isn't supported yet.
 */

export const ROLE_LOGINS_SUPPORTED = !isPocketbaseBackend;

const usesEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

const accountsPath = (eventId: string) => `events/${eventId}/roleAccounts`;

async function callApi(body: Record<string, unknown>): Promise<Response | null> {
  if (usesEmulator) return null;
  const { currentIdToken } = await import('@/lib/services/firebase/provisionUser');
  const token = await currentIdToken();
  if (!token) throw new Error('Sign in again to manage role logins.');
  try {
    return await fetch('/api/role-accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

/** Whether a response means "the server can't do this here; try the browser". */
const serverUnavailable = (res: Response | null) => !res || res.status === 404 || res.status === 501;

async function errorFrom(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error || `The server refused (${res.status}).`);
}

/** Creates a login for a role on an event. The password is returned once and never stored. */
export async function createRoleLogin(input: {
  eventId: string;
  eventName: string;
  role: EventRole;
  label?: string;
  /** The team or supervisor the login belongs to (#152). */
  unitName?: string;
  unitId?: string;
  createdBy: string;
}): Promise<RoleLoginCredentials> {
  if (!ROLE_LOGINS_SUPPORTED) throw new Error('Role logins need the Firebase backend for now.');
  const res = await callApi({ action: 'create', eventId: input.eventId, role: input.role, label: input.label ?? '', unitName: input.unitName ?? '', unitId: input.unitId ?? '' });
  if (res?.ok) return (await res.json()) as RoleLoginCredentials;
  if (!serverUnavailable(res)) throw await errorFrom(res!);

  const { createFirebaseUserInBrowser } = await import('@/lib/services/firebase/provisionUser');
  const username = newRoleUsername(input.role);
  const password = newRolePassword();
  const uid = await createFirebaseUserInBrowser(roleLoginEmail(username), password, 'role login');
  const account: RoleAccount = {
    uid,
    eventId: input.eventId,
    eventName: input.eventName,
    role: input.role,
    username,
    ...(input.unitName ? { unitName: input.unitName } : {}),
    ...(input.unitId ? { unitId: input.unitId } : {}),
    ...(input.label ? { label: input.label } : {}),
    disabled: false,
    createdBy: input.createdBy,
    createdAt: Date.now(),
  };
  await dbService.setDocument<RoleAccount>(accountsPath(input.eventId), uid, account);
  await dbService.setDocument<RoleAccountIndex>('roleAccountIndex', uid, { eventId: input.eventId, role: input.role });
  return { uid, username, password };
}

/**
 * Disables or re-enables a login. The record is what the rules check, so this
 * takes effect at once, even on a device already signed in; the server also
 * disables the account itself and signs it out everywhere when it can.
 */
export async function setRoleLoginDisabled(eventId: string, uid: string, disabled: boolean): Promise<void> {
  const res = await callApi({ action: disabled ? 'disable' : 'enable', eventId, uid });
  if (res?.ok) return;
  if (!serverUnavailable(res)) throw await errorFrom(res!);
  await dbService.updateDocument(accountsPath(eventId), uid, disabled ? { disabled: true, disabledAt: Date.now() } : { disabled: false });
}

/** An event's logins, newest first. */
export function subscribeRoleLogins(eventId: string, callback: (accounts: RoleAccount[]) => void, onError?: (error: Error) => void): Unsubscribe {
  return dbService.subscribeToQuery<RoleAccount>(
    accountsPath(eventId),
    [],
    (snaps) => callback(snaps.map((s) => ({ ...(s.data as RoleAccount), uid: s.id })).sort((a, b) => b.createdAt - a.createdAt)),
    onError,
  );
}

/** The signed-in login's own record, or null for a normal account (or one whose record is gone). */
export async function getMyRoleAccount(uid: string): Promise<RoleAccount | null> {
  const index = await dbService.getDocument<RoleAccountIndex>('roleAccountIndex', uid);
  if (!index.exists || !index.data) return null;
  const record = await dbService.getDocument<RoleAccount>(accountsPath(index.data.eventId), uid);
  return record.exists && record.data ? { ...record.data, uid } : null;
}
