import { describe, expect, it, vi } from 'vitest';

const setDocument = vi.fn(async () => {});
const record = vi.fn(async () => {});
vi.mock('@/lib/services', () => ({ dbService: { setDocument }, auditLog: { record } }));

const { DEFAULT_SECURITY_SETTINGS, SECURITY_SETTINGS_ID, mfaRequiredFor, parseSecuritySettings, saveSecuritySettings } = await import(
  './securitySettings'
);

describe('security settings', () => {
  it('is off until an admin turns something on', () => {
    expect(DEFAULT_SECURITY_SETTINGS).toEqual({ idleLockMinutes: 0, mfa: 'off' });
    expect(parseSecuritySettings(null)).toEqual({ idleLockMinutes: 0, mfa: 'off' });
    expect(parseSecuritySettings({ key: 'security' })).toEqual({ idleLockMinutes: 0, mfa: 'off' });
  });

  it('reads stored values and falls back on anything malformed', () => {
    expect(parseSecuritySettings({ value: { idleLockMinutes: 20, mfa: 'admins' } })).toEqual({ idleLockMinutes: 20, mfa: 'admins' });
    expect(parseSecuritySettings({ value: { idleLockMinutes: -5, mfa: 'sometimes' } })).toEqual({ idleLockMinutes: 0, mfa: 'off' });
    expect(parseSecuritySettings({ value: { idleLockMinutes: 99999 } }).idleLockMinutes).toBe(720);
    expect(parseSecuritySettings({ value: { idleLockMinutes: '15' } }).idleLockMinutes).toBe(0);
  });

  it('asks admins only, or everyone, for the second step', () => {
    expect(mfaRequiredFor('off', true)).toBe(false);
    expect(mfaRequiredFor('admins', true)).toBe(true);
    expect(mfaRequiredFor('admins', false)).toBe(false);
    expect(mfaRequiredFor('everyone', false)).toBe(true);
  });

  it('uses an id PocketBase accepts (15 lowercase letters or digits)', () => {
    expect(SECURITY_SETTINGS_ID).toMatch(/^[a-z0-9]{15}$/);
  });

  it('saves only the known fields and records each change', async () => {
    await saveSecuritySettings({ idleLockMinutes: 10, mfa: 'everyone' }, { idleLockMinutes: 0, mfa: 'off' });
    expect(setDocument).toHaveBeenCalledWith('settings', SECURITY_SETTINGS_ID, { key: 'security', value: { idleLockMinutes: 10, mfa: 'everyone' } }, { merge: true });
    expect(record.mock.calls.map((c) => (c as unknown as [{ target: string; detail: string }])[0])).toEqual([
      expect.objectContaining({ target: 'security.idleLock', detail: 'after 10 minutes' }),
      expect.objectContaining({ target: 'security.twoStep', detail: 'everyone' }),
    ]);
  });
});
