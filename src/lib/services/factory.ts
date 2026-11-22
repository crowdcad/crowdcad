import type { IAuthService } from './IAuthService';
import type { IDbService } from './IDbService';
import type { IStorageService } from './IStorageService';
import { FirebaseAuthService } from './firebase/FirebaseAuthService';
import { FirebaseDbService } from './firebase/FirebaseDbService';
import { FirebaseStorageService } from './firebase/FirebaseStorageService';
import { PocketbaseAuthService } from './pocketbase/PocketbaseAuthService';
import { PocketbaseDbService } from './pocketbase/PocketbaseDbService';
import { PocketbaseStorageService } from './pocketbase/PocketbaseStorageService';

import { createAuditLog, withAuthAudit, type AuditLog } from './audit';

// NEXT_PUBLIC_BACKEND is inlined at build time by Next.js, allowing the
// bundler to tree-shake the unused backend in production builds.
const backend = process.env.NEXT_PUBLIC_BACKEND ?? 'firebase';

export const isPocketbaseBackend = backend === 'pocketbase';

const backendAuth: IAuthService =
  backend === 'pocketbase' ? new PocketbaseAuthService() : new FirebaseAuthService();

export const dbService: IDbService =
  backend === 'pocketbase' ? new PocketbaseDbService() : new FirebaseDbService();

/** The append-only audit log (audit.ts). */
export const auditLog: AuditLog = createAuditLog(dbService, () => backendAuth.currentUser);

/** Sign-in, sign-out, password changes and account deletion are recorded in the audit log. */
export const authService: IAuthService = withAuthAudit(backendAuth, auditLog);

export const storageService: IStorageService =
  backend === 'pocketbase' ? new PocketbaseStorageService() : new FirebaseStorageService();
