/**
 * The audit log: an append-only record of who did what and when, for
 * deployments that must be able to show it (HIPAA audit controls and the
 * like). Rows go to the `audit` collection. Firestore rules and PocketBase
 * API rules let a signed-in account create rows only as itself, let admins
 * read them, and let no one edit or delete them.
 *
 * What's recorded: sign-in and sign-out, idle-lock unlocks, password
 * changes, two-step sign-in set up or removed, account deletion, event create/end/delete/export, sharing changes, admin grants
 * and settings changes. Never patient details: `target` names the thing
 * acted on (an event name, an email), `detail` is a short note. Reads are
 * left to the backend's own logs (Firebase Cloud Audit Logs data access,
 * PocketBase request logs); see docs/COMPLIANCE.md.
 *
 * Pro packs record their own rows with `auditLog.record` (shared code, so no
 * extension member is needed). Lite has no account, so nothing is recorded.
 * A failed write is reported in the console and never blocks the action.
 */
import type { IAuthService } from './IAuthService';
import type { IDbService } from './IDbService';
import { SecondFactorRequiredError, type ServiceUser } from './types';

export const AUDIT_COLLECTION = 'audit';

/** Every field a row may have (the rules allow only these). */
export const AUDIT_FIELDS = ['t', 'uid', 'actor', 'action', 'target', 'eventId', 'detail'] as const;

export type AuditAction =
  | 'auth.signIn'
  | 'auth.signOut'
  | 'auth.unlock'
  | 'account.passwordChange'
  | 'account.secondFactorSetup'
  | 'account.secondFactorRemove'
  | 'account.delete'
  | 'event.create'
  | 'event.end'
  | 'event.delete'
  | 'event.export'
  | 'access.grant'
  | 'access.revoke'
  | 'admin.grant'
  | 'admin.revoke'
  | 'admin.deleteUser'
  | 'settings.change';

export interface AuditEntry {
  /** When, in ms (the rules require it within a few minutes of the server's clock). */
  t: number;
  /** Who: the account that wrote the row. */
  uid: string;
  /** Who, readably: the account's email. */
  actor: string;
  /** What. Packs may use their own `pack.verb` actions. */
  action: AuditAction | (string & {});
  /** What it was done to: an event name, an email, a setting key. */
  target?: string;
  eventId?: string;
  /** A short note; never patient details. */
  detail?: string;
}

export interface AuditInput {
  action: AuditEntry['action'];
  target?: string;
  eventId?: string;
  detail?: string;
}

export interface AuditLog {
  record(input: AuditInput): Promise<void>;
  /** Rows from the last `days` days, newest first (admins only). */
  recent(days?: number): Promise<(AuditEntry & { id: string })[]>;
}

const clip = (s: string | undefined, max: number) => (s ? s.slice(0, max) : undefined);

export function createAuditLog(db: IDbService, currentUser: () => ServiceUser | null, now: () => number = Date.now): AuditLog {
  return {
    async record(input) {
      const user = currentUser();
      if (!user) return;
      const entry: AuditEntry = { t: now(), uid: user.uid, actor: user.email ?? user.uid, action: input.action };
      const target = clip(input.target, 200);
      const detail = clip(input.detail, 500);
      if (target) entry.target = target;
      if (input.eventId) entry.eventId = input.eventId;
      if (detail) entry.detail = detail;
      try {
        await db.addDocument(AUDIT_COLLECTION, entry);
      } catch (err) {
        console.error(`Audit log: could not record ${input.action}`, err);
      }
    },
    async recent(days = 30) {
      const since = now() - days * 86_400_000;
      const rows = await db.queryCollection<AuditEntry>(AUDIT_COLLECTION, [{ field: 't', op: '>=', value: since }]);
      return rows
        .filter((r) => r.exists && r.data)
        .map((r) => ({ ...(r.data as AuditEntry), id: r.id }))
        .sort((a, b) => b.t - a.t);
    },
  };
}

/**
 * The auth service with sign-in, sign-out, password changes, two-step
 * changes and account deletion recorded. Unlocking an idle-locked page is
 * recorded by the lock itself (reauthenticate also confirms other actions).
 */
export function withAuthAudit(auth: IAuthService, log: AuditLog): IAuthService {
  // A sign-in that stopped for its code is recorded once the code is accepted.
  let signInPending = false;
  const noteSecondStep = (err: unknown, isSignIn: boolean) => {
    if (err instanceof SecondFactorRequiredError) signInPending = isSignIn;
    return err;
  };
  return {
    async signIn(email, password) {
      try {
        const user = await auth.signIn(email, password);
        void log.record({ action: 'auth.signIn' });
        return user;
      } catch (err) {
        throw noteSecondStep(err, true);
      }
    },
    signUp: (email, password) => auth.signUp(email, password),
    async signOut() {
      await log.record({ action: 'auth.signOut' });
      await auth.signOut();
    },
    onAuthStateChanged: (callback) => auth.onAuthStateChanged(callback),
    updateProfile: (updates) => auth.updateProfile(updates),
    async updatePassword(currentPassword, newPassword) {
      await auth.updatePassword(currentPassword, newPassword);
      void log.record({ action: 'account.passwordChange' });
    },
    async reauthenticate(password) {
      try {
        await auth.reauthenticate(password);
      } catch (err) {
        throw noteSecondStep(err, false);
      }
    },
    async completeSecondFactor(code) {
      await auth.completeSecondFactor(code);
      if (signInPending) {
        signInPending = false;
        void log.record({ action: 'auth.signIn', detail: 'with a second step' });
      }
    },
    secondFactorStatus: () => auth.secondFactorStatus(),
    startSecondFactorSetup: () => auth.startSecondFactorSetup(),
    async finishSecondFactorSetup(code) {
      await auth.finishSecondFactorSetup(code);
      const { method } = await auth.secondFactorStatus().catch(() => ({ method: 'app' as const }));
      void log.record({ action: 'account.secondFactorSetup', detail: method === 'app' ? 'authenticator app' : 'email code tested' });
    },
    async removeSecondFactor() {
      await auth.removeSecondFactor();
      void log.record({ action: 'account.secondFactorRemove' });
    },
    sendEmailVerification: () => auth.sendEmailVerification(),
    async deleteCurrentUser(password) {
      await log.record({ action: 'account.delete' });
      await auth.deleteCurrentUser(password);
    },
    sendPasswordResetEmail: (email, actionUrl) => auth.sendPasswordResetEmail(email, actionUrl),
    confirmPasswordReset: (code, newPassword) => auth.confirmPasswordReset(code, newPassword),
    get currentUser() {
      return auth.currentUser;
    },
  };
}
