/**
 * Shared types for the backend service abstraction layer.
 * All adapters (Firebase, PocketBase) use these types at their boundaries.
 */

export interface ServiceUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber: string | null;
}

export type Unsubscribe = () => void;

export interface DocSnapshot<T = Record<string, unknown>> {
  id: string;
  exists: boolean;
  data: T | null;
}

export type WhereOperator = '==' | '!=' | '>=' | 'array-contains';

export interface QueryConstraint {
  field: string;
  op: WhereOperator;
  value: unknown;
}

// ────────────────────────────────────────────────────────────────
// FieldValue sentinels
// Call-sites use arrayUnion/arrayRemove from '@/lib/services'
// instead of importing from 'firebase/firestore'. Each adapter
// translates these sentinels to its own backend-native equivalent.
// ────────────────────────────────────────────────────────────────

export interface ArrayUnionValue {
  readonly __type: 'array-union';
  readonly items: unknown[];
}

export interface ArrayRemoveValue {
  readonly __type: 'array-remove';
  readonly items: unknown[];
}

export type FieldValue = ArrayUnionValue | ArrayRemoveValue;

export function arrayUnion(...items: unknown[]): ArrayUnionValue {
  return { __type: 'array-union', items };
}

export function arrayRemove(...items: unknown[]): ArrayRemoveValue {
  return { __type: 'array-remove', items };
}

export function isArrayUnion(v: unknown): v is ArrayUnionValue {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as ArrayUnionValue).__type === 'array-union'
  );
}

export function isArrayRemove(v: unknown): v is ArrayRemoveValue {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as ArrayRemoveValue).__type === 'array-remove'
  );
}

// ────────────────────────────────────────────────────────────────
// Error type
// ────────────────────────────────────────────────────────────────

export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

// ────────────────────────────────────────────────────────────────
// Two-step sign-in
// ────────────────────────────────────────────────────────────────

/**
 * How an account proves itself a second time: a code from an authenticator
 * app (Firebase, TOTP) or a code sent by email (PocketBase).
 */
export type SecondFactorMethod = 'app' | 'email';

/**
 * Thrown by signIn and reauthenticate when the account must also enter a
 * code. Finish with `authService.completeSecondFactor(code)`.
 */
export class SecondFactorRequiredError extends ServiceError {
  constructor(
    public readonly method: SecondFactorMethod,
    public readonly sentTo?: string,
  ) {
    super(
      'auth/second-factor-required',
      method === 'app' ? 'Enter the code from your authenticator app.' : `Enter the code sent to ${sentTo ?? 'your email'}.`,
    );
    this.name = 'SecondFactorRequiredError';
  }
}

export interface SecondFactorStatus {
  method: SecondFactorMethod;
  /** An authenticator app is set up (always true for email codes, which need no setup). */
  enrolled: boolean;
  /**
   * Whether this session signed in with the second step. Null when the
   * backend can't tell: PocketBase asks for it at sign-in, on its server.
   */
  usedThisSession: boolean | null;
}

export interface SecondFactorSetup {
  method: SecondFactorMethod;
  /** otpauth:// link to show as a QR code (app). */
  uri?: string;
  /** The same key, to type into the app by hand (app). */
  secret?: string;
  /** Where the test code went (email). */
  sentTo?: string;
}

// ────────────────────────────────────────────────────────────────
// Transaction context
// ────────────────────────────────────────────────────────────────

export interface TransactionContext {
  get<T>(collection: string, id: string): Promise<DocSnapshot<T>>;
  set<T>(collection: string, id: string, data: Partial<T>): void;
  update<T>(collection: string, id: string, data: Partial<T>): void;
  delete(collection: string, id: string): void;
}
