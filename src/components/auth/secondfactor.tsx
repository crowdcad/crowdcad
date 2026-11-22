'use client';
/**
 * Pieces of two-step sign-in shared by the sign-in modal, the idle lock,
 * Profile > Security and the gate that asks for it when the organization
 * requires it (src/lib/securitySettings.ts).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { Button, Input } from '@heroui/react';
import { renderSVG } from 'uqr';
import { authService, SecondFactorRequiredError, ServiceError, type SecondFactorSetup } from '@/lib/services';
import { FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';
import { authErrorMessage } from '@/lib/authMessages';

/** The otpauth:// link as a QR code for an authenticator app to scan. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const svg = useMemo(() => renderSVG(value, { border: 2, whiteColor: '#ffffff', blackColor: '#000000' }), [value]);
  return (
    <div
      role="img"
      aria-label={label}
      className="h-44 w-44 shrink-0 bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
      // uqr builds this SVG from the link; it contains only rectangles.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** A one-time code box. */
export function CodeInput({ value, onChange, autoFocus = true }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <Input
      label="Code"
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      classNames={FIELD_CLASSNAMES}
    />
  );
}

/**
 * Confirms the password (and the current code when an app is already set
 * up). Firebase wants a recent sign-in before changing an account's second
 * step; the code doubles as the "it's really you" check for removal.
 */
export function ConfirmIdentity({ onConfirmed, submitLabel = 'Continue' }: { onConfirmed: () => void | Promise<void>; submitLabel?: string }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codePrompt, setCodePrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (codePrompt) await authService.completeSecondFactor(code);
      else await authService.reauthenticate(password);
      await onConfirmed();
    } catch (err) {
      if (err instanceof SecondFactorRequiredError) setCodePrompt(err.message);
      else setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {codePrompt ? (
        <>
          <p className="text-sm text-surface-light/80">{codePrompt}</p>
          <CodeInput value={code} onChange={setCode} />
        </>
      ) : (
        <Input
          type="password"
          label="Your password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          classNames={FIELD_CLASSNAMES}
        />
      )}
      {error && (
        <p className="text-sm text-status-red" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" isLoading={busy} isDisabled={codePrompt ? !code.trim() : !password} className="self-start bg-accent text-accent-foreground">
        {submitLabel}
      </Button>
    </form>
  );
}

/**
 * Sets up the second step. App (Firebase): confirm the password, scan the QR
 * code, enter the first code. Email (PocketBase): send a test code and enter
 * it, which proves mail reaches this account.
 */
export function SecondFactorSetupFlow({ method, onDone, onCancel }: { method: 'app' | 'email'; onDone: () => void; onCancel?: () => void }) {
  const [setup, setSetup] = useState<SecondFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setSetup(await authService.startSecondFactorSetup());
      setNeedsVerification(false);
    } catch (err) {
      if (err instanceof ServiceError && err.code === 'auth/unverified-email') setNeedsVerification(true);
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const finish = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authService.finishSecondFactorSetup(code);
      onDone();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sendVerification = async () => {
    try {
      await authService.sendEmailVerification();
      setVerificationSent(true);
    } catch (err) {
      setError(authErrorMessage(err));
    }
  };

  const cancel = onCancel && (
    <Button type="button" variant="light" onPress={onCancel}>
      Cancel
    </Button>
  );

  if (!setup) {
    if (method === 'email') {
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-surface-light/80">
            Sign-in codes are sent by email. Send yourself a test code to check that email works on this server.
          </p>
          {error && (
            <p className="text-sm text-status-red" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button onPress={start} isLoading={busy} className="bg-accent text-accent-foreground">
              Send a test code
            </Button>
            {cancel}
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-surface-light/80">
          You&apos;ll need an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password.
        </p>
        <ConfirmIdentity onConfirmed={start} submitLabel="Continue" />
        {error && (
          <p className="text-sm text-status-red" role="alert">
            {error}
          </p>
        )}
        {needsVerification && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="bordered" onPress={sendVerification} isDisabled={verificationSent}>
              {verificationSent ? 'Link sent' : 'Send verification link'}
            </Button>
            {verificationSent && (
              <Button size="sm" variant="light" onPress={start} isLoading={busy}>
                I&apos;ve opened the link
              </Button>
            )}
          </div>
        )}
        {cancel}
      </div>
    );
  }

  return (
    <form onSubmit={finish} className="flex flex-col gap-4">
      {setup.method === 'app' && setup.uri ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <QrCode value={setup.uri} label="QR code for your authenticator app" />
          <div className="flex min-w-0 flex-col gap-2 text-sm text-surface-light/80">
            <p>Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
            <p>
              Can&apos;t scan? Enter this key instead:
              <span className="mt-1 block break-all font-mono text-surface-light" data-testid="totp-secret">
                {setup.secret}
              </span>
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-surface-light/80">Enter the code sent to {setup.sentTo}.</p>
      )}
      <CodeInput value={code} onChange={setCode} />
      {error && (
        <p className="text-sm text-status-red" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" isLoading={busy} isDisabled={!code.trim()} className="bg-accent text-accent-foreground">
          {setup.method === 'app' ? 'Turn on' : 'Check code'}
        </Button>
        {cancel}
      </div>
    </form>
  );
}
