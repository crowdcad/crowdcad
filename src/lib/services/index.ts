// The single import point for all backend service access.
// Usage: import { authService, dbService, storageService, arrayUnion, arrayRemove } from '@/lib/services';

export { authService, dbService, storageService, isPocketbaseBackend, auditLog } from './factory';
export { AUDIT_COLLECTION, type AuditAction, type AuditEntry, type AuditInput, type AuditLog } from './audit';

export {
  arrayUnion,
  arrayRemove,
  isArrayUnion,
  isArrayRemove,
  ServiceError,
  SecondFactorRequiredError,
} from './types';

export type {
  ServiceUser,
  DocSnapshot,
  QueryConstraint,
  WhereOperator,
  FieldValue,
  ArrayUnionValue,
  ArrayRemoveValue,
  Unsubscribe,
  TransactionContext,
  SecondFactorMethod,
  SecondFactorStatus,
  SecondFactorSetup,
} from './types';

export type { IAuthService } from './IAuthService';
export type { IDbService } from './IDbService';
export type { IStorageService } from './IStorageService';
