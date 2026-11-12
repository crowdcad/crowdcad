'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button, ModalBody, ModalFooter, ModalHeader, Select, SelectItem } from '@heroui/react';
import { Check, Copy, KeyRound, Mail, Share2 } from 'lucide-react';
import type { Event } from '@/app/types';
import { MciModal } from './mciparts';
import { effectiveRole, EVENT_ROLE_INFO, EVENT_ROLES, roleLoginLink, roleLoginMessage, type EventRole, type RoleAccount } from '@/lib/roleAccounts';
import { createRoleLogin, setRoleLoginDisabled, subscribeRoleLogins } from '@/lib/roleAccountStore';

/**
 * Role logins for an MCI (#142, #152). Each login belongs to a team or
 * supervisor already on the board, so everything it submits is logged under
 * that unit. Teams default to Responder; the dispatcher picks who is Incident
 * Command, Logistics and Transport, and one press makes all the logins. Each
 * is sent by the device's share sheet, a copied message, an email or a link;
 * Copy all makes one group message. The password is shown only right after a
 * login is made; Replace disables a login and makes a new one for the same unit.
 */

interface Fresh {
  uid: string;
  role: EventRole;
  unitName: string;
  username: string;
  password: string;
}

type Choice = EventRole | 'none';

function CopyButton({ text, label, testId }: { text: string; label: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="flat"
      radius="lg"
      startContent={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      onPress={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      data-testid={testId}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}

function FreshLogin({ fresh, eventName, origin }: { fresh: Fresh; eventName: string; origin: string }) {
  const message = roleLoginMessage(origin, eventName, fresh.role, fresh.username, fresh.password, fresh.unitName);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <div className="rounded-lg border border-status-green/40 bg-status-green/10 p-3" data-testid={`role-login-fresh-${fresh.unitName}`}>
      <p className="text-sm font-semibold">
        {fresh.unitName} · {EVENT_ROLE_INFO[fresh.role].label}
      </p>
      <p className="mt-1 font-mono text-sm">
        Username <span className="select-all font-semibold" data-testid="role-login-username">{fresh.username}</span>
        <span className="mx-2 text-surface-faint">·</span>
        Password <span className="select-all font-semibold" data-testid="role-login-password">{fresh.password}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {canShare && (
          <Button size="sm" variant="flat" radius="lg" startContent={<Share2 className="h-3.5 w-3.5" />} onPress={() => void navigator.share({ title: 'CrowdCAD login', text: message }).catch(() => {})}>
            Share
          </Button>
        )}
        <CopyButton text={message} label="Copy message" testId="role-login-copy-message" />
        <Button
          size="sm"
          variant="flat"
          radius="lg"
          startContent={<Mail className="h-3.5 w-3.5" />}
          as="a"
          href={`mailto:?subject=${encodeURIComponent(`CrowdCAD login for ${fresh.unitName}`)}&body=${encodeURIComponent(message)}`}
        >
          Email
        </Button>
        <CopyButton text={roleLoginLink(origin, fresh.username, fresh.password)} label="Copy link" />
      </div>
    </div>
  );
}

function Body({ event, eventId, uid, onClose }: { event: Event; eventId: string; uid: string; onClose: () => void }) {
  const [accounts, setAccounts] = useState<RoleAccount[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Fresh[]>([]);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  useEffect(
    () => subscribeRoleLogins(eventId, (a) => { setAccounts(a); setListError(null); }, (e) => setListError(e.message)),
    [eventId],
  );

  const units = useMemo(
    () => [
      ...(event.staff ?? []).map((s) => ({ name: s.team, id: s.id, kind: 'team' as const })),
      ...(event.supervisor ?? []).map((s) => ({ name: s.team, id: s.id, kind: 'supervisor' as const })),
    ],
    [event.staff, event.supervisor],
  );
  const activeFor = (name: string) => accounts.find((a) => !a.disabled && a.unitName === name);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const choiceOf = (u: (typeof units)[number]): Choice => choices[u.name] ?? (u.kind === 'team' ? 'responder' : 'none');
  const toCreate = units.filter((u) => !activeFor(u.name) && choiceOf(u) !== 'none');

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const create = async (unit: { name: string; id?: string }, role: EventRole, label?: string) => {
    const creds = await createRoleLogin({ eventId, eventName: event.name, role, label, unitName: unit.name, unitId: unit.id, createdBy: uid });
    setFresh((prev) => [...prev, { ...creds, role, unitName: unit.name }]);
  };

  const allMessages = fresh.map((f) => roleLoginMessage(origin, event.name, f.role, f.username, f.password, f.unitName)).join('\n\n');

  return (
    <>
      <ModalHeader className="flex flex-col items-start gap-0.5 text-xl font-bold text-surface">
        <span className="inline-flex items-center gap-2">
          <KeyRound className="h-5 w-5" /> Role logins
        </span>
        <span className="text-sm font-normal text-surface-faint">
          Each login belongs to a team or supervisor; what it submits is logged under that name. They sign in at {origin.replace(/^https?:\/\//, '')} on any device and see only their role.
        </span>
      </ModalHeader>
      <ModalBody className="gap-4 py-4">
        {fresh.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-surface-faint">New logins. Send them now: the password isn&apos;t shown again.</p>
              {fresh.length > 1 && <CopyButton text={allMessages} label="Copy all" testId="role-login-copy-all" />}
            </div>
            {fresh.map((f) => (
              <FreshLogin key={f.uid} fresh={f} eventName={event.name} origin={origin} />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1 rounded-lg border border-surface-liner" data-testid="role-assign-table">
          <div className="grid grid-cols-[minmax(0,1fr)_12rem] items-center gap-2 border-b border-surface-liner px-3 py-2 text-xs font-semibold uppercase tracking-wide text-surface-faint">
            <span>Team or supervisor</span>
            <span>Role</span>
          </div>
          {units.length === 0 && <p className="px-3 py-2 text-sm text-surface-faint">Add teams or supervisors to the event first.</p>}
          {units.map((u) => {
            const active = activeFor(u.name);
            return (
              <div key={u.name} className="grid grid-cols-[minmax(0,1fr)_12rem] items-center gap-2 px-3 py-1.5" data-testid={`role-assign-${u.name}`}>
                <span className="truncate text-sm font-semibold">
                  {u.name}
                  <span className="ml-1.5 text-xs font-normal text-surface-faint">{u.kind}</span>
                </span>
                {active ? (
                  <span className="text-sm text-surface-faint">
                    {EVENT_ROLE_INFO[active.role].label} · <span className="font-mono">{active.username}</span>
                  </span>
                ) : (
                  <Select
                    aria-label={`Role for ${u.name}`}
                    size="sm"
                    radius="lg"
                    selectedKeys={new Set([choiceOf(u)])}
                    disallowEmptySelection
                    onSelectionChange={(keys) => setChoices((c) => ({ ...c, [u.name]: Array.from(keys as Set<string>)[0] as Choice }))}
                    data-testid={`role-assign-${u.name}-role`}
                  >
                    {[
                      <SelectItem key="none">No login</SelectItem>,
                      ...EVENT_ROLES.map((r) => <SelectItem key={r}>{EVENT_ROLE_INFO[r].label}</SelectItem>),
                    ]}
                  </Select>
                )}
              </div>
            );
          })}
        </div>
        <Button
          radius="lg"
          className="self-start bg-accent text-surface-light"
          isLoading={busy === 'assign'}
          isDisabled={!!busy || toCreate.length === 0}
          onPress={() => void run('assign', async () => { for (const u of toCreate) await create(u, choiceOf(u) as EventRole); })}
          data-testid="role-login-create-assigned"
        >
          Create {toCreate.length === 1 ? 'a login' : `${toCreate.length} logins`}
        </Button>

        {error && <p className="text-sm text-status-red" data-testid="role-login-error">{error}</p>}
        {listError && <p className="text-sm text-status-red">Couldn&apos;t load logins: {listError}</p>}

        <div className="flex flex-col divide-y divide-surface-liner rounded-lg border border-surface-liner" data-testid="role-login-list">
          {accounts.length === 0 && <p className="p-3 text-sm text-surface-faint">No role logins yet.</p>}
          {accounts.map((a) => (
            <div key={a.uid} className={`flex flex-wrap items-center gap-3 p-2.5 ${a.disabled ? 'opacity-60' : ''}`} data-testid={`role-login-row-${a.username}`}>
              <span className="w-28 truncate text-sm font-semibold">{a.unitName ?? '–'}</span>
              <span className="w-32 text-sm">{EVENT_ROLE_INFO[a.role]?.label ?? a.role}</span>
              <span className="font-mono text-sm">{a.username}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${a.disabled ? 'bg-surface-liner text-surface-faint' : 'bg-status-green/20 text-status-green'}`}>
                {a.disabled ? 'Disabled' : 'Active'}
              </span>
              <div className="ml-auto flex gap-2">
                {!a.disabled && (
                  <Button
                    size="sm"
                    variant="flat"
                    radius="lg"
                    isDisabled={!!busy}
                    isLoading={busy === `replace:${a.uid}`}
                    onPress={() =>
                      void run(`replace:${a.uid}`, async () => {
                        await setRoleLoginDisabled(eventId, a.uid, true);
                        await create({ name: a.unitName ?? '', id: a.unitId }, effectiveRole(a.role), a.label);
                      })
                    }
                    data-testid={`role-login-replace-${a.username}`}
                  >
                    Replace
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="flat"
                  radius="lg"
                  className={a.disabled ? '' : 'bg-status-red/20 text-status-red'}
                  isDisabled={!!busy}
                  isLoading={busy === `toggle:${a.uid}`}
                  onPress={() => void run(`toggle:${a.uid}`, () => setRoleLoginDisabled(eventId, a.uid, !a.disabled))}
                  data-testid={`role-login-toggle-${a.username}`}
                >
                  {a.disabled ? 'Enable' : 'Disable'}
                </Button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-surface-faint">
          Disabling a login stops it within moments, even on a phone already using it. All role logins stop working when the event ends.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button radius="lg" variant="flat" onPress={onClose} data-testid="role-login-close">
          Done
        </Button>
      </ModalFooter>
    </>
  );
}

export default function RoleLoginsModal({
  isOpen,
  onClose,
  event,
  eventId,
  uid,
}: {
  isOpen: boolean;
  onClose: () => void;
  event: Event;
  eventId: string;
  uid: string;
}) {
  return (
    <MciModal isOpen={isOpen} onClose={onClose} testId="role-logins-modal" size="3xl" topClass="mt-10">
      {() => <Body event={event} eventId={eventId} uid={uid} onClose={onClose} />}
    </MciModal>
  );
}
