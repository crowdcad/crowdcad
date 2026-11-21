'use client';
import { useEffect, useState } from 'react';
import { authService, dbService, isPocketbaseBackend, type ServiceUser } from '@/lib/services';
import { firstOf } from '@/extensions';

// Tracks which uids have already had their `users/{uid}` doc synced with
// email/displayName this session, so the merge write below only fires once
// per user even though many components mount useAuth() independently.
// sessionStorage (not an in-memory Set) so the flag survives full-page
// navigations within the same tab — otherwise every navigation re-fires
// the write, since a fresh page load resets any module-level JS state.
const SYNCED_KEY_PREFIX = 'ccad-user-synced-';

function hasSyncedUser(uid: string): boolean {
  try {
    return sessionStorage.getItem(SYNCED_KEY_PREFIX + uid) === '1';
  } catch {
    return false;
  }
}

function markUserSynced(uid: string): void {
  try {
    sessionStorage.setItem(SYNCED_KEY_PREFIX + uid, '1');
  } catch {
    // sessionStorage unavailable — best-effort sync, safe to skip
  }
}

function clearUserSynced(uid: string): void {
  try {
    sessionStorage.removeItem(SYNCED_KEY_PREFIX + uid);
  } catch {
    // ignore
  }
}

export function useAuth() {
  const [user, setUser] = useState<ServiceUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = authService.onAuthStateChanged((u) => {
      setUser(u);
      setReady(true);

      // An account confined to its own pages (an extension's field login) only ever sees them; the rules deny it everything else anyway.
      const confined = u ? firstOf((x) => x.auth?.confinedTo?.(u.email)) : null;
      if (confined) {
        if (typeof window !== 'undefined' && !confined.allows(window.location.pathname)) window.location.replace(confined.home);
        return;
      }

      // Best-effort sync so the users collection has enough info (email,
      // displayName) for the admin "Manage Admins" lookup — the doc is
      // otherwise only ever written with partial fields (phoneNumber, etc).
      // PocketBase's `users` collection is the built-in auth collection and
      // already has these as native fields — writing `email` there could
      // trigger its email-change/verification flow, so skip it there.
      if (u && !isPocketbaseBackend && !hasSyncedUser(u.uid)) {
        markUserSynced(u.uid);
        dbService
          .setDocument('users', u.uid, { email: u.email, displayName: u.displayName }, { merge: true })
          .catch(() => {
            clearUserSynced(u.uid);
          });
      }
    });
    return () => unsub();
  }, []);

  // AFTER you set your local user + ready state:
  if (typeof document !== 'undefined') {
    if (user) {
      // 7 days; adjust as you like
      document.cookie = 'ccad_auth=1; Max-Age=604800; Path=/; SameSite=Lax';
    } else {
      document.cookie = 'ccad_auth=0; Max-Age=0; Path=/; SameSite=Lax';
    }
  }
  
  return { user, ready };
}