'use client';
/**
 * Profile > Admin > Security: the organization's idle lock, display boards
 * and two-step sign-in (src/lib/securitySettings.ts). All off until an admin
 * turns them on; whether they're needed is the organization's call, made in
 * its own risk assessment. Every change is recorded in the audit log.
 */
import { useEffect, useState } from 'react';
import { Button, Card, CardBody, Input, Radio, RadioGroup, Switch } from '@heroui/react';
import { authService, type SecondFactorStatus } from '@/lib/services';
import { useSecuritySettings } from '@/hooks/useSecuritySettings';
import {
  IDLE_LOCK_LIMITS,
  isDisplayBoard,
  saveSecuritySettings,
  setDisplayBoard,
  type MfaPolicy,
  type SecuritySettings,
} from '@/lib/securitySettings';
import { ConfirmIdentity, SecondFactorSetupFlow } from '@/components/auth/secondfactor';
import { FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';
import { authErrorMessage } from '@/lib/authMessages';

const SWITCH = { wrapper: 'group-data-[selected=true]:bg-accent' };
// Radio defaults to the theme's near-black "primary"; mark the choice in accent blue.
const RADIO = { wrapper: '!rounded-circle border-surface-faint group-data-[selected=true]:!border-accent', control: '!rounded-circle !bg-accent' };

function Row({ title, description, children }: { title: string; description: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-surface-light/70">{description}</p>
      </div>
      {children}
    </div>
  );
}

export default function AdminSecuritySection() {
  const { settings, loading } = useSecuritySettings();
  const [draft, setDraft] = useState<SecuritySettings>(settings);
  const [minutesText, setMinutesText] = useState('');
  const [board, setBoard] = useState(false);
  const [own, setOwn] = useState<SecondFactorStatus | null>(null);
  const [emailTested, setEmailTested] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(settings);
    setMinutesText(settings.idleLockMinutes > 0 ? String(settings.idleLockMinutes) : String(IDLE_LOCK_LIMITS.suggested));
  }, [settings]);

  useEffect(() => setBoard(isDisplayBoard()), []);

  const refreshOwn = () => authService.secondFactorStatus().then(setOwn, () => setOwn(null));
  useEffect(() => {
    void refreshOwn();
  }, []);

  if (loading) return null;

  const lockOn = draft.idleLockMinutes > 0;
  const minutes = Number(minutesText);
  const minutesValid = Number.isInteger(minutes) && minutes >= IDLE_LOCK_LIMITS.min && minutes <= IDLE_LOCK_LIMITS.max;
  const next: SecuritySettings = { ...draft, idleLockMinutes: lockOn ? (minutesValid ? minutes : 0) : 0 };
  const dirty = next.idleLockMinutes !== settings.idleLockMinutes || next.mfa !== settings.mfa;

  // Turning two-step on needs this admin's own second step first, so the
  // admin can't lock themselves (or everyone) out of a setup that doesn't
  // work yet: no authenticator app support on the Firebase project, or no
  // email on the PocketBase server.
  const isApp = own?.method === 'app';
  const ownReady = isApp ? !!own?.usedThisSession : emailTested;
  const needsOwn = next.mfa !== 'off' && settings.mfa === 'off' && !ownReady;

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveSecuritySettings(next, settings);
      setMessage('Saved.');
    } catch (err) {
      setError(authErrorMessage(err, "Couldn't save the security settings."));
    } finally {
      setSaving(false);
    }
  };

  const method = isApp ? 'a code from an authenticator app' : 'a code sent by email';

  return (
    <Card isBlurred className="w-full border border-default-200 bg-surface-deep/40" data-testid="admin-security-section">
      <CardBody className="space-y-6 p-6">
        <div>
          <h3 className="text-xl font-semibold">Security</h3>
          <p className="mt-1 text-sm text-surface-light/70">
            Off until you turn them on. Whether your organization needs them is its decision, based on its own risk assessment. Changes are recorded in the audit log.
          </p>
        </div>

        <div className="space-y-3">
          <Row
            title="Idle lock"
            description="After a set time without input, a signed-in dispatch page covers itself and asks for the password again. Live data keeps updating underneath."
          >
            <Switch
              isSelected={lockOn}
              onValueChange={(on) => setDraft((d) => ({ ...d, idleLockMinutes: on ? IDLE_LOCK_LIMITS.suggested : 0 }))}
              aria-label="Idle lock"
              classNames={SWITCH}
            />
          </Row>
          {lockOn && (
            <Input
              type="number"
              label="Minutes without input"
              min={IDLE_LOCK_LIMITS.min}
              max={IDLE_LOCK_LIMITS.max}
              value={minutesText}
              onChange={(e) => setMinutesText(e.target.value)}
              isInvalid={!minutesValid}
              errorMessage={`Between ${IDLE_LOCK_LIMITS.min} and ${IDLE_LOCK_LIMITS.max} minutes.`}
              classNames={FIELD_CLASSNAMES}
              className="max-w-xs"
            />
          )}
        </div>

        <div className="border-t border-default-200 pt-6">
          <Row
            title="This browser is a display board"
            description="For a screen in a staffed, secured area, such as a team map on the wall. The idle lock never covers it. Applies only to this browser."
          >
            <Switch
              isSelected={board}
              onValueChange={(on) => {
                setDisplayBoard(on);
                setBoard(on);
              }}
              aria-label="This browser is a display board"
              classNames={SWITCH}
            />
          </Row>
        </div>

        <div className="space-y-3 border-t border-default-200 pt-6">
          <Row
            title="Two-step sign-in"
            description={
              <>
                After their password, people enter {method}. Signing in once per device is enough until they sign out.
              </>
            }
          />
          <RadioGroup
            aria-label="Who must use two-step sign-in"
            value={draft.mfa}
            onValueChange={(v) => setDraft((d) => ({ ...d, mfa: v as MfaPolicy }))}
          >
            <Radio value="off" classNames={RADIO}>Off</Radio>
            <Radio value="admins" classNames={RADIO}>Admins only</Radio>
            <Radio value="everyone" classNames={RADIO}>Everyone (admins and dispatchers)</Radio>
          </RadioGroup>
          {next.mfa !== settings.mfa && next.mfa !== 'off' && (
            <p className="text-sm text-surface-light/80">
              {isApp
                ? `${next.mfa === 'everyone' ? 'Everyone' : 'Admins'} without an authenticator app will be asked to set one up the next time they open CrowdCAD.`
                : `${next.mfa === 'everyone' ? 'Everyone' : 'Admins'} will be asked for an emailed code at their next sign-in.`}
            </p>
          )}

          {needsOwn && own && (
            <div className="space-y-3 border border-surface-liner p-4">
              <p className="text-sm font-medium">First, use two-step sign-in yourself</p>
              {isApp && own.enrolled ? (
                <>
                  <p className="text-sm text-surface-light/80">Confirm with your authenticator app so this session has the second step.</p>
                  <ConfirmIdentity onConfirmed={refreshOwn} />
                </>
              ) : (
                <SecondFactorSetupFlow
                  method={isApp ? 'app' : 'email'}
                  onDone={() => {
                    if (isApp) void refreshOwn();
                    else setEmailTested(true);
                  }}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-default-200 pt-6">
          <Button
            onPress={save}
            isLoading={saving}
            isDisabled={!dirty || needsOwn || (lockOn && !minutesValid)}
            className="bg-accent text-accent-foreground"
          >
            Save changes
          </Button>
          {message && !dirty && <span className="text-sm text-surface-light/70">{message}</span>}
          {error && (
            <span className="text-sm text-status-red" role="alert">
              {error}
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
