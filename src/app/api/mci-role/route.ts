import { NextResponse } from 'next/server';
import type { Event, MciState } from '@/app/types';
import { isRoleLoginEmail, type RoleAccount, type RoleAccountIndex } from '@/lib/roleAccounts';
import { applyRoleAction, roleActionAllowed, type RoleAction } from '@/lib/mciRoleActions';
import { MCI_DOC_STATE, MCI_DOC_UNITS, mciDocCollection, splitMciWrite, withMciDoc, type MciUnitsDoc } from '@/lib/mciDoc';
import { getAdmin, isCredentialError } from '@/lib/server/firebaseAdmin';

/**
 * Changes made from an MCI role view (#144). Role logins can't write to the
 * database themselves (firestore.rules gives them read access only); this
 * route checks the login (active, not disabled, its event not ended), checks
 * the action is one its role may take (src/lib/mciRoleActions.ts), and applies
 * it in a transaction, stamping every log entry with the login's unit and role
 * (#152) so the attribution can't be forged from the phone.
 */
export const runtime = 'nodejs';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in.' }, 401);
  const body = (await req.json().catch(() => null)) as { action?: RoleAction } | null;
  const action = body?.action;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return json({ error: 'Invalid request.' }, 400);

  try {
    const a = await getAdmin();
    const decoded = await a.auth.verifyIdToken(token);
    if (!isRoleLoginEmail(decoded.email)) return json({ error: 'Only role logins use this.' }, 403);
    const index = (await a.db.doc(`roleAccountIndex/${decoded.uid}`).get()).data() as RoleAccountIndex | undefined;
    if (!index) return json({ error: 'This login is not linked to an event.' }, 403);
    const eventId = index.eventId;
    const account = (await a.db.doc(`events/${eventId}/roleAccounts/${decoded.uid}`).get()).data() as RoleAccount | undefined;
    if (!account || account.disabled) return json({ error: 'This login has been disabled.' }, 403);
    if (!roleActionAllowed(account.role, action.type)) return json({ error: 'Your role cannot do that.' }, 403);

    const result = await a.db.runTransaction(async (tx) => {
      const eventRef = a.db.doc(`events/${eventId}`);
      const stateRef = a.db.doc(`${mciDocCollection(eventId)}/${MCI_DOC_STATE}`);
      const [eventSnap, stateSnap] = await Promise.all([tx.get(eventRef), tx.get(stateRef)]);
      const event = eventSnap.data() as Event | undefined;
      if (!event) return { error: 'The event no longer exists.' };
      if (event.ended) return { error: 'The event has ended.' };
      const merged = withMciDoc({ ...event, id: eventId }, stateSnap.exists ? (stateSnap.data() as MciState) : null);
      const out = applyRoleAction(merged, action, { uid: decoded.uid, role: account.role, unitName: account.unitName ?? '', unitId: account.unitId }, Date.now());
      if (out.error) return { error: out.error };
      const split = splitMciWrite(merged, out.patch);
      if (Object.keys(split.event).length) tx.update(eventRef, split.event as { [key: string]: Partial<unknown> });
      if (split.mci) tx.set(stateRef, split.mci);
      if (split.units) tx.set(a.db.doc(`${mciDocCollection(eventId)}/${MCI_DOC_UNITS}`), { units: split.units, updatedAt: Date.now() } satisfies MciUnitsDoc);
      return { ok: true };
    });
    if ('error' in result) return json({ error: result.error }, 400);
    await a.db.doc(`events/${eventId}/roleAccounts/${decoded.uid}`).update({ lastSeenAt: Date.now() }).catch(() => {});
    return json({ ok: true });
  } catch (err) {
    if (isCredentialError(err)) return json({ error: 'Role views are not set up on this server yet.' }, 501);
    const code = (err as { code?: string }).code ?? '';
    if (code.startsWith('auth/id-token') || code === 'auth/argument-error') return json({ error: 'Sign in again.' }, 401);
    console.error('mci-role route failed', err);
    return json({ error: 'Could not save that. Try again.' }, 500);
  }
}
