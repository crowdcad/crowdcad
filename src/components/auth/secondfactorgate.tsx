'use client';
/**
 * When the organization requires two-step sign-in (Profile > Admin >
 * Security) and this session didn't sign in with it, covers the signed-in
 * pages until the account sets up an authenticator app or confirms with its
 * code. Firebase only: there the database rules refuse a session without the
 * second step, so this explains why and fixes it. PocketBase asks for the
 * emailed code at sign-in, on its server, so a PocketBase session always
 * already has it.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@heroui/react';
import { ShieldCheck } from '@/components/ui/icons';
import { authService, type SecondFactorStatus } from '@/lib/services';
import { useAuth } from '@/hooks/useauth';
import { useAdmin } from '@/hooks/useAdmin';
import { useSecuritySettings } from '@/hooks/useSecuritySettings';
import { mfaRequiredFor } from '@/lib/securitySettings';
import { ConfirmIdentity, SecondFactorSetupFlow } from './secondfactor';

/** The dispatcher pages. Extension packs' own pages, Lite, training and the public pages are never covered. */
const GATED = /^\/(events|venues|profile)(\/|$)/;

export default function SecondFactorGate() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { settings, loading: settingsLoading } = useSecuritySettings();
  const [status, setStatus] = useState<SecondFactorStatus | null>(null);

  const required = !!user && !adminLoading && !settingsLoading && mfaRequiredFor(settings.mfa, isAdmin);

  useEffect(() => {
    if (!required) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    authService
      .secondFactorStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus(null));
    return () => {
      cancelled = true;
    };
  }, [required, user]);

  if (!pathname || !GATED.test(pathname) || !required || !status) return null;
  if (status.method !== 'app' || status.usedThisSession) return null;

  // Data that was refused before the second step reloads with it.
  const done = () => window.location.reload();

  const signOut = async () => {
    await authService.signOut();
    window.location.assign('/');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="second-factor-gate-title"
      data-testid="second-factor-gate"
      className="fixed inset-0 z-[9997] flex items-center justify-center overflow-y-auto bg-surface-deepest/95 p-4 backdrop-blur-md"
    >
      <div className="flex w-full max-w-md flex-col gap-4 border border-surface-liner bg-surface-deep p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" />
          <h2 id="second-factor-gate-title" className="text-xl font-bold">
            Two-step sign-in
          </h2>
        </div>
        {status.enrolled ? (
          <>
            <p className="text-sm text-surface-light/80">
              Your organization requires a code from your authenticator app. Confirm your password and enter the current code to continue.
            </p>
            <ConfirmIdentity onConfirmed={done} />
          </>
        ) : (
          <>
            <p className="text-sm text-surface-light/80">
              Your organization requires two-step sign-in. Set up an authenticator app to continue. After this, you&apos;ll enter a code when you sign in on a new device or after signing out.
            </p>
            <SecondFactorSetupFlow method="app" onDone={done} />
          </>
        )}
        <Button variant="light" onPress={signOut} className="self-start">
          Sign out instead
        </Button>
      </div>
    </div>
  );
}
