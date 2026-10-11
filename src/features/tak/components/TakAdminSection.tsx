'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem, Snippet } from '@heroui/react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import {
  findUserIdByEmail,
  forgetMapping,
  getUserEmails,
  listAllBridges,
  listMappings,
  revokeBridge,
  subscribeBridgeStatus,
  updateBridge,
  type TakBridge,
  type TakBridgeStatus,
  type TakDeviceMapping,
} from '../data/takStore';
import { createBridgeAccount, type BridgeCredentials } from '../lib/bridgeAccount';
import {
  backendEnv,
  detectLocalSetup,
  envBlock,
  parseEnrollLink,
  setupChecklist,
  setupCommands,
  type ChecklistItem,
  type LocalOs,
  type Placement,
  type TakSignIn,
} from '../lib/bridgeSetup';
import { TAK_MODULE_MARKER } from '../marker';
import type { HistoryMode } from '../types';
import { TAK_INPUT_CLASSNAMES } from '../lib/ui';
import HelpTip from '@/components/geo/HelpTip';
import { PROFILE_ACTION_BUTTON } from '@/components/profile/buttonStyles';

/**
 * Admin > TAK: TAK servers (bridges) for this CrowdCAD. Only admins see this
 * section; only admins can create, edit, rotate or revoke bridges, or choose
 * who may use them (enforced by the rules, not just this UI).
 */
export interface TakAdminSectionProps {
  adminUid: string;
}

const HISTORY_LABELS: Record<HistoryMode, string> = {
  off: 'Off (live only)',
  summary: 'Summary (default)',
  detailed: 'Detailed',
};

