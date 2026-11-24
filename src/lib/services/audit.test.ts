import { describe, expect, it, vi } from 'vitest';
import { AUDIT_FIELDS, auditCsv, createAuditLog, withAuthAudit, type AuditEntry } from './audit';
import type { IAuthService } from './IAuthService';
import type { IDbService } from './IDbService';
import { SecondFactorRequiredError, type ServiceUser } from './types';

function fakeDb() {
  const rows: { id: string; data: AuditEntry }[] = [];
  const db = {
    addDocument: vi.fn(async (_c: string, data: AuditEntry) => {
      rows.push({ id: `r${rows.length}`, data });
      return `r${rows.length - 1}`;
    }),
    queryCollection: vi.fn(async () => rows.map((r) => ({ id: r.id, exists: true, data: r.data }))),
  } as unknown as IDbService;
  return { db, rows };
}

const alice: ServiceUser = { uid: 'u1', email: 'alice@agency.example' } as ServiceUser;

describe('audit log', () => {
  it('records the signed-in account, clipped fields and nothing else', async () => {
    const { db, rows } = fakeDb();
    const log = createAuditLog(db, () => alice, () => 1000);
    await log.record({ action: 'event.export', eventId: 'e1', target: 'x'.repeat(300), detail: 'summary CSV' });
    expect(rows).toHaveLength(1);
    const row = rows[0].data;
    expect(row).toMatchObject({ t: 1000, uid: 'u1', actor: 'alice@agency.example', action: 'event.export', eventId: 'e1', detail: 'summary CSV' });
    expect(row.target).toHaveLength(200);
    expect(Object.keys(row).every((k) => (AUDIT_FIELDS as readonly string[]).includes(k))).toBe(true);
  });

  it('records nothing without a signed-in account (Lite)', async () => {
    const { db, rows } = fakeDb();
    await createAuditLog(db, () => null).record({ action: 'event.export' });
    expect(rows).toHaveLength(0);
  });

  it('never throws when the write fails', async () => {
    const db = { addDocument: vi.fn(async () => Promise.reject(new Error('denied'))) } as unknown as IDbService;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(createAuditLog(db, () => alice).record({ action: 'auth.signIn' })).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('lists recent rows newest first', async () => {
    const { db } = fakeDb();
    let t = 0;
    const log = createAuditLog(db, () => alice, () => (t += 10));
    await log.record({ action: 'auth.signIn' });
    await log.record({ action: 'auth.signOut' });
    expect((await log.recent()).map((r) => r.action)).toEqual(['auth.signOut', 'auth.signIn']);
  });

  it('records sign-in after it succeeds and sign-out before it happens', async () => {
    const order: string[] = [];
    let user: ServiceUser | null = null;
    const auth = {
      signIn: vi.fn(async () => {
        order.push('signIn');
        user = alice;
        return alice;
      }),
      signOut: vi.fn(async () => {
        order.push('signOut');
        user = null;
      }),
      get currentUser() {
        return user;
      },
    } as unknown as IAuthService;
    const log = { record: vi.fn(async (i: { action: string }) => void order.push(`audit:${i.action}:${user ? 'in' : 'out'}`)), recent: vi.fn() };
    const audited = withAuthAudit(auth, log);
    await audited.signIn('a', 'b');
    await audited.signOut();
    expect(order).toEqual(['signIn', 'audit:auth.signIn:in', 'audit:auth.signOut:in', 'signOut']);
    expect(audited.currentUser).toBeNull();
  });

  it('records a sign-in that stopped for its code once the code is accepted, and not an unlock', async () => {
    const auth = {
      signIn: vi.fn(async () => Promise.reject(new SecondFactorRequiredError('app'))),
      reauthenticate: vi.fn(async () => Promise.reject(new SecondFactorRequiredError('email', 'a@x.org'))),
      completeSecondFactor: vi.fn(async () => {}),
      currentUser: alice,
    } as unknown as IAuthService;
    const log = { record: vi.fn(async () => {}), recent: vi.fn() };
    const audited = withAuthAudit(auth, log);
    await expect(audited.signIn('a', 'b')).rejects.toBeInstanceOf(SecondFactorRequiredError);
    expect(log.record).not.toHaveBeenCalled();
    await audited.completeSecondFactor('123456');
    expect(log.record).toHaveBeenCalledWith({ action: 'auth.signIn', detail: 'with a second step' });
    log.record.mockClear();
    // Re-authenticating (the idle lock records its own unlock) adds no sign-in row.
    await expect(audited.reauthenticate('b')).rejects.toBeInstanceOf(SecondFactorRequiredError);
    await audited.completeSecondFactor('123456');
    expect(log.record).not.toHaveBeenCalled();
  });
});

describe('auditCsv', () => {
  it('writes a header and one row per entry, quoting and defusing what a spreadsheet would misread', () => {
    const rows: AuditEntry[] = [
      { t: Date.UTC(2026, 10, 23, 15, 4, 5), uid: 'u1', actor: 'alice@agency.example', action: 'event.export', target: 'Fair, "North" gate', eventId: 'e1', detail: '=HYPERLINK("x")' },
      { t: Date.UTC(2026, 10, 23, 15, 0, 0), uid: 'u2', actor: 'resp-ab12 (Sam, Medic 1)', action: 'field.status', detail: 'line one\nline two' },
    ];
    const lines = auditCsv(rows, 'UTC').split('\r\n');
    expect(lines[0]).toBe('Time (UTC),Local time,Who,Account ID,Action,On,Event ID,Detail');
    expect(lines[1]).toBe(`2026-11-23T15:04:05.000Z,2026-11-23 15:04:05,alice@agency.example,u1,event.export,"Fair, ""North"" gate",e1,"'=HYPERLINK(""x"")"`);
    // A line break inside a cell stays inside its quotes.
    expect(lines[2]).toBe('2026-11-23T15:00:00.000Z,2026-11-23 15:00:00,"resp-ab12 (Sam, Medic 1)",u2,field.status,,,"line one\nline two"');
    expect(auditCsv([], 'UTC')).toBe('Time (UTC),Local time,Who,Account ID,Action,On,Event ID,Detail\r\n');
  });
});
