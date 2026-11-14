'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Layer, MciState } from '@/app/types';
import { dbService } from '@/lib/services';
import { isEventRole, isRoleLoginEmail, roleReadsPatients, type RoleAccount, type RoleAccountIndex } from '@/lib/roleAccounts';
import { MCI_DOC_MAP, MCI_DOC_PATIENTS, MCI_DOC_STATE, MCI_DOC_UNITS, mciDocCollection, mergeMciPatients, type MciEquipmentItem, type MciPatientsDoc, type MciUnit, type MciUnitsDoc } from '@/lib/mciDoc';

/**
 * Everything an MCI role view reads (#144), live: the login's own record, the
 * MCI state, the unit summary and the map layers, plus patient details for
 * the roles that see them (not Logistics, #156). Role logins can read only
 * these documents (firestore.rules), never the event itself.
 */
export interface RoleSession {
  status: 'loading' | 'signed-out' | 'not-role' | 'missing' | 'ready';
  account: RoleAccount | null;
  eventId: string | null;
  mci: MciState | null;
  units: MciUnit[];
  /** Event equipment and who has it (D27); empty until the summary is next written. */
  equipment: MciEquipmentItem[];
  layers: Layer[];
}

const EMPTY: RoleSession = { status: 'loading', account: null, eventId: null, mci: null, units: [], equipment: [], layers: [] };

/** The state and patient details as they arrive, merged into `mci` for the views. */
type RawSession = RoleSession & { patients: MciPatientsDoc | null };
const EMPTY_RAW: RawSession = { ...EMPTY, patients: null };

export function useRoleSession(user: { uid: string; email?: string | null } | null, ready: boolean): RoleSession {
  const [session, setSession] = useState<RawSession>(EMPTY_RAW);
  const uid = user?.uid;
  const isRole = !!user && isRoleLoginEmail(user.email);

  useEffect(() => {
    if (!ready) return;
    if (!uid) return setSession({ ...EMPTY_RAW, status: 'signed-out' });
    if (!isRole) return setSession({ ...EMPTY_RAW, status: 'not-role' });
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    void dbService
      .getDocument<RoleAccountIndex>('roleAccountIndex', uid)
      .then((index) => {
        if (cancelled) return;
        if (!index.exists || !index.data) return setSession({ ...EMPTY_RAW, status: 'missing' });
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
          dbService.subscribeToDocument<MciUnitsDoc>(col, MCI_DOC_UNITS, (snap) => setSession((s) => ({ ...s, units: snap.data?.units ?? [], equipment: snap.data?.equipment ?? [] })), () => {}),
          dbService.subscribeToDocument<{ layers: Layer[] }>(col, MCI_DOC_MAP, (snap) => setSession((s) => ({ ...s, layers: snap.data?.layers ?? [] })), () => {}),
        );
        // Patient details only for the roles that see them; the rules refuse the rest.
        if (isEventRole(index.data.role) && roleReadsPatients(index.data.role)) {
          unsubs.push(
            dbService.subscribeToDocument<MciPatientsDoc>(col, MCI_DOC_PATIENTS, (snap) => setSession((s) => ({ ...s, patients: snap.exists ? snap.data : null })), () => {}),
          );
        }
      })
      .catch(() => !cancelled && setSession({ ...EMPTY_RAW, status: 'missing' }));
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [uid, isRole, ready]);

  // A state document from before #156 may still carry details inline until its next write.
  return useMemo(() => {
    const { patients, ...rest } = session;
    return { ...rest, mci: rest.mci ? mergeMciPatients(rest.mci, patients) : null };
  }, [session]);
}
