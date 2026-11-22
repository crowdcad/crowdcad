'use client';
/**
 * Profile > Security > Two-step sign-in: the account's own second step.
 * Firebase: set up or remove an authenticator app (anyone may, even when the
 * organization doesn't require it). PocketBase: codes come by email whenever
 * the organization requires them, so there's nothing to set up here.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, CardBody, Chip } from '@heroui/react';
import { authService, type SecondFactorStatus } from '@/lib/services';
import { useAdmin } from '@/hooks/useAdmin';
import { useSecuritySettings } from '@/hooks/useSecuritySettings';
import { mfaRequiredFor } from '@/lib/securitySettings';
import { ConfirmIdentity, SecondFactorSetupFlow } from '@/components/auth/secondfactor';
import { authErrorMessage } from '@/lib/authMessages';
import { PROFILE_ACTION_BUTTON } from './buttonStyles';

export default function TwoStepCard() {
  const { isAdmin } = useAdmin();
  const { settings } = useSecuritySettings();
  const required = mfaRequiredFor(settings.mfa, isAdmin);
  const [status, setStatus] = useState<SecondFactorStatus | null>(null);
  const [mode, setMode] = useState<'view' | 'setup' | 'remove'>('view');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    authService.secondFactorStatus().then(setStatus, () => setStatus(null));
  }, []);

  useEffect(refresh, [refresh]);

  const remove = async () => {
    setError(null);
    try {
      await authService.removeSecondFactor();
    } catch (err) {
      setError(authErrorMessage(err));
      return;
    }
    // Firebase may end a session that signed in with the removed app.
    if (!authService.currentUser) {
      window.location.assign('/');
      return;
    }
    setMode('view');
    refresh();
  };

  if (!status) return null;

  return (
    <Card isBlurred className="w-full border border-default-200 bg-surface-deep/40" data-testid="two-step-card">
      <CardBody className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold">Two-step sign-in</h3>
              {status.method === 'app' && (
                <Chip size="sm" variant="flat" color={status.enrolled ? 'success' : 'default'}>
                  {status.enrolled ? 'On' : 'Off'}
                </Chip>
              )}
            </div>
            <p className="mt-1 text-sm text-surface-light/70">
              {status.method === 'email'
                ? required
                  ? 'Your organization requires a code, sent to your email, each time you sign in.'
                  : 'When your organization requires it, a code is sent to your email each time you sign in.'
                : status.enrolled
                  ? 'You enter a code from your authenticator app when you sign in on a new device or after signing out.'
                  : required
                    ? 'Your organization requires an authenticator app.'
                    : 'Add a code from an authenticator app to your sign-in.'}
            </p>
          </div>
          {status.method === 'app' && mode === 'view' && (
            status.enrolled ? (
              !required && (
                <Button variant="bordered" size="md" radius="lg" className={PROFILE_ACTION_BUTTON} onPress={() => setMode('remove')}>
                  Remove
                </Button>
              )
            ) : (
              <Button variant="bordered" size="md" radius="lg" className={PROFILE_ACTION_BUTTON} onPress={() => setMode('setup')}>
                Set up
              </Button>
            )
          )}
        </div>

        {mode === 'setup' && (
          <SecondFactorSetupFlow
            method="app"
            onDone={() => {
              setMode('view');
              refresh();
            }}
            onCancel={() => setMode('view')}
          />
        )}

        {mode === 'remove' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-surface-light/80">Confirm it&apos;s you to remove the authenticator app.</p>
            <ConfirmIdentity onConfirmed={remove} submitLabel="Remove" />
            {error && (
              <p className="text-sm text-status-red" role="alert">
                {error}
              </p>
            )}
            <Button variant="light" className="self-start" onPress={() => setMode('view')}>
              Cancel
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
