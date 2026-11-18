'use client';

import React, { createContext, useContext } from 'react';
import type { Unsubscribe } from '@/lib/services/types';
import { newRolePassword, newRoleUsername, type EventRole, type RoleAccount, type RoleLoginCredentials } from './roleAccounts';
import {
  createRoleLogin,
  resetRoleLoginPassword,
  setRoleLoginAssignment,
  setRoleLoginDisabled,
  subscribeRoleLogins,
} from './roleAccountStore';

/**
 * Where the Logins list (src/components/dispatch/mci/rolelogins.tsx) makes and changes role logins. Real
 * events use src/lib/roleAccountStore.ts. Training supplies a practice backend that keeps logins in memory
 * and creates no accounts, so the Logins tutorial can make, send and reset logins on practice data.
 */
export interface RoleLoginBackend {
  /** True for training: nothing is created, and the list says so. */
  practice: boolean;
  subscribe(eventId: string, callback: (accounts: RoleAccount[]) => void, onError?: (error: Error) => void): Unsubscribe;
  create(input: { eventId: string; eventName: string; role: EventRole; label?: string; unitName?: string; unitId?: string; createdBy: string }): Promise<RoleLoginCredentials>;
  setDisabled(eventId: string, uid: string, disabled: boolean): Promise<void>;
  setAssignment(eventId: string, uid: string, changes: { role?: EventRole; label?: string }): Promise<void>;
  reset(eventId: string, uid: string): Promise<RoleLoginCredentials | null>;
}

export const realRoleLoginBackend: RoleLoginBackend = {
  practice: false,
  subscribe: subscribeRoleLogins,
  create: createRoleLogin,
  setDisabled: setRoleLoginDisabled,
  setAssignment: setRoleLoginAssignment,
  reset: resetRoleLoginPassword,
};

/** Logins kept in memory for one training session. */
export function createPracticeRoleLoginBackend(): RoleLoginBackend {
  let accounts: RoleAccount[] = [];
  const listeners = new Set<(a: RoleAccount[]) => void>();
  let seq = 0;
  const emit = () => {
    const sorted = [...accounts].sort((a, b) => b.createdAt - a.createdAt);
    listeners.forEach((l) => l(sorted));
  };
  const update = (uid: string, changes: Partial<RoleAccount>) => {
    accounts = accounts.map((a) => (a.uid === uid ? { ...a, ...changes } : a));
    emit();
  };
  return {
    practice: true,
    subscribe(_eventId, callback) {
      listeners.add(callback);
      callback([...accounts].sort((a, b) => b.createdAt - a.createdAt));
      return () => listeners.delete(callback);
    },
    async create(input) {
      const uid = `practice-${++seq}`;
      const username = newRoleUsername(input.role);
      const password = newRolePassword();
      accounts = [
        ...accounts,
        {
          uid,
          eventId: input.eventId,
          eventName: input.eventName,
          role: input.role,
          username,
          ...(input.unitName ? { unitName: input.unitName } : {}),
          ...(input.unitId ? { unitId: input.unitId } : {}),
          ...(input.label ? { label: input.label } : {}),
          disabled: false,
          createdBy: input.createdBy,
          createdAt: Date.now() + seq,
        },
      ];
      emit();
      return { uid, username, password };
    },
    async setDisabled(_eventId, uid, disabled) {
      update(uid, disabled ? { disabled: true, disabledAt: Date.now() } : { disabled: false });
    },
    async setAssignment(_eventId, uid, changes) {
      update(uid, changes);
    },
    async reset(_eventId, uid) {
      const a = accounts.find((x) => x.uid === uid);
      return a ? { uid, username: a.username, password: newRolePassword() } : null;
    },
  };
}

const RoleLoginBackendContext = createContext<RoleLoginBackend>(realRoleLoginBackend);

export function RoleLoginBackendProvider({ backend, children }: { backend: RoleLoginBackend; children: React.ReactNode }) {
  return <RoleLoginBackendContext.Provider value={backend}>{children}</RoleLoginBackendContext.Provider>;
}

export const useRoleLoginBackend = () => useContext(RoleLoginBackendContext);
