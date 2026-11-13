'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Spinner } from '@heroui/react';
import { useAuth } from '@/hooks/useauth';
import { authService } from '@/lib/services';
import { effectiveRole, EVENT_ROLE_INFO } from '@/lib/roleAccounts';
import RoleSignInForm, { RoleCard } from '@/components/rolelogin/rolesignin';
import { useRoleSession } from '@/components/roleviews/useRoleSession';
import RoleShell from '@/components/roleviews/roleshell';
import ResponderView, { TreatmentLeadView } from '@/components/roleviews/responderview';
import TransportView from '@/components/roleviews/transportview';
import LogisticsView from '@/components/roleviews/logisticsview';
import CommandView from '@/components/roleviews/commandview';

/**
 * Where an MCI role login lands (#142, #144): its role's view of its event.
 * Signed out, it offers the username and password form, so /role is also a
 * plain entry point. Role views read only the MCI documents and write through
 * /api/mci-role; see src/components/roleviews/.
 */
export default function RolePage() {
  const { user, ready } = useAuth();
  const session = useRoleSession(user, ready);
  const { account, mci, units, layers, eventId } = session;

  if (session.status === 'loading') {
    return (
      <RoleCard>
        <Spinner />
      </RoleCard>
    );
  }
  if (session.status === 'signed-out') {
    return (
      <RoleCard>
        <h1 className="text-xl font-bold">Sign in to your role</h1>
        <p className="text-sm text-surface-faint">Use the username and password the dispatcher gave you.</p>
        <RoleSignInForm onSignedIn={() => undefined} />
      </RoleCard>
    );
  }
  if (session.status === 'not-role') {
    return (
      <RoleCard>
        <h1 className="text-xl font-bold">Role logins</h1>
        <p className="text-sm">
          This page is for MCI role logins. You&apos;re signed in as {user?.email}. <Link href="/events" className="underline">Go to your events</Link>.
        </p>
      </RoleCard>
    );
  }
  const signOut = (
    <Button variant="flat" onPress={() => void authService.signOut()} data-testid="role-signout">
      Sign out
    </Button>
  );
  if (session.status === 'missing' || !account || !eventId) {
    return (
      <RoleCard>
        <p className="text-sm" data-testid="role-missing">This login isn&apos;t linked to an event any more. Ask the dispatcher for a new one.</p>
        {signOut}
      </RoleCard>
    );
  }
  if (account.disabled) {
    return (
      <RoleCard>
        <p className="rounded-md border border-status-red/40 bg-status-red/10 p-2 text-sm text-status-red" data-testid="role-disabled">
          This login has been disabled. Ask the dispatcher for a new one.
        </p>
        {signOut}
      </RoleCard>
    );
  }
  if (!mci || !mci.active) {
    return (
      <RoleCard>
        <p className="text-xs uppercase tracking-wide text-surface-faint">{account.eventName}</p>
        <h1 className="text-2xl font-bold">{EVENT_ROLE_INFO[account.role]?.label}</h1>
        <p className="text-sm text-surface-faint" data-testid="role-no-mci">
          {mci ? 'The MCI has stood down. Thank you.' : 'Waiting for the MCI to start.'}
        </p>
        {signOut}
      </RoleCard>
    );
  }

  const role = effectiveRole(account.role);
  const unit = account.unitName ?? '';
  const title = role === 'responder' ? unit || 'Responder' : EVENT_ROLE_INFO[role].label;
  return (
    <RoleShell title={title} eventId={eventId} unitName={unit || undefined} units={units} layers={layers} mapBottomClass={role === 'responder' || role === 'treatment_lead' ? 'bottom-24' : 'bottom-5'}>
      <div className="flex flex-1 flex-col" data-testid={`role-view-${role}`}>
        {role === 'responder' && <ResponderView mci={mci} unit={unit} units={units} />}
        {role === 'treatment_lead' && <TreatmentLeadView mci={mci} unit={unit} units={units} />}
        {role === 'transport' && <TransportView mci={mci} />}
        {role === 'logistics' && <LogisticsView mci={mci} units={units} />}
        {role === 'incident_command' && <CommandView mci={mci} units={units} />}
      </div>
    </RoleShell>
  );
}
