/**
 * Plain messages for the sign-in, unlock and two-step screens. Firebase and
 * PocketBase errors carry codes; their own messages are written for
 * developers ("Firebase: Error (auth/...)").
 */
import { ServiceError } from '@/lib/services';

const MESSAGES: Record<string, string> = {
  'auth/wrong-password': 'That password is not right.',
  'auth/invalid-credential': 'That password or code is not right.',
  'auth/invalid-login-credentials': 'That password is not right.',
  'auth/invalid-verification-code': 'That code is not right. Codes change every 30 seconds; try the current one.',
  'auth/missing-code': 'Enter the code.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
  'auth/no-pending-second-factor': 'That step expired. Start again with your password.',
  'auth/unverified-email': 'Verify your email first: send yourself the link below, open it, then try again.',
  'auth/requires-recent-login': 'For your security, confirm your password again first.',
  'auth/operation-not-allowed':
    "Authenticator apps aren't turned on for this Firebase project yet. An administrator needs to run scripts/enableTotp.js (see docs/COMPLIANCE.md).",
  'auth/admin-restricted-operation':
    "Authenticator apps aren't turned on for this Firebase project yet. An administrator needs to run scripts/enableTotp.js (see docs/COMPLIANCE.md).",
  'auth/user-token-expired': 'Your session ended. Sign in again.',
};

export function authErrorMessage(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (err instanceof ServiceError) {
    if (err.code === 'auth/second-factor-required') return err.message;
    if (MESSAGES[err.code]) return MESSAGES[err.code];
    // PocketBase's OTP endpoint fails this way when mail isn't set up.
    if (err.code === 'pocketbase/500' || /mail|smtp/i.test(err.message)) {
      return "The code email couldn't be sent. An administrator needs to set up email (SMTP) in PocketBase.";
    }
  }
  return err instanceof Error && err.message ? err.message : fallback;
}
