import { describe, expect, it } from 'vitest';
import {
  EVENT_ROLES,
  isEventRole,
  isRoleLoginEmail,
  newRolePassword,
  newRoleUsername,
  roleLoginLink,
  roleLoginMessage,
  signInEmailFor,
} from './roleAccounts';

describe('role logins', () => {
  it('makes usernames with the role prefix that sign in as role emails', () => {
    for (const role of EVENT_ROLES) {
      const u = newRoleUsername(role);
      expect(u).toMatch(/^[a-z]{2,5}-[a-z0-9]{4}$/);
      expect(signInEmailFor(u)).toBe(`${u}@role.crowdcad.org`);
    }
    expect(newRoleUsername('responder')).toMatch(/^resp-/);
  });

  it('leaves real emails alone and accepts a username in any case or with spaces', () => {
    expect(signInEmailFor('alex@example.com')).toBe('alex@example.com');
    expect(signInEmailFor('  TREAT-7K2Q ')).toBe('treat-7k2q@role.crowdcad.org');
    expect(signInEmailFor('not a username')).toBe('not a username');
  });

  it('makes 10-character passwords without look-alike characters', () => {
    const p = newRolePassword();
    expect(p).toHaveLength(10);
    expect(p).not.toMatch(/[0O1lI]/);
  });

  it('recognises role emails and roles', () => {
    expect(isRoleLoginEmail('treat-7k2q@role.crowdcad.org')).toBe(true);
    expect(isRoleLoginEmail('alex@example.com')).toBe(false);
    expect(isRoleLoginEmail(null)).toBe(false);
    expect(isEventRole('responder')).toBe(true);
    expect(isEventRole('treatment')).toBe(true); // legacy, acts as Responder
    expect(isEventRole('admin')).toBe(false);
  });

  it('puts the password in the link fragment, not the path', () => {
    const link = roleLoginLink('https://crowdcad.org/', 'treat-7k2q', 'Ab3#x');
    expect(link).toBe('https://crowdcad.org/r/treat-7k2q#Ab3%23x');
    expect(roleLoginMessage('https://crowdcad.org', 'Spring Show', 'responder', 'treat-7k2q', 'pw')).toContain(
      'Or sign in at crowdcad.org with username treat-7k2q and password pw',
    );
  });
});
