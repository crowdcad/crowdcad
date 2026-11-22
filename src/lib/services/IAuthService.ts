import type { SecondFactorSetup, SecondFactorStatus, ServiceUser, Unsubscribe } from './types';

export interface IAuthService {
  /**
   * Throws SecondFactorRequiredError when the account must also enter a code
   * (two-step sign-in, Profile > Admin > Security); finish with
   * completeSecondFactor.
   */
  signIn(email: string, password: string): Promise<ServiceUser>;
  signUp(email: string, password: string): Promise<ServiceUser>;
  signOut(): Promise<void>;

  /** Subscribe to auth state changes. Fires immediately with the current user. */
  onAuthStateChanged(callback: (user: ServiceUser | null) => void): Unsubscribe;

  /** Update display name for the current user. */
  updateProfile(updates: { displayName?: string | null }): Promise<void>;

  /** Re-authenticates with currentPassword before setting the new one. */
  updatePassword(currentPassword: string, newPassword: string): Promise<void>;

  /**
   * Confirms the signed-in account's password (e.g. to unlock an idle-locked
   * page). Throws when it's wrong, and SecondFactorRequiredError when a code
   * is needed too.
   */
  reauthenticate(password: string): Promise<void>;

  /** Finishes a signIn or reauthenticate that stopped at SecondFactorRequiredError. */
  completeSecondFactor(code: string): Promise<void>;

  /** The signed-in account's two-step sign-in. */
  secondFactorStatus(): Promise<SecondFactorStatus>;

  /**
   * Starts setting up the second step for the signed-in account. App: returns
   * the QR link and key (call reauthenticate first; Firebase wants a recent
   * sign-in). Email: sends a test code, proving mail works.
   */
  startSecondFactorSetup(): Promise<SecondFactorSetup>;

  /** Confirms the setup with the first code. */
  finishSecondFactorSetup(code: string): Promise<void>;

  /** Removes the authenticator app (call reauthenticate first). Nothing to remove for email codes. */
  removeSecondFactor(): Promise<void>;

  /** Sends the signed-in account a link to verify its email (Firebase needs this before an app can be set up). */
  sendEmailVerification(): Promise<void>;

  /** Re-authenticates with password before permanently deleting the account. */
  deleteCurrentUser(password: string): Promise<void>;

  /**
   * Sends a password-reset email for an account that's locked out (doesn't
   * know its current password). `actionUrl` (Firebase only) is where the
   * reset link in the email points back into this app; PocketBase's link
   * destination is controlled by its own email template instead.
   */
  sendPasswordResetEmail(email: string, actionUrl?: string): Promise<void>;

  /** Completes a password reset using the code/token pulled from the reset-link URL. */
  confirmPasswordReset(code: string, newPassword: string): Promise<void>;

  /** Synchronous access to the current user (null if not signed in or not yet resolved). */
  readonly currentUser: ServiceUser | null;
}
