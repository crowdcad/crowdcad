'use client';

import React, { useEffect, useState } from 'react';
import { Button, Select, SelectItem } from '@heroui/react';
import { Check, Copy, KeyRound, Mail, Share2 } from 'lucide-react';
import HelpTip from '@/components/ui/helptip';
import { effectiveRole, EVENT_ROLE_INFO, EVENT_ROLES, roleLoginLink, roleLoginMessage, type EventRole, type RoleAccount } from '@/lib/roleAccounts';
import { createRoleLogin, resetRoleLoginPassword, setRoleLoginAssignment, setRoleLoginDisabled, subscribeRoleLogins } from '@/lib/roleAccountStore';
import { LOGI } from './logisticsstyles';

/**
 * Role logins (#142, #152) in MCI Logistics: one row per team or supervisor on the board, so it is clear who
 * holds which login. Everything a login submits is logged under its unit. The dispatcher creates logins
 * (teams default to Responder), changes a login's role, notes who holds it, and disables or re-enables it.
 * Reset password makes a new password (the old one stops working) and shows it once with Share, Copy, Email
 * and link buttons: that is also how a login is sent again, since passwords are never stored. The event's
 * Logistics lead sees the same list and may only reset passwords (`uid` unset).
 */

export interface RoleLoginUnit {
  name: string;
  id?: string;
  kind: 'team' | 'supervisor';
}

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