function lastSeen(status: TakBridgeStatus | null | undefined): string {
  if (!status) return 'never connected';
  const s = Math.round((Date.now() - status.lastSeenAt) / 1000);
  const when = s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`;
  const live = s < 180;
  const state = live ? (status.takConnected ? 'connected to TAK' : 'running, not connected to TAK') : 'offline';
  const devices =
    live && status.takConnected && status.devicesSeen !== undefined
      ? `, ${status.devicesSeen} device${status.devicesSeen === 1 ? '' : 's'} seen`
      : '';
  const problem = live && !status.takConnected && status.takError ? `. ${status.takError}` : '';
  return `${state}${devices} (last seen ${when})${problem}`;
}

function BridgeRow({
  bridge,
  onChanged,
  onRotate,
}: {
  bridge: TakBridge;
  onChanged: () => void;
  onRotate: (b: TakBridge) => void;
}) {
  const [status, setStatus] = useState<TakBridgeStatus | null | undefined>(undefined);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [newEmail, setNewEmail] = useState('');
  const [mappings, setMappings] = useState<TakDeviceMapping[] | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeBridgeStatus(bridge.bridgeUid, setStatus, () => setStatus(null)), [bridge.bridgeUid]);
  useEffect(() => {
    void getUserEmails(bridge.allowedUsers).then(setEmails);
  }, [bridge.allowedUsers]);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const addUser = () =>
    run(async () => {
      const uid = await findUserIdByEmail(newEmail);
      if (!uid) throw new Error('No user with that email has signed in to CrowdCAD yet.');
      if (!bridge.allowedUsers.includes(uid)) await updateBridge(bridge, { allowedUsers: [...bridge.allowedUsers, uid] });
      setNewEmail('');
    });

  return (
    <div className="space-y-3 rounded-lg border border-surface-liner p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{bridge.label}</p>
          <p className="text-sm text-surface-faint">{status === undefined ? 'Loading status…' : lastSeen(status)}</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="flat" startContent={<RefreshCw className="h-4 w-4" />} onPress={() => onRotate(bridge)}>
            Rotate
          </Button>
          <Button size="sm" variant="flat" color="danger" startContent={<Trash2 className="h-4 w-4" />} onPress={() => setConfirmRevoke(true)}>
            Revoke
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">Who can use this TAK server</p>
        {bridge.allowedUsers.length === 0 && <p className="text-sm text-surface-faint">Nobody yet.</p>}
        {bridge.allowedUsers.map((uid) => (
          <div key={uid} className="flex items-center justify-between text-sm">
            <span className="truncate">{emails[uid] ?? uid}</span>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label={`Remove ${emails[uid] ?? uid}`}
              onPress={() => run(() => updateBridge(bridge, { allowedUsers: bridge.allowedUsers.filter((u) => u !== uid) }))}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input classNames={TAK_INPUT_CLASSNAMES} size="sm" placeholder="user@example.org" value={newEmail} onValueChange={setNewEmail} aria-label="Email of a user to allow" />
          <Button size="sm" variant="flat" isDisabled={!newEmail.trim()} onPress={addUser}>
            Add
          </Button>
        </div>
      </div>

      <Select
        size="sm"
        label="Default location history for new events"
        selectedKeys={[bridge.defaultHistoryMode]}
        onSelectionChange={(keys) => {
          const m = Array.from(keys)[0] as HistoryMode | undefined;
          if (m) void run(() => updateBridge(bridge, { defaultHistoryMode: m }));
        }}
      >
        {(Object.keys(HISTORY_LABELS) as HistoryMode[]).map((m) => (
          <SelectItem key={m}>{HISTORY_LABELS[m]}</SelectItem>
        ))}
      </Select>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Remembered devices</p>
          {mappings === null && (
            <Button size="sm" variant="light" onPress={() => void listMappings(bridge.bridgeUid).then(setMappings)}>
              Show
            </Button>
          )}
        </div>
        {mappings?.length === 0 && <p className="text-sm text-surface-faint">None yet. Devices are remembered when someone assigns them to a team.</p>}
        {mappings?.map((m) => (
          <div key={m.deviceUid} className="flex items-center justify-between text-sm">
            <span className="truncate">
              {m.callsign || m.deviceUid} → {m.teamName}
            </span>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label="Forget device"
              onPress={() =>
                run(async () => {
                  await forgetMapping(bridge.bridgeUid, m.deviceUid);
                  setMappings((prev) => prev?.filter((x) => x.deviceUid !== m.deviceUid) ?? null);
                })
              }
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-status-red">{error}</p>}

      <Modal isOpen={confirmRevoke} onClose={() => setConfirmRevoke(false)}>
        <ModalContent>
          <ModalHeader>Revoke {bridge.label}?</ModalHeader>
          <ModalBody className="minimal-scrollbar">
            <p className="text-sm">
              The bridge loses all access immediately and stops updating every event it is linked to. To replace it, use Rotate
              instead. This can&apos;t be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setConfirmRevoke(false)}>
              Cancel
            </Button>
            <Button color="danger" onPress={() => run(() => revokeBridge(bridge)).then(() => setConfirmRevoke(false))}>
              Revoke
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

type WizardStep = 1 | 2 | 3 | 4;

const CHECK_ICON: Record<ChecklistItem['state'], React.ReactNode> = {
  done: <CheckCircle2 className="h-5 w-5 shrink-0 text-status-green" />,
  waiting: <Loader2 className="h-5 w-5 shrink-0 animate-spin text-surface-faint" />,
  problem: <AlertTriangle className="h-5 w-5 shrink-0 text-status-red" />,
};

function Choice({
  checked,
  onSelect,
  title,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`w-full rounded-lg border p-3 text-left ${checked ? 'border-accent bg-accent/10' : 'border-surface-liner'}`}
    >
      <p className="font-medium">{title}</p>
      <p className="text-surface-faint">{children}</p>
    </button>
  );
}

function CopyBlock({ text }: { text: string }) {
  return (
    <Snippet symbol="" className="w-full" classNames={{ pre: 'minimal-scrollbar whitespace-pre-wrap break-all text-xs' }}>
      {text}
    </Snippet>
  );
}

function AddTakServerWizard({
  adminUid,
  rotating,
  onClose,
}: {
  adminUid: string;
  rotating: TakBridge | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<WizardStep>(1);
  const [label, setLabel] = useState(rotating ? `${rotating.label} (new)` : '');
  const [placement, setPlacement] = useState<Placement>('tak-host');
  const [os, setOs] = useState<LocalOs>(() =>
    typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent) ? 'windows' : 'unix',
  );
  const [link, setLink] = useState('');
  const [tak, setTak] = useState<TakSignIn>({ host: '', username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [creds, setCreds] = useState<BridgeCredentials | null>(null);
  const [env, setEnv] = useState<{ block: string; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<TakBridgeStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void detectLocalSetup().then((local) => {
      if (local) setPlacement('local');
    });
  }, []);
  useEffect(() => {
    if (step !== 4 || !creds) return;
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    const unsubscribe = subscribeBridgeStatus(creds.bridgeUid, setStatus, () => {});
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [step, creds]);

  const linkParsed = link.trim() ? parseEnrollLink(link) : null;
  const onLink = (text: string) => {
    setLink(text);
    // Only the address and username: the link's token works once at most, and
    // the bridge signs in again at every certificate renewal, so the password
    // is always typed in.
    const parsed = parseEnrollLink(text);
    if (parsed) setTak((t) => ({ ...t, host: parsed.host, username: parsed.username }));
  };
  const takReady = !!(tak.host.trim() && tak.username.trim() && tak.password);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await createBridgeAccount({
        label: label.trim(),
        allowedUsers: rotating?.allowedUsers ?? [adminUid],
        defaultHistoryMode: rotating?.defaultHistoryMode ?? 'summary',
        createdBy: adminUid,
      });
      const backend = await backendEnv(placement);
      setCreds(c);
      setEnv({
        block: envBlock(backend.vars, c, { ...tak, host: tak.host.trim(), username: tak.username.trim() }),
        warnings: backend.warnings,
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the bridge account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="2xl" scrollBehavior="inside" isDismissable={step !== 3}>
      <ModalContent>
        <ModalHeader>
          {rotating ? `Rotate ${rotating.label}` : 'Add TAK server'} ({step} of 4)
        </ModalHeader>
        <ModalBody className="minimal-scrollbar space-y-3 text-sm">
          {step === 1 && (
            <>
              <Input classNames={TAK_INPUT_CLASSNAMES} label="Name for this TAK server" placeholder="e.g. Main TAK server" value={label} onValueChange={setLabel} autoFocus />
              <p className="font-medium">Where will the bridge run?</p>
              <div role="radiogroup" className="space-y-2">
                <Choice checked={placement === 'tak-host'} onSelect={() => setPlacement('tak-host')} title="On the TAK Server machine (Docker)">
                  For real use. The bridge runs next to TAK Server and starts again after a reboot. Needs Docker and git on that machine.
                </Choice>
                <Choice checked={placement === 'local'} onSelect={() => setPlacement('local')} title="On this computer (test)">
                  For trying it out, including against a local CrowdCAD with emulators. Needs Node.js 22 or newer and git. The bridge stops
                  when you close its window.
                </Choice>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p>The bridge signs in to TAK Server as its own TAK user, the same way a phone does. In TAK Portal:</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  Create a user for the bridge, for example <code>crowdcad-bridge</code>, and give it a password.
                </li>
                <li>
                  Add it to the same TAK groups your responders&apos; phones use. The bridge only sees positions from groups it belongs to.
                </li>
                <li>
                  Open the user&apos;s <strong>Enroll QR</strong>. If TAK Portal shows the link next to the code, copy it. Otherwise scan the
                  code with a phone camera and copy the text it shows. Paste it below to fill in the address and username, or type them in yourself.
                </li>
              </ol>
              <Input classNames={TAK_INPUT_CLASSNAMES}
                label="Enroll QR link (optional)"
                placeholder="tak://com.atakmap.app/enroll?host=…&username=…&token=…"
                value={link}
                onValueChange={onLink}
                description={link.trim() && !linkParsed ? "That doesn't look like an enrollment link." : undefined}
              />
              <Input classNames={TAK_INPUT_CLASSNAMES}
                label="TAK Server address"
                placeholder="takserver.example.org"
                value={tak.host}
                onValueChange={(host) => setTak((t) => ({ ...t, host }))}
                description="The TAK Server itself, not the TAK Portal web address. Phones connect to it on port 8089."
              />
              <div className="flex gap-2">
                <Input classNames={TAK_INPUT_CLASSNAMES} label="TAK username" autoComplete="off" value={tak.username} onValueChange={(username) => setTak((t) => ({ ...t, username }))} />
                <Input classNames={TAK_INPUT_CLASSNAMES}
                  label={
                    <span className="inline-flex items-center gap-1">
                      TAK user&apos;s password
                      <HelpTip text="The password you gave this TAK user in TAK Portal. It only goes into the bridge's settings on the next screen; CrowdCAD does not save it. Not the Enroll QR token: a token works once at most, and the bridge signs in again each time it renews its certificate." />
                    </span>
                  }
                  type={showPassword ? 'text' : 'password'}
                  // Not this site's own login: keeps the browser's password manager from filling it in unseen.
                  autoComplete="new-password"
                  value={tak.password}
                  onValueChange={(password) => setTak((t) => ({ ...t, password }))}
                  endContent={
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-surface-faint hover:text-surface-light"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                />
              </div>
            </>
          )}

          {step === 3 && creds && env && (
            <>
              <p>
                <strong>Copy this now.</strong> The passwords are shown only once and CrowdCAD does not keep them. If you lose them, use
                Rotate.
              </p>
              {env.warnings.map((w) => (
                <p key={w} className="flex gap-2 text-status-red">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {w}
                </p>
              ))}
              {placement === 'tak-host' ? (
                <>
                  <p>
                    Sign in to the TAK Server machine (for example with <code>ssh</code>), go to the folder where the bridge should live,
                    and paste all of this. It downloads the bridge, writes its settings to <code>.env</code>, and starts it:
                  </p>
                  <CopyBlock text={setupCommands('tak-host', env.block)} />
                  <p className="text-surface-faint">
                    The last command shows the bridge&apos;s log. Look for &quot;enrolled with TAK Server&quot; and &quot;connected to TAK
                    Server&quot;. Press Ctrl+C to stop watching; the bridge keeps running.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Button size="sm" variant={os === 'windows' ? 'solid' : 'flat'} onPress={() => setOs('windows')}>
                      Windows (PowerShell)
                    </Button>
                    <Button size="sm" variant={os === 'unix' ? 'solid' : 'flat'} onPress={() => setOs('unix')}>
                      macOS or Linux
                    </Button>
                  </div>
                  <p>
                    Open {os === 'windows' ? 'PowerShell' : 'Terminal'} on <strong>this computer</strong> (the one showing this page, not
                    the TAK Server machine: the bridge has to reach the same CrowdCAD this browser uses). Go to the folder where the bridge
                    should live (for example <code>cd {os === 'windows' ? '$HOME' : '~'}</code>) and paste all of this:
                  </p>
                  <CopyBlock text={setupCommands('local', env.block, os)} />
                  <p className="text-surface-faint">
                    Keep that window open while testing. Ctrl+C stops the bridge. To start it again later, run{' '}
                    <code>node --env-file=.env dist/index.js</code> in the <code>tak-bridge</code> folder.
                  </p>
                </>
              )}
              <details>
                <summary className="cursor-pointer">Just the .env contents</summary>
                <CopyBlock text={env.block} />
              </details>
            </>
          )}

          {step === 4 && (
            <>
              <ul className="space-y-3">
                {setupChecklist(status, placement, now).map((item) => (
                  <li key={item.label} className="flex gap-2">
                    {CHECK_ICON[item.state]}
                    <div>
                      <p className="font-medium">{item.label}</p>
                      {item.hint && <p className="text-surface-faint">{item.hint}</p>}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-surface-faint">
                The bridge reports about once a minute, so allow a minute or two. You can close this at any time; the same status shows in
                this TAK server&apos;s row.
              </p>
              {rotating && <p className="text-surface-faint">Next: link events to the new server, then revoke {rotating.label}.</p>}
            </>
          )}
          {error && <p className="text-status-red">{error}</p>}
        </ModalBody>
        <ModalFooter>
          {step === 2 && (
            <Button variant="flat" onPress={() => setStep(1)}>
              Back
            </Button>
          )}
          {step === 1 && (
            <Button className="bg-accent text-surface-light" isDisabled={!label.trim()} onPress={() => setStep(2)}>
              Next
            </Button>
          )}
          {step === 2 && (
            <Button className="bg-accent text-surface-light" isDisabled={!takReady} isLoading={busy} onPress={generate}>
              Create bridge settings
            </Button>
          )}
          {step === 3 && (
            <Button className="bg-accent text-surface-light" onPress={() => setStep(4)}>
              I&apos;ve copied it and started the bridge
            </Button>
          )}
          {step === 4 && <Button onPress={onClose}>Done</Button>}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default function TakAdminSection({ adminUid }: TakAdminSectionProps) {
  const [bridges, setBridges] = useState<TakBridge[] | null>(null);
  const [wizard, setWizard] = useState<{ rotating: TakBridge | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    void listAllBridges()
      .then(setBridges)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load TAK servers.'));
  }, []);
  useEffect(reload, [reload]);

  return (
    <section className="space-y-3" data-tak-module={TAK_MODULE_MARKER}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="inline-flex items-center gap-1.5 text-xl font-semibold">
            TAK
            <HelpTip text="TAK servers that can send live team positions to CrowdCAD events. In development." />
          </h3>
        </div>
        <Button size="md" radius="lg" className={`${PROFILE_ACTION_BUTTON} bg-accent text-surface-light`} startContent={<Plus className="h-4 w-4" />} onPress={() => setWizard({ rotating: null })}>
          Add TAK server
        </Button>
      </div>
      {bridges === null && !error && <p className="text-sm text-surface-faint">Loading…</p>}
      {bridges?.length === 0 && <p className="text-sm text-surface-faint">No TAK servers yet.</p>}
      {bridges?.map((b) => (
        <BridgeRow key={b.bridgeUid} bridge={b} onChanged={reload} onRotate={(r) => setWizard({ rotating: r })} />
      ))}
      {error && <p className="text-sm text-status-red">{error}</p>}
      {wizard && (
        <AddTakServerWizard
          adminUid={adminUid}
          rotating={wizard.rotating}
          onClose={() => {
            setWizard(null);
            reload();
          }}
        />
      )}
    </section>
  );
}
