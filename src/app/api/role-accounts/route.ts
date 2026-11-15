import { NextResponse } from 'next/server';
import {
  EVENT_ROLE_INFO,
  isEventRole,
  isRoleLoginEmail,
  newRolePassword,
  newRoleUsername,
  roleLoginEmail,
  type RoleAccount,
  type RoleAccountIndex,
} from '@/lib/roleAccounts';
import { getAdmin, isCredentialError, type Admin } from '@/lib/server/firebaseAdmin';

/**
 * Creates, disables, re-enables, reassigns (role, holder) and resets the
 * password of MCI role logins (#142) with the Firebase Admin SDK, for projects
 * where email/password sign-up is turned off (so the browser can't create
 * accounts). Callable by anyone who may dispatch the event (the same people
 * the rules' canReadEventData allows), never by a TAK bridge. The event's
 * active Logistics role login may reset passwords too, and nothing else.
 * Passwords are never stored: a reset makes a new one and shows it once.
 *
 * Answers 501 when the server has no admin credentials, and the app then
 * creates the account in the browser instead (src/lib/roleAccountStore.ts).
 * On Firebase hosting the function's own service account is used; elsewhere
 * set GOOGLE_APPLICATION_CREDENTIALS.
 */
export const runtime = 'nodejs';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** Mirrors firestore.rules' canReadEventData: everyone who may dispatch the event. */
async function canManageEvent(a: Admin, event: Record<string, unknown>, uid: string, email: string | undefined): Promise<boolean> {
  if (event.userId === uid) return true;
  if (typeof event.orgId === 'string') {
    const org = await a.db.doc(`organizations/${event.orgId}`).get();
    const members = org.get('members');
    if (Array.isArray(members) && members.includes(uid)) return true;
  }
  const shared = event.sharedWith;
  if (email && Array.isArray(shared) && shared.includes(email.toLowerCase())) return true;
  if (event.isOrgEvent === true) return true;
  const user = await a.db.doc(`users/${uid}`).get();
  return user.get('isAdmin') === true;
}

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in.' }, 401);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  const eventId = body?.eventId;
  if (!body || typeof eventId !== 'string' || !eventId || !['create', 'disable', 'enable', 'assign', 'reset'].includes(String(action))) {
    return json({ error: 'Invalid request.' }, 400);
  }

  let a: Admin;
  try {
    a = await getAdmin();
  } catch (err) {
    return json({ error: 'Role logins are not configured on this server.', detail: String(err) }, 501);
  }

  try {
    const decoded = await a.auth.verifyIdToken(token);
    if ((await a.db.doc(`bridgeAccounts/${decoded.uid}`).get()).exists) return json({ error: 'Not allowed.' }, 403);
    const eventSnap = await a.db.doc(`events/${eventId}`).get();
    const event = eventSnap.data();
    if (!event) return json({ error: 'Event not found.' }, 400);
    if (isRoleLoginEmail(decoded.email)) {
      // The event's Logistics lead hands logins out on the ground: reset only.
      const own = (await a.db.doc(`events/${eventId}/roleAccounts/${decoded.uid}`).get()).data() as RoleAccount | undefined;
      if (action !== 'reset' || !own || own.disabled || own.role !== 'logistics') return json({ error: 'Role logins cannot manage logins.' }, 403);
    } else if (!(await canManageEvent(a, event, decoded.uid, decoded.email))) {
      return json({ error: 'You cannot manage this event.' }, 403);
    }
    if (event.ended === true) return json({ error: 'This event has ended.' }, 400);

    if (action === 'create') {
      const role = body.role;
      if (!isEventRole(role)) return json({ error: 'Unknown role.' }, 400);
      const label = typeof body.label === 'string' ? body.label.trim().slice(0, 80) : '';
      const unitName = typeof body.unitName === 'string' ? body.unitName.trim().slice(0, 80) : '';
      const unitId = typeof body.unitId === 'string' ? body.unitId.trim().slice(0, 80) : '';
      const password = newRolePassword();
      for (let attempt = 0; attempt < 5; attempt++) {
        const username = newRoleUsername(role);
        let uid: string;
        try {
          const user = await a.auth.createUser({
            email: roleLoginEmail(username),
            password,
            displayName: `${unitName || EVENT_ROLE_INFO[role].label} (${String(event.name ?? 'event')})`.slice(0, 120),
          });
          uid = user.uid;
        } catch (err) {
          if ((err as { code?: string }).code === 'auth/email-already-exists') continue;
          throw err;
        }
        const account: RoleAccount = {
          uid,
          eventId,
          eventName: String(event.name ?? ''),
          role,
          username,
          ...(unitName ? { unitName } : {}),
          ...(unitId ? { unitId } : {}),
          ...(label ? { label } : {}),
          disabled: false,
          createdBy: decoded.uid,
          createdAt: Date.now(),
        };
        const index: RoleAccountIndex = { eventId, role };
        const batch = a.db.batch();
        batch.set(a.db.doc(`events/${eventId}/roleAccounts/${uid}`), account);
        batch.set(a.db.doc(`roleAccountIndex/${uid}`), index);
        await batch.commit();
        return json({ uid, username, password });
      }
      return json({ error: 'Could not pick a free username; try again.' }, 409);
    }

    const uid = body.uid;
    if (typeof uid !== 'string' || !uid) return json({ error: 'Invalid request.' }, 400);
    const ref = a.db.doc(`events/${eventId}/roleAccounts/${uid}`);
    const existing = (await ref.get()).data() as RoleAccount | undefined;
    if (!existing) return json({ error: 'No such login for this event.' }, 400);

    if (action === 'reset') {
      if (existing.disabled) return json({ error: 'Enable the login first.' }, 400);
      const password = newRolePassword();
      // A new password signs the login out everywhere, so only the new holder can use it.
      await a.auth.updateUser(uid, { password });
      await a.auth.revokeRefreshTokens(uid);
      return json({ uid, username: existing.username, password });
    }

    if (action === 'assign') {
      const changes: Partial<RoleAccount> = {};
      if (body.role !== undefined) {
        if (!isEventRole(body.role)) return json({ error: 'Unknown role.' }, 400);
        changes.role = body.role;
      }
      if (typeof body.label === 'string') changes.label = body.label.trim().slice(0, 80);
      if (!Object.keys(changes).length) return json({ error: 'Invalid request.' }, 400);
      const batch = a.db.batch();
      batch.update(ref, changes);
      if (changes.role) batch.update(a.db.doc(`roleAccountIndex/${uid}`), { role: changes.role });
      await batch.commit();
      return json({ ok: true });
    }

    const disabled = action === 'disable';
    await a.auth.updateUser(uid, { disabled });
    if (disabled) await a.auth.revokeRefreshTokens(uid);
    await ref.update(disabled ? { disabled: true, disabledAt: Date.now() } : { disabled: false });
    return json({ ok: true });
  } catch (err) {
    if (isCredentialError(err)) return json({ error: 'Role logins are not configured on this server.' }, 501);
    const code = (err as { code?: string }).code ?? '';
    if (code.startsWith('auth/id-token') || code === 'auth/argument-error') return json({ error: 'Sign in again.' }, 401);
    console.error('role-accounts route failed', err);
    return json({ error: 'Something went wrong with the login.' }, 500);
  }
}
