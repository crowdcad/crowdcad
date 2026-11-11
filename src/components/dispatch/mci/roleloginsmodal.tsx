'use client';

import React, { useEffect, useState } from 'react';
import { Button, Input, ModalBody, ModalFooter, ModalHeader, Select, SelectItem } from '@heroui/react';
import { Check, Copy, KeyRound } from 'lucide-react';
import type { Event } from '@/app/types';
import { MCI_INPUT_CLASSNAMES, MciModal } from './mciparts';
import { EVENT_ROLE_INFO, EVENT_ROLES, roleLoginLink, roleLoginMessage, type EventRole, type RoleAccount } from '@/lib/roleAccounts';
import { createRoleLogin, setRoleLoginDisabled, subscribeRoleLogins } from '@/lib/roleAccountStore';

/**
 * Role logins for an MCI (#142): one login per role, handed out as a link or
 * a username and password, so anyone can sign in on any device and go straight
 * to this event in that role. The password is shown only right after a login
 * is made; to give a login to someone new, replace it (the old one stops
 * working at once). Offered right after declaring an MCI, and from the MCI tab.
 */

interface Fresh {
  uid: string;
  role: EventRole;
  username: string;
  password: string;
}

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
  return (
    <div className="rounded-lg border border-status-green/40 bg-status-green/10 p-3" data-testid={`role-login-fresh-${fresh.role}`}>
      <p className="text-sm font-semibold">{EVENT_ROLE_INFO[fresh.role].label}</p>
      <p className="mt-1 font-mono text-sm">
        Username <span className="select-all font-semibold" data-testid="role-login-username">{fresh.username}</span>
        <span className="mx-2 text-surface-faint">·</span>
        Password <span className="select-all font-semibold" data-testid="role-login-password">{fresh.password}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <CopyButton text={roleLoginMessage(origin, eventName, fresh.role, fresh.username, fresh.password)} label="Copy message" testId="role-login-copy-message" />
        <CopyButton text={roleLoginLink(origin, fresh.username, fresh.password)} label="Copy link" />
      </div>
    </div>
  );
}

function Body({ event, eventId, uid, onClose }: { event: Event; eventId: string; uid: string; onClose: () => void }) {
  const [accounts, setAccounts] = useState<RoleAccount[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [role, setRole] = useState<EventRole>('treatment');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Fresh[]>([]);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  useEffect(
    () => subscribeRoleLogins(eventId, (a) => { setAccounts(a); setListError(null); }, (e) => setListError(e.message)),
    [eventId],
  );

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

  const create = async (r: EventRole, note?: string) => {
    const creds = await createRoleLogin({ eventId, eventName: event.name, role: r, label: note, createdBy: uid });
    setFresh((prev) => [...prev, { ...creds, role: r }]);
  };

  const active = accounts.filter((a) => !a.disabled);
  const rolesWithout = EVENT_ROLES.filter((r) => !active.some((a) => a.role === r));

  return (
    <>
      <ModalHeader className="flex flex-col items-start gap-0.5 text-xl font-bold text-surface">
        <span className="inline-flex items-center gap-2">
          <KeyRound className="h-5 w-5" /> Role logins
        </span>
        <span className="text-sm font-normal text-surface-faint">
          Send a link, or a username and password, to whoever takes each role. They sign in at {origin.replace(/^https?:\/\//, '')} on any device and see only this event.
        </span>
      </ModalHeader>
      <ModalBody className="gap-4 py-4">
        {fresh.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-surface-faint">New logins. Copy them now: the password isn&apos;t shown again.</p>
            {fresh.map((f) => (
              <FreshLogin key={f.uid} fresh={f} eventName={event.name} origin={origin} />
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          {rolesWithout.length > 0 && (
            <Button
              radius="lg"
              className="bg-accent text-surface-light"
              isLoading={busy === 'all'}
              isDisabled={!!busy}
              onPress={() => void run('all', async () => { for (const r of rolesWithout) await create(r); })}
              data-testid="role-login-create-all"
            >
              Create a login for {rolesWithout.length === EVENT_ROLES.length ? 'every role' : `the ${rolesWithout.length} roles without one`}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Select
            label="Role"
            size="sm"
            radius="lg"
            className="w-48"
            selectedKeys={new Set([role])}
            onSelectionChange={(keys) => setRole((Array.from(keys as Set<string>)[0] as EventRole) ?? 'treatment')}
            disallowEmptySelection
            data-testid="role-login-role"
          >
            {EVENT_ROLES.map((r) => (
              <SelectItem key={r}>{EVENT_ROLE_INFO[r].label}</SelectItem>
            ))}
          </Select>
          <Input
            size="sm"
            radius="lg"
            label="Note (optional)"
            placeholder="e.g. who it's for"
            className="w-56"
            value={label}
            onValueChange={setLabel}
            classNames={MCI_INPUT_CLASSNAMES}
            data-testid="role-login-label"
          />
          <Button
            radius="lg"
            variant="flat"
            isLoading={busy === 'one'}
            isDisabled={!!busy}
            onPress={() => void run('one', async () => { await create(role, label.trim() || undefined); setLabel(''); })}
            data-testid="role-login-create"
          >
            New login
          </Button>
        </div>

        {error && <p className="text-sm text-status-red" data-testid="role-login-error">{error}</p>}
        {listError && <p className="text-sm text-status-red">Couldn&apos;t load logins: {listError}</p>}

        <div className="flex flex-col divide-y divide-surface-liner rounded-lg border border-surface-liner" data-testid="role-login-list">
          {accounts.length === 0 && <p className="p-3 text-sm text-surface-faint">No role logins yet.</p>}
          {accounts.map((a) => (
            <div key={a.uid} className={`flex flex-wrap items-center gap-3 p-2.5 ${a.disabled ? 'opacity-60' : ''}`} data-testid={`role-login-row-${a.username}`}>
              <span className="w-36 text-sm font-semibold">{EVENT_ROLE_INFO[a.role]?.label ?? a.role}</span>
              <span className="font-mono text-sm">{a.username}</span>
              {a.label && <span className="text-sm text-surface-faint">{a.label}</span>}
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
                        await create(a.role, a.label);
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
          Disabling a login signs it out within moments, even on a phone already using it. All role logins stop working when the event ends.
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
