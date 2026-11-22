/**
 * The organization's security settings (Profile > Admin > Security). One
 * record in the `settings` collection, readable by every signed-in account
 * and written only by admins. Everything is off until an admin turns it on:
 * whether an idle lock or two-step sign-in is needed is the organization's
 * call, made in its own risk assessment (docs/COMPLIANCE.md).
 *
 * - Idle lock: after this many minutes without input, a signed-in dispatch
 *   page covers itself and asks for the password again. A browser marked as
 *   a display board (a screen in a staffed, secured area) never locks.
 * - Two-step sign-in: who must enter a code after their password. Firebase
 *   uses an authenticator app, PocketBase a code sent by email. The database
 *   enforces it too: Firestore rules check the session's second step, and
 *   PocketBase's MFA rule reads this record (scripts/setup-pocketbase.js).
 *   Integration accounts are never asked.
 */
import { auditLog, dbService, type Unsubscribe } from '@/lib/services';

export type MfaPolicy = 'off' | 'admins' | 'everyone';

export interface SecuritySettings {
  /** 0 = no idle lock. */
  idleLockMinutes: number;
  mfa: MfaPolicy;
}

export const SETTINGS_COLLECTION = 'settings';
/**
 * The record's fixed id, so Firestore rules can read it with get() and the
 * PocketBase MFA rule can find it. Exactly 15 lowercase letters, the id
 * format PocketBase requires.
 */
export const SECURITY_SETTINGS_ID = 'securitysetting';
export const SECURITY_SETTINGS_KEY = 'security';

export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = { idleLockMinutes: 0, mfa: 'off' };

/** The minutes an admin can pick when the idle lock is on. */
export const IDLE_LOCK_LIMITS = { min: 1, max: 720, suggested: 15 } as const;

const MFA_POLICIES: readonly MfaPolicy[] = ['off', 'admins', 'everyone'];

/** Reads a stored record, falling back to "off" for anything missing or malformed. */
export function parseSecuritySettings(raw: unknown): SecuritySettings {
  const value = (raw as { value?: unknown } | null)?.value;
  if (!value || typeof value !== 'object') return { ...DEFAULT_SECURITY_SETTINGS };
  const v = value as Record<string, unknown>;
  const minutes = typeof v.idleLockMinutes === 'number' && Number.isFinite(v.idleLockMinutes) ? Math.floor(v.idleLockMinutes) : 0;
  return {
    idleLockMinutes: minutes > 0 ? Math.min(minutes, IDLE_LOCK_LIMITS.max) : 0,
    mfa: MFA_POLICIES.includes(v.mfa as MfaPolicy) ? (v.mfa as MfaPolicy) : 'off',
  };
}

/** Whether the policy asks this account for a second step. */
export function mfaRequiredFor(policy: MfaPolicy, isAdmin: boolean): boolean {
  return policy === 'everyone' || (policy === 'admins' && isAdmin);
}

/** Live settings; `onChange` gets the defaults when the record is missing or unreadable. */
export function subscribeSecuritySettings(onChange: (settings: SecuritySettings) => void): Unsubscribe {
  return dbService.subscribeToDocument(
    SETTINGS_COLLECTION,
    SECURITY_SETTINGS_ID,
    (snap) => onChange(parseSecuritySettings(snap.exists ? snap.data : null)),
    () => onChange({ ...DEFAULT_SECURITY_SETTINGS }),
  );
}

export function describeIdleLock(minutes: number): string {
  return minutes > 0 ? `after ${minutes} minute${minutes === 1 ? '' : 's'}` : 'off';
}

export function describeMfa(policy: MfaPolicy): string {
  return policy === 'everyone' ? 'everyone' : policy === 'admins' ? 'admins' : 'off';
}

/** Saves the settings (admins only) and records each change in the audit log. */
export async function saveSecuritySettings(next: SecuritySettings, previous: SecuritySettings): Promise<void> {
  const clean = parseSecuritySettings({ value: next });
  await dbService.setDocument(
    SETTINGS_COLLECTION,
    SECURITY_SETTINGS_ID,
    { key: SECURITY_SETTINGS_KEY, value: clean },
    { merge: true },
  );
  if (clean.idleLockMinutes !== previous.idleLockMinutes) {
    void auditLog.record({ action: 'settings.change', target: 'security.idleLock', detail: describeIdleLock(clean.idleLockMinutes) });
  }
  if (clean.mfa !== previous.mfa) {
    void auditLog.record({ action: 'settings.change', target: 'security.twoStep', detail: describeMfa(clean.mfa) });
  }
}

// ── Display boards ─────────────────────────────────────────────────

/** Marks this browser as a display board: the idle lock never covers it. */
export const DISPLAY_BOARD_KEY = 'ccad-display-board';

export function isDisplayBoard(): boolean {
  try {
    return globalThis.localStorage?.getItem(DISPLAY_BOARD_KEY) === '1';
  } catch {
    return false;
  }
}

/** Admins only (the switch lives in Profile > Admin > Security); recorded in the audit log. */
export function setDisplayBoard(on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(DISPLAY_BOARD_KEY, '1');
    else globalThis.localStorage?.removeItem(DISPLAY_BOARD_KEY);
  } catch {
    // Storage blocked: the browser can't be marked, so it keeps the lock.
  }
  void auditLog.record({ action: 'settings.change', target: 'security.displayBoard', detail: on ? 'this browser marked as a display board' : 'display board mark removed' });
}
