/**
 * Idle lock timing. When an admin turns it on (Profile > Admin >
 * Security, src/lib/securitySettings.ts), a signed-in dispatch page covers
 * itself after that many minutes without input and asks for the password
 * again. It's off until then. The last activity
 * and the locked flag live in localStorage, shared by every tab, so reloading
 * the page or opening a new tab doesn't get around the lock, and activity in
 * one tab keeps the others open.
 */

export const LAST_ACTIVITY_KEY = 'ccad-last-activity';
export const LOCKED_KEY = 'ccad-idle-locked';

/** Whether a page whose last input was at `lastActivity` should be locked now. */
export function shouldLock(lastActivity: number | null, now: number, minutes: number): boolean {
  if (minutes <= 0 || lastActivity === null) return false;
  return now - lastActivity >= minutes * 60_000;
}

/** Reads a stored number, or null when storage is unavailable or empty. */
export function readNumber(key: string): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const n = raw === null || raw === undefined ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeValue(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    // Private mode or full storage: the lock still works within this tab.
  }
}
