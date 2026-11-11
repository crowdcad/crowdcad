'use client';

import React, { useState } from 'react';
import { Button, Card, CardBody, Input } from '@heroui/react';
import { authService } from '@/lib/services';
import { signInEmailFor } from '@/lib/roleAccounts';

/**
 * Signs in an MCI role login (#142) with its username and password, used by
 * the one-tap link page (/r/<username>) and the role page (/role). The normal
 * sign-in box also accepts a role username.
 */

export const ROLE_INPUT_CLASSNAMES = {
  label: 'text-surface-light font-medium',
  input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
  inputWrapper: 'rounded-large px-4 hover:bg-surface-deep',
} as const;

export function RoleCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-56px)] items-start justify-center px-4 pt-16">
      <Card className="w-full max-w-md border border-default-200" style={{ backgroundColor: 'hsl(var(--surface-bg-2) / 0.5)' }}>
        <CardBody className="flex flex-col gap-4 p-6 text-surface-light">{children}</CardBody>
      </Card>
    </div>
  );
}

/** A plain message for a failed role sign-in. */
export function roleSignInError(err: unknown): string {
  const code = (err as { code?: string }).code ?? '';
  if (/user-disabled/.test(code)) return 'This login has been disabled. Ask the dispatcher for a new one.';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login|invalid-email/.test(code))
    return 'That username and password don’t match. Check them, or ask the dispatcher for a new login.';
  return err instanceof Error && err.message ? err.message : 'Could not sign in.';
}

export async function signInRole(username: string, password: string): Promise<void> {
  await authService.signIn(signInEmailFor(username), password);
  document.cookie = 'ccad_auth=1; Max-Age=604800; Path=/; SameSite=Lax';
}

export default function RoleSignInForm({ initialUsername = '', onSignedIn }: { initialUsername?: string; onSignedIn: () => void }) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await signInRole(username, password);
      onSignedIn();
    } catch (err) {
      setError(roleSignInError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Input
        label="Username"
        value={username}
        onValueChange={setUsername}
        autoComplete="username"
        autoCapitalize="none"
        classNames={ROLE_INPUT_CLASSNAMES}
        data-testid="role-signin-username"
      />
      <Input
        label="Password"
        type="password"
        value={password}
        onValueChange={setPassword}
        autoComplete="current-password"
        classNames={ROLE_INPUT_CLASSNAMES}
        data-testid="role-signin-password"
      />
      {error && <p className="text-sm text-status-red" data-testid="role-signin-error">{error}</p>}
      <Button type="submit" className="bg-accent text-surface-light" isLoading={busy} isDisabled={!username.trim() || !password} data-testid="role-signin-submit">
        Sign in
      </Button>
    </form>
  );
}
