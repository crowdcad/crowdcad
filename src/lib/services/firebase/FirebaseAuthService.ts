import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  updateProfile as firebaseUpdateProfile,
  updatePassword as firebaseUpdatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  sendEmailVerification as firebaseSendEmailVerification,
  getMultiFactorResolver,
  multiFactor,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from 'firebase/auth';
import { auth } from '@/app/firebase';
import type { IAuthService } from '../IAuthService';
import type { ServiceUser, Unsubscribe } from '../types';
import { SecondFactorRequiredError, ServiceError, type SecondFactorSetup, type SecondFactorStatus } from '../types';
import { toFirebaseServiceError as toServiceError } from './utils';

function toServiceUser(user: User): ServiceUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    phoneNumber: user.phoneNumber,
  };
}

const TOTP = TotpMultiFactorGenerator.FACTOR_ID;

/** The name shown in the authenticator app next to the account. */
const ISSUER = 'CrowdCAD';

function requireUser(): User {
  const user = auth.currentUser;
  if (!user) throw new ServiceError('auth/no-current-user', 'No user is signed in.');
  return user;
}

/**
 * Two-step sign-in uses Firebase's TOTP second factor, which needs the
 * project upgraded to Identity Platform with TOTP turned on
 * (scripts/enableTotp.js, docs/COMPLIANCE.md). Until then, setting up an app
 * fails with auth/operation-not-allowed and nothing else changes.
 */
export class FirebaseAuthService implements IAuthService {
  /** A sign-in or re-authentication waiting for its code. */
  private pendingResolver: MultiFactorResolver | null = null;
  /** An authenticator app being set up, waiting for its first code. */
  private pendingSecret: TotpSecret | null = null;

  /** Turns Firebase's "a second factor is needed" into SecondFactorRequiredError; rethrows anything else. */
  private secondStepOrThrow(err: unknown): never {
    if ((err as { code?: string } | null)?.code === 'auth/multi-factor-auth-required') {
      const resolver = getMultiFactorResolver(auth, err as MultiFactorError);
      if (resolver.hints.some((h) => h.factorId === TOTP)) {
        this.pendingResolver = resolver;
        throw new SecondFactorRequiredError('app');
      }
    }
    throw toServiceError(err);
  }

  get currentUser(): ServiceUser | null {
    const u = auth.currentUser;
    return u ? toServiceUser(u) : null;
  }

  async signIn(email: string, password: string): Promise<ServiceUser> {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return toServiceUser(cred.user);
    } catch (err) {
      this.secondStepOrThrow(err);
    }
  }

  async signUp(email: string, password: string): Promise<ServiceUser> {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      return toServiceUser(cred.user);
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async signOut(): Promise<void> {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      throw toServiceError(err);
    }
  }

  onAuthStateChanged(callback: (user: ServiceUser | null) => void): Unsubscribe {
    return firebaseOnAuthStateChanged(auth, (user) => {
      callback(user ? toServiceUser(user) : null);
    });
  }

  async updateProfile(updates: { displayName?: string | null }): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new ServiceError('auth/no-current-user', 'No user is signed in.');
    try {
      await firebaseUpdateProfile(user, updates);
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.email)
      throw new ServiceError('auth/no-current-user', 'No user is signed in.');
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await firebaseUpdatePassword(user, newPassword);
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async reauthenticate(password: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.email) throw new ServiceError('auth/no-current-user', 'No user is signed in.');
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    } catch (err) {
      this.secondStepOrThrow(err);
    }
  }

  async completeSecondFactor(code: string): Promise<void> {
    const resolver = this.pendingResolver;
    const hint = resolver?.hints.find((h) => h.factorId === TOTP);
    if (!resolver || !hint) throw new ServiceError('auth/no-pending-second-factor', 'Start again with your password.');
    try {
      await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim()));
      this.pendingResolver = null;
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async secondFactorStatus(): Promise<SecondFactorStatus> {
    const user = requireUser();
    const enrolled = multiFactor(user).enrolledFactors.some((f) => f.factorId === TOTP);
    const token = await user.getIdTokenResult();
    return { method: 'app', enrolled, usedThisSession: token.signInSecondFactor != null };
  }

  async startSecondFactorSetup(): Promise<SecondFactorSetup> {
    const user = requireUser();
    try {
      // Firebase only lets a verified email set up an app; pick up a verification
      // done in another tab since this token was issued.
      if (!user.emailVerified) {
        await user.reload();
        await user.getIdToken(true);
      }
      const session = await multiFactor(user).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      this.pendingSecret = secret;
      return { method: 'app', uri: secret.generateQrCodeUrl(user.email ?? user.uid, ISSUER), secret: secret.secretKey };
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async finishSecondFactorSetup(code: string): Promise<void> {
    const user = requireUser();
    const secret = this.pendingSecret;
    if (!secret) throw new ServiceError('auth/no-pending-second-factor', 'Start the setup again.');
    try {
      await multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim()), 'Authenticator app');
      this.pendingSecret = null;
      // A fresh token carries the second step, which the database rules check.
      await user.getIdToken(true);
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async removeSecondFactor(): Promise<void> {
    const user = requireUser();
    const factor = multiFactor(user).enrolledFactors.find((f) => f.factorId === TOTP);
    if (!factor) return;
    try {
      await multiFactor(user).unenroll(factor);
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async sendEmailVerification(): Promise<void> {
    try {
      await firebaseSendEmailVerification(requireUser());
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async deleteCurrentUser(password: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.email)
      throw new ServiceError('auth/no-current-user', 'No user is signed in.');
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      await deleteUser(user);
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async sendPasswordResetEmail(email: string, actionUrl?: string): Promise<void> {
    try {
      await firebaseSendPasswordResetEmail(
        auth,
        email,
        actionUrl ? { url: actionUrl, handleCodeInApp: true } : undefined,
      );
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async confirmPasswordReset(code: string, newPassword: string): Promise<void> {
    try {
      await firebaseConfirmPasswordReset(auth, code, newPassword);
    } catch (err) {
      throw toServiceError(err);
    }
  }
}
