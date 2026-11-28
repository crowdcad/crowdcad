'use client';
/**
 * Covers a signed-in page after a stretch without input and asks for the
 * password again (timing in src/lib/idleLock.ts). Off until an admin
 * turns it on and sets the minutes (Profile > Admin > Security); a browser
 * marked as a display board never locks. Live data keeps updating
 * underneath, so nothing is missed while it's locked. Unlocking is recorded
 * in the audit log; "Sign out" ends the session instead.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Input } from '@heroui/react';
import { Lock } from '@/components/ui/icons';
import { auditLog, authService, SecondFactorRequiredError } from '@/lib/services';
import { FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';
import { LAST_ACTIVITY_KEY, LOCKED_KEY, readNumber, shouldLock, writeValue } from '@/lib/idleLock';
import { isDisplayBoard } from '@/lib/securitySettings';
import { useSecuritySettings } from '@/hooks/useSecuritySettings';
import { authErrorMessage } from '@/lib/authMessages';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export default function IdleLock({ enabled }: { enabled: boolean }) {
  const { settings } = useSecuritySettings();
  const minutes = settings.idleLockMinutes;
  const [displayBoard, setDisplayBoard] = useState(false);
  const active = enabled && minutes > 0 && !displayBoard;
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codePrompt, setCodePrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastWrite = useRef(0);

  // localStorage isn't readable during server rendering.
  useEffect(() => setDisplayBoard(isDisplayBoard()), []);

  const lock = useCallback(() => {
    writeValue(LOCKED_KEY, '1');
    setLocked(true);
  }, []);

  useEffect(() => {
    if (!active) {
      // Turned off (or this browser became a display board) while locked.
      setLocked(false);
      return;
    }
    // Locked in another tab, or idle past the limit since this browser was last used.
    if (readNumber(LOCKED_KEY) === 1 || shouldLock(readNumber(LAST_ACTIVITY_KEY), Date.now(), minutes)) lock();
    else writeValue(LAST_ACTIVITY_KEY, String(Date.now()));

    const onActivity = () => {
      if (readNumber(LOCKED_KEY) === 1) return;
      const now = Date.now();
      if (now - lastWrite.current > 5_000) {
        lastWrite.current = now;
        writeValue(LAST_ACTIVITY_KEY, String(now));
      }
    };
    const check = () => {
      if (readNumber(LOCKED_KEY) === 1 || shouldLock(readNumber(LAST_ACTIVITY_KEY), Date.now(), minutes)) lock();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const timer = window.setInterval(check, 10_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [active, minutes, lock]);

  const finishUnlock = () => {
    writeValue(LOCKED_KEY, null);
    writeValue(LAST_ACTIVITY_KEY, String(Date.now()));
    void auditLog.record({ action: 'auth.unlock' });
    setPassword('');
    setCode('');
    setCodePrompt(null);
    setLocked(false);
  };

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (codePrompt) await authService.completeSecondFactor(code);
      else await authService.reauthenticate(password);
      finishUnlock();
    } catch (err) {
      if (err instanceof SecondFactorRequiredError) setCodePrompt(err.message);
      else setError(authErrorMessage(err, 'That password is not right.'));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    writeValue(LOCKED_KEY, null);
    await authService.signOut();
    window.location.assign('/');
  };

  if (!active || !locked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-lock-title"
      data-testid="idle-lock"
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-surface-deepest/95 p-4 backdrop-blur-md"
    >
      <form onSubmit={unlock} className="flex w-full max-w-sm flex-col gap-4 border border-surface-liner bg-surface-deep p-6">
        <div className="flex items-center gap-3">
          <Lock className="h-5 w-5 text-accent" aria-hidden="true" />
          <h2 id="idle-lock-title" className="text-xl font-bold">
            Locked
          </h2>
        </div>
        {codePrompt ? (
          <>
            <p className="text-sm text-surface-light/80">{codePrompt}</p>
            <Input
              label="Code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(ev) => setCode(ev.target.value)}
              classNames={FIELD_CLASSNAMES}
            />
          </>
        ) : (
          <>
            <p className="text-sm text-surface-light/80">
              No activity for {minutes} minutes. Enter the password for {authService.currentUser?.email ?? 'this account'} to continue.
            </p>
            <Input
              type="password"
              label="Password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              classNames={FIELD_CLASSNAMES}
            />
          </>
        )}
        {error && (
          <p className="text-sm text-status-red" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" isLoading={busy} isDisabled={codePrompt ? !code.trim() : !password} className="bg-accent text-accent-foreground">
          Unlock
        </Button>
        <Button type="button" variant="light" onPress={signOut}>
          Sign out instead
        </Button>
      </form>
    </div>
  );
}
