'use client';

import React, { use, useEffect, useRef, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/services';
import { isRoleLoginEmail } from '@/lib/roleAccounts';
import RoleSignInForm, { RoleCard, roleSignInError, signInRole } from '@/components/rolelogin/rolesignin';

/**
 * The one-tap link for an MCI role login (#142): /r/<username>#<password>.
 * The password is in the fragment (never sent to a server); it is removed
 * from the address bar straight away. Someone already signed in with a normal
 * account is asked first, since signing in here signs them out of it.
 */
export default function RoleLinkPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState<string | null>(null);
  const [state, setState] = useState<'reading' | 'confirm' | 'signing' | 'form' | 'error'>('reading');
  const [error, setError] = useState<string | null>(null);
  const [otherEmail, setOtherEmail] = useState<string | null>(null);
  const started = useRef(false);

  const go = () => router.replace('/role');

  const signIn = async (pw: string) => {
    setState('signing');
    try {
      await signInRole(username, pw);
      go();
    } catch (err) {
      setError(roleSignInError(err));
      setState('error');
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const raw = window.location.hash.replace(/^#/, '');
    const pw = raw ? decodeURIComponent(raw) : '';
    // Keep the password out of the address bar, history and screenshots.
    if (raw) window.history.replaceState(window.history.state, '', window.location.pathname);
    const unsub = authService.onAuthStateChanged((u) => {
      unsub();
      if (!pw) return setState('form');
      setPassword(pw);
      if (u && !isRoleLoginEmail(u.email)) {
        setOtherEmail(u.email ?? 'another account');
        return setState('confirm');
      }
      void signIn(pw);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on arrival
  }, []);

  return (
    <RoleCard>
      <h1 className="text-xl font-bold">Sign in to your role</h1>
      {(state === 'reading' || state === 'signing') && (
        <div className="flex items-center gap-3 text-surface-light" data-testid="role-link-signing">
          <Spinner size="sm" /> Signing in as <span className="font-mono">{username}</span>…
        </div>
      )}
      {state === 'confirm' && password && (
        <>
          <p className="text-sm">
            You&apos;re signed in as <span className="font-semibold">{otherEmail}</span>. Signing in as <span className="font-mono">{username}</span> signs you out of that account on this device.
          </p>
          <div className="flex gap-2">
            <Button className="bg-accent text-surface-light" onPress={() => void signIn(password)} data-testid="role-link-continue">
              Continue as {username}
            </Button>
            <Button variant="flat" onPress={() => router.replace('/')}>Cancel</Button>
          </div>
        </>
      )}
      {state === 'error' && <p className="text-sm text-status-red" data-testid="role-link-error">{error}</p>}
      {(state === 'form' || state === 'error') && <RoleSignInForm initialUsername={username} onSignedIn={go} />}
    </RoleCard>
  );
}
