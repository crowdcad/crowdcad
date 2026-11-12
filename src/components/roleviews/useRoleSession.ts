'use client';

import { useEffect, useState } from 'react';
import type { Layer, MciState } from '@/app/types';
import { dbService } from '@/lib/services';
import { isRoleLoginEmail, type RoleAccount, type RoleAccountIndex } from '@/lib/roleAccounts';
import { MCI_DOC_MAP, MCI_DOC_STATE, MCI_DOC_UNITS, mciDocCollection, type MciUnit, type MciUnitsDoc } from '@/lib/mciDoc';

/**
 * Everything an MCI role view reads (#144), live: the login's own record, the
 * MCI state, the unit summary and the map layers. Role logins can read only
 * these documents (firestore.rules), never the event itself.
 */
export interface RoleSession {
  status: 'loading' | 'signed-out' | 'not-role' | 'missing' | 'ready';
  account: RoleAccount | null;
  eventId: string | null;
  mci: MciState | null;
  units: MciUnit[];
  layers: Layer[];
}

const EMPTY: RoleSession = { status: 'loading', account: null, eventId: null, mci: null, units: [], layers: [] };

export function useRoleSession(user: { uid: string; email?: string | null } | null, ready: boolean): RoleSession {
  const [session, setSession] = useState<RoleSession>(EMPTY);
  const uid = user?.uid;
  const isRole = !!user && isRoleLoginEmail(user.email);

  useEffect(() => {
    if (!ready) return;
    if (!uid) return setSession({ ...EMPTY, status: 'signed-out' });
    if (!isRole) return setSession({ ...EMPTY, status: 'not-role' });
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    void dbService
      .getDocument<RoleAccountIndex>('roleAccountIndex', uid)
      .then((index) => {
        if (cancelled) return;
        if (!index.exists || !index.data) return setSession({ ...EMPTY, status: 'missing' });
        const eventId = index.data.eventId;
        const col = mciDocCollection(eventId);
        setSession((s) => ({ ...s, eventId }));
        unsubs.push(
          dbService.subscribeToDocument<RoleAccount>(
            `events/${eventId}/roleAccounts`,
            uid,
            (snap) => setSession((s) => ({ ...s, account: snap.exists && snap.data ? { ...snap.data, uid } : null, status: snap.exists ? 'ready' : 'missing' })),
            () => setSession((s) => ({ ...s, status: 'missing' })),
          ),
          // A disabled login loses read access: the account listener above shows why, these just stop.
          dbService.subscribeToDocument<MciState>(col, MCI_DOC_STATE, (snap) => setSession((s) => ({ ...s, mci: snap.exists ? snap.data : null })), () => {}),
          dbService.subscribeToDocument<MciUnitsDoc>(col, MCI_DOC_UNITS, (snap) => setSession((s) => ({ ...s, units: snap.data?.units ?? [] })), () => {}),
          dbService.subscribeToDocument<{ layers: Layer[] }>(col, MCI_DOC_MAP, (snap) => setSession((s) => ({ ...s, layers: snap.data?.layers ?? [] })), () => {}),
        );
      })
      .catch(() => !cancelled && setSession({ ...EMPTY, status: 'missing' }));
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [uid, isRole, ready]);

  return session;
}
