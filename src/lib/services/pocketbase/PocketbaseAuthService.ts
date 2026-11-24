import PocketBase from 'pocketbase';
import { pb } from './client';
import type { IAuthService } from '../IAuthService';
import type { ServiceUser, Unsubscribe } from '../types';
import { SecondFactorRequiredError, ServiceError, type SecondFactorSetup, type SecondFactorStatus } from '../types';
import { toPbAuthError as toServiceError } from './utils';

function toServiceUser(model: Record<string, unknown>): ServiceUser {
  return {
    uid: model.id as string,
    email: (model.email as string) ?? null,
    displayName: (model.name as string) ?? null,
    phoneNumber: (model.phone as string) ?? null,
  };
}

/** The PocketBase "use a second auth method" reply to a password sign-in. */
function mfaIdOf(err: unknown): string | null {
  const id = (err as { response?: { mfaId?: unknown } } | null)?.response?.mfaId;
  return typeof id === 'string' && id ? id : null;
}

/**
 * A separate client for re-checking the signed-in account (unlocking, or
 * confirming before a change). PocketBase answers "now the code" with a 401,
 * and the SDK clears the session on any 401, which on the shared client would
 * sign the person out halfway through. The new session is copied over only
 * once the check succeeds.
 */
function sideClient(): PocketBase {
  const client = new PocketBase(pb.baseURL);
  client.autoCancellation(false);
  return client;
}

/** Takes over a session a side client just signed in. */
function adopt(client: PocketBase): void {
  if (client !== pb && client.authStore.token) pb.authStore.save(client.authStore.token, client.authStore.record);
}

function currentEmail(): string {
  const email = pb.authStore.isValid ? ((pb.authStore.model as Record<string, unknown> | null)?.email as string | undefined) : undefined;
  if (!email) throw new ServiceError('auth/no-current-user', 'No user is signed in.');
  return email;
}

/**
 * Two-step sign-in is PocketBase's own MFA: password, then a one-time code
 * sent by email. The users collection's MFA rule (scripts/setup-pocketbase.js)
 * reads the security setting, so the server itself refuses a token without
 * the code; this app only asks for it. Sending codes needs SMTP set up.
 */
export class PocketbaseAuthService implements IAuthService {
  /** A sign-in or re-authentication waiting for its emailed code. */
  private pending: { mfaId: string; otpId: string; client: PocketBase } | null = null;
  /** A test code sent from the setup screen. */
  private pendingSetupOtp: string | null = null;

  /** Sends the code and throws SecondFactorRequiredError when PocketBase wants one; rethrows anything else. */
  private async secondStepOrThrow(err: unknown, email: string, client: PocketBase = pb): Promise<never> {
    const mfaId = mfaIdOf(err);
    if (!mfaId) throw toServiceError(err);
    try {
      const { otpId } = await client.collection('users').requestOTP(email);
      this.pending = { mfaId, otpId, client };
    } catch (otpErr) {
      throw toServiceError(otpErr);
    }
    throw new SecondFactorRequiredError('email', email);
  }

  get currentUser(): ServiceUser | null {
    if (!pb.authStore.isValid || !pb.authStore.model) return null;
    return toServiceUser(pb.authStore.model as Record<string, unknown>);
  }

  async signIn(email: string, password: string): Promise<ServiceUser> {
    try {
      const auth = await pb.collection('users').authWithPassword(email, password);
      return toServiceUser(auth.record as unknown as Record<string, unknown>);
    } catch (err) {
      return this.secondStepOrThrow(err, email);
    }
  }

  async signUp(email: string, password: string): Promise<ServiceUser> {
    try {
      await pb.collection('users').create({
        email,
        password,
        passwordConfirm: password,
      });
      const auth = await pb.collection('users').authWithPassword(email, password);
      return toServiceUser(auth.record as unknown as Record<string, unknown>);
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async signOut(): Promise<void> {
    pb.authStore.clear();
  }

  onAuthStateChanged(callback: (user: ServiceUser | null) => void): Unsubscribe {
    // Fire immediately with current state
    callback(this.currentUser);

    // PocketBase fires onChange when token/model changes
    const unsubscribe = pb.authStore.onChange(() => {
      callback(this.currentUser);
    });

    return unsubscribe;
  }

  async updateProfile(updates: { displayName?: string | null }): Promise<void> {
    if (!pb.authStore.isValid || !pb.authStore.model) {
      throw new ServiceError('auth/no-current-user', 'No user is signed in.');
    }
    const userId = (pb.authStore.model as Record<string, unknown>).id as string;
    const data: Record<string, unknown> = {};
    if (updates.displayName !== undefined) data.name = updates.displayName;
    try {
      await pb.collection('users').update(userId, data);
      await pb.collection('users').authRefresh();
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (!pb.authStore.isValid || !pb.authStore.model) {
      throw new ServiceError('auth/no-current-user', 'No user is signed in.');
    }
    const userId = (pb.authStore.model as Record<string, unknown>).id as string;
    try {
      await pb.collection('users').update(userId, {
        oldPassword: currentPassword,
        password: newPassword,
        passwordConfirm: newPassword,
      });
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async reauthenticate(password: string): Promise<void> {
    const email = currentEmail();
    const side = sideClient();
    try {
      await side.collection('users').authWithPassword(email, password);
      adopt(side);
    } catch (err) {
      await this.secondStepOrThrow(err, email, side);
    }
  }

  async completeSecondFactor(code: string): Promise<void> {
    const pending = this.pending;
    if (!pending) throw new ServiceError('auth/no-pending-second-factor', 'Start again with your password.');
    try {
      await pending.client.collection('users').authWithOTP(pending.otpId, code.trim(), { mfaId: pending.mfaId });
      adopt(pending.client);
      this.pending = null;
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async secondFactorStatus(): Promise<SecondFactorStatus> {
    currentEmail();
    return { method: 'email', enrolled: true, usedThisSession: null };
  }

  async startSecondFactorSetup(): Promise<SecondFactorSetup> {
    const email = currentEmail();
    try {
      const { otpId } = await pb.collection('users').requestOTP(email);
      this.pendingSetupOtp = otpId;
      return { method: 'email', sentTo: email };
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async finishSecondFactorSetup(code: string): Promise<void> {
    const otpId = this.pendingSetupOtp;
    if (!otpId) throw new ServiceError('auth/no-pending-second-factor', 'Send a new code.');
    try {
      // Signs in again with the code alone: same account, fresh token.
      const side = sideClient();
      await side.collection('users').authWithOTP(otpId, code.trim());
      adopt(side);
      this.pendingSetupOtp = null;
    } catch (err) {
      // The code was right but the policy already wants the password too:
      // the code still proved that mail reaches this account.
      if (mfaIdOf(err)) {
        this.pendingSetupOtp = null;
        return;
      }
      throw toServiceError(err);
    }
  }

  async removeSecondFactor(): Promise<void> {
    // Email codes need no setup, so there's nothing to remove.
  }

  async sendEmailVerification(): Promise<void> {
    try {
      await pb.collection('users').requestVerification(currentEmail());
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async deleteCurrentUser(password: string): Promise<void> {
    if (!pb.authStore.isValid || !pb.authStore.model) {
      throw new ServiceError('auth/no-current-user', 'No user is signed in.');
    }
    const email = (pb.authStore.model as Record<string, unknown>).email as string;
    const userId = (pb.authStore.model as Record<string, unknown>).id as string;
    try {
      // Re-authenticate to confirm identity
      await pb.collection('users').authWithPassword(email, password);
      await pb.collection('users').delete(userId);
      pb.authStore.clear();
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    // actionUrl is ignored — PocketBase's reset-link destination is set via
    // its own email template (Admin UI > Settings > Mail templates), not
    // per-request.
    try {
      await pb.collection('users').requestPasswordReset(email);
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async confirmPasswordReset(code: string, newPassword: string): Promise<void> {
    try {
      await pb.collection('users').confirmPasswordReset(code, newPassword, newPassword);
    } catch (err) {
      throw toServiceError(err);
    }
  }
}