function FreshLogin({ fresh, eventName, origin, onDismiss }: { fresh: Fresh; eventName: string; origin: string; onDismiss: () => void }) {
  const message = roleLoginMessage(origin, eventName, fresh.role, fresh.username, fresh.password, fresh.unitName);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <div className="rounded-lg border border-status-green/40 bg-status-green/10 p-3" data-testid={`role-login-fresh-${fresh.unitName}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">
          {fresh.unitName} · {EVENT_ROLE_INFO[fresh.role].label}
        </p>
        <button type="button" className={LOGI.link} onClick={onDismiss}>
          Hide
        </button>
      </div>
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

/** "Held by" note, saved on Enter or leaving the field. */
function HolderInput({ account, disabled, onSave }: { account: RoleAccount; disabled: boolean; onSave: (label: string) => void }) {
  const [value, setValue] = useState(account.label ?? '');
  useEffect(() => setValue(account.label ?? ''), [account.label]);
  const commit = () => {
    if (value.trim() !== (account.label ?? '')) onSave(value.trim());
  };
  return (
    <input
      aria-label={`Who holds ${account.username}`}
      placeholder="Held by"
      maxLength={80}
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`${LOGI.input} w-full min-w-0`}
      data-testid={`role-login-holder-${account.username}`}
    />
  );
}

export default function RoleLogins({ eventId, eventName, units, uid }: { eventId: string; eventName: string; units: RoleLoginUnit[]; uid?: string }) {
  const manage = !!uid;
  const [accounts, setAccounts] = useState<RoleAccount[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Fresh[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  useEffect(
    () => subscribeRoleLogins(eventId, (a) => { setAccounts(a); setListError(null); }, (e) => setListError(e.message)),
    [eventId],
  );

  const activeFor = (name: string) => accounts.find((a) => !a.disabled && a.unitName === name);
  const choiceOf = (u: RoleLoginUnit): Choice => choices[u.name] ?? (u.kind === 'team' ? 'responder' : 'none');
  const toCreate = manage ? units.filter((u) => !activeFor(u.name) && choiceOf(u) !== 'none') : [];
  // Disabled logins, and any whose unit has left the board.
  const others = accounts.filter((a) => a.disabled || !units.some((u) => u.name === a.unitName));

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
  const show = (f: Fresh) => setFresh((prev) => [...prev.filter((p) => p.unitName !== f.unitName), f]);
  const create = async (unit: { name: string; id?: string }, role: EventRole, label?: string) => {
    const creds = await createRoleLogin({ eventId, eventName, role, label, unitName: unit.name, unitId: unit.id, createdBy: uid! });
    show({ ...creds, role, unitName: unit.name });
  };
  const reset = (a: RoleAccount) =>
    run(`reset:${a.uid}`, async () => {
      const creds = await resetRoleLoginPassword(eventId, a.uid);
      if (creds) return show({ ...creds, role: effectiveRole(a.role), unitName: a.unitName ?? '' });
      // No server to change the password (emulator, no credentials): a dispatcher replaces the login instead.
      if (!manage) throw new Error('Resetting a password needs the server. Ask the dispatcher.');
      await setRoleLoginDisabled(eventId, a.uid, true);
      await create({ name: a.unitName ?? '', id: a.unitId }, effectiveRole(a.role), a.label);
    });

  const allMessages = fresh.map((f) => roleLoginMessage(origin, eventName, f.role, f.username, f.password, f.unitName)).join('\n\n');
  const cols = manage ? 'grid-cols-[minmax(6rem,1fr)_11rem_minmax(7rem,1fr)_6rem_auto]' : 'grid-cols-[minmax(6rem,1fr)_8rem_6rem_auto]';

  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label="Logins" data-testid="role-logins">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="h-4 w-4" aria-hidden />
          <h3 className={LOGI.heading}>Logins</h3>
          <HelpTip
            text={`Each login belongs to a team or supervisor; what it submits is logged under that name. They sign in at ${origin.replace(/^https?:\/\//, '')} on any device and see only their role. Reset password makes a new one to send (the old one stops working). Disabling stops a login within moments; all stop when the event ends.`}
            label="About logins"
          />
        </span>
        {manage && (
          <Button
            size="sm"
            radius="lg"
            className="bg-accent text-surface-light"
            isLoading={busy === 'assign'}
            isDisabled={!!busy || toCreate.length === 0}
            onPress={() => void run('assign', async () => { for (const u of toCreate) await create(u, choiceOf(u) as EventRole); })}
            data-testid="role-login-create-assigned"
          >
            Create {toCreate.length === 1 ? 'a login' : `${toCreate.length} logins`}
          </Button>
        )}
      </div>

      {fresh.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className={LOGI.meta}>Send these now: the password isn&apos;t shown again (Reset password makes a new one).</p>
            {fresh.length > 1 && <CopyButton text={allMessages} label="Copy all" testId="role-login-copy-all" />}
          </div>
          {fresh.map((f) => (
            <FreshLogin key={f.uid} fresh={f} eventName={eventName} origin={origin} onDismiss={() => setFresh((prev) => prev.filter((p) => p !== f))} />
          ))}
        </div>
      )}

      {error && <p className="text-sm text-status-red" data-testid="role-login-error">{error}</p>}
      {listError && <p className="text-sm text-status-red">Couldn&apos;t load logins: {listError}</p>}

      <div className="minimal-scrollbar overflow-x-auto rounded-lg border border-surface-liner">
        <div className="flex min-w-max flex-col divide-y divide-surface-liner" data-testid="role-login-list">
          {units.length === 0 && <p className="p-3 text-sm text-surface-faint">Add teams or supervisors to the event first.</p>}
          {units.map((u) => {
            const a = activeFor(u.name);
            return (
              <div key={u.name} className={`grid ${cols} items-center gap-2 px-3 py-1.5`} data-testid={`role-assign-${u.name}`}>
                <span className="truncate text-sm font-semibold">
                  {u.name}
                  <span className="ml-1.5 text-xs font-normal text-surface-faint">{u.kind}</span>
                </span>
                {manage ? (
                  <Select
                    aria-label={`Role for ${u.name}`}
                    size="sm"
                    radius="lg"
                    selectedKeys={new Set([a ? effectiveRole(a.role) : choiceOf(u)])}
                    disallowEmptySelection
                    isDisabled={!!busy}
                    onSelectionChange={(keys) => {
                      const next = Array.from(keys as Set<string>)[0] as Choice;
                      if (!a) return setChoices((c) => ({ ...c, [u.name]: next }));
                      if (next !== 'none' && next !== effectiveRole(a.role)) void run(`role:${a.uid}`, () => setRoleLoginAssignment(eventId, a.uid, { role: next }));
                    }}
                    data-testid={`role-assign-${u.name}-role`}
                  >
                    {[...(a ? [] : [<SelectItem key="none">No login</SelectItem>]), ...EVENT_ROLES.map((r) => <SelectItem key={r}>{EVENT_ROLE_INFO[r].label}</SelectItem>)]}
                  </Select>
                ) : (
                  <span className="text-sm">{a ? EVENT_ROLE_INFO[a.role]?.label ?? a.role : '–'}</span>
                )}
                {manage && (a ? <HolderInput account={a} disabled={!!busy} onSave={(label) => void run(`label:${a.uid}`, () => setRoleLoginAssignment(eventId, a.uid, { label }))} /> : <span />)}
                <span className="truncate font-mono text-sm text-surface-faint" data-testid={a ? `role-login-row-${a.username}` : undefined}>
                  {a ? (
                    <>
                      {a.username} <span className="sr-only">Active</span>
                    </>
                  ) : (
                    'No login'
                  )}
                </span>
                <div className="flex justify-end gap-1.5">
                  {a && (
                    <Button size="sm" variant="flat" radius="lg" isDisabled={!!busy} isLoading={busy === `reset:${a.uid}`} onPress={() => void reset(a)} data-testid={`role-login-reset-${a.username}`}>
                      Reset password
                    </Button>
                  )}
                  {a && manage && (
                    <Button
                      size="sm"
                      variant="flat"
                      radius="lg"
                      className="bg-status-red/20 text-status-red"
                      isDisabled={!!busy}
                      isLoading={busy === `toggle:${a.uid}`}
                      onPress={() => void run(`toggle:${a.uid}`, () => setRoleLoginDisabled(eventId, a.uid, true))}
                      data-testid={`role-login-toggle-${a.username}`}
                    >
                      Disable
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {manage && others.length > 0 && (
        <details className="text-sm">
          <summary className={`${LOGI.meta} cursor-pointer`}>Disabled and other logins ({others.length})</summary>
          <div className="mt-1 flex flex-col divide-y divide-surface-liner rounded-lg border border-surface-liner">
            {others.map((a) => (
              <div key={a.uid} className={`flex flex-wrap items-center gap-3 px-3 py-1.5 ${a.disabled ? 'opacity-70' : ''}`} data-testid={`role-login-row-${a.username}`}>
                <span className="w-28 truncate font-semibold">{a.unitName ?? '–'}</span>
                <span className="w-32">{EVENT_ROLE_INFO[a.role]?.label ?? a.role}</span>
                <span className="font-mono">{a.username}</span>
                <span className={LOGI.meta}>{a.disabled ? 'Disabled' : 'Active'}</span>
                <Button
                  size="sm"
                  variant="flat"
                  radius="lg"
                  className="ml-auto"
                  isDisabled={!!busy}
                  isLoading={busy === `toggle:${a.uid}`}
                  onPress={() => void run(`toggle:${a.uid}`, () => setRoleLoginDisabled(eventId, a.uid, !a.disabled))}
                  data-testid={`role-login-toggle-${a.username}`}
                >
                  {a.disabled ? 'Enable' : 'Disable'}
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
