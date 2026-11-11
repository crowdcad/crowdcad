'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Spinner } from '@heroui/react';
import { useAuth } from '@/hooks/useauth';
import { authService, dbService } from '@/lib/services';
import { EVENT_ROLE_INFO, isRoleLoginEmail, type RoleAccount, type RoleAccountIndex } from '@/lib/roleAccounts';
import RoleSignInForm, { RoleCard } from '@/components/rolelogin/rolesignin';

/**
 * Where an MCI role login (#142) lands: its event and role. Signed out, it
 * offers the username and password form, so /role is also a plain entry
 * point. The role's own simplified view arrives with #144; until then this
 * page confirms the login works and follows it being disabled live.
 */
export default function RolePage() {
  const { user, ready } = useAuth();
  const [account, setAccount] = useState<RoleAccount | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const isRole = !!user && isRoleLoginEmail(user.email);

  useEffect(() => {
    if (!user || !isRole) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    void dbService
      .getDocument<RoleAccountIndex>('roleAccountIndex', user.uid)
      .then((index) => {
        if (cancelled) return;
        if (!index.exists || !index.data) return setState('missing');
        unsub = dbService.subscribeToDocument<RoleAccount>(
          `events/${index.data.eventId}/roleAccounts`,
          user.uid,
          (snap) => {
            setAccount(snap.exists && snap.data ? { ...snap.data, uid: user.uid } : null);
            setState(snap.exists ? 'ready' : 'missing');
          },
          () => setState('missing'),
        );
      })
      .catch(() => !cancelled && setState('missing'));
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user, isRole]);

  if (!ready) {
    return (
      <RoleCard>
        <Spinner />
      </RoleCard>
    );
  }

  if (!user) {
    return (
      <RoleCard>
        <h1 className="text-xl font-bold">Sign in to your role</h1>
        <p className="text-sm text-surface-faint">Use the username and password the dispatcher gave you.</p>
        <RoleSignInForm onSignedIn={() => undefined} />
      </RoleCard>
    );
  }

  if (!isRole) {
    return (
      <RoleCard>
        <h1 className="text-xl font-bold">Role logins</h1>
        <p className="text-sm">
          This page is for MCI role logins. You&apos;re signed in as {user.email}. <Link href="/events" className="underline">Go to your events</Link>.
        </p>
      </RoleCard>
    );
  }

  const roleLabel = account ? EVENT_ROLE_INFO[account.role]?.label ?? account.role : '';
  return (
    <RoleCard>
      {state === 'loading' && <Spinner />}
      {state === 'missing' && (
        <p className="text-sm" data-testid="role-missing">This login isn&apos;t linked to an event any more. Ask the dispatcher for a new one.</p>
      )}
      {state === 'ready' && account && (
        <div className="flex flex-col gap-2" data-testid="role-landing">
          <p className="text-xs uppercase tracking-wide text-surface-faint">{account.eventName}</p>
          <h1 className="text-2xl font-bold">{roleLabel}</h1>
          {account.disabled ? (
            <p className="rounded-md border border-status-red/40 bg-status-red/10 p-2 text-sm text-status-red" data-testid="role-disabled">
              This login has been disabled. Ask the dispatcher for a new one.
            </p>
          ) : (
            <p className="text-sm text-surface-faint" data-testid="role-active">
              You&apos;re signed in as <span className="font-mono">{account.username}</span>. Your {roleLabel} view will appear here.
            </p>
          )}
        </div>
      )}
      <Button variant="flat" onPress={() => void authService.signOut()} data-testid="role-signout">
        Sign out
      </Button>
    </RoleCard>
  );
}
