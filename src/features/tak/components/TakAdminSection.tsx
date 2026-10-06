'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem, Snippet } from '@heroui/react';
import { CheckCircle2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
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
import { backendEnv, COMPOSE_SNIPPET, createBridgeAccount, envBlock, type BridgeCredentials } from '../lib/bridgeAccount';
import { TAK_MODULE_MARKER } from '../marker';
import type { HistoryMode } from '../types';

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
  return `${live ? (status.takConnected ? 'connected to TAK' : 'running, not connected to TAK') : 'offline'} (last seen ${when})`;
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
          <Input size="sm" placeholder="user@example.org" value={newEmail} onValueChange={setNewEmail} aria-label="Email of a user to allow" />
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
          <ModalBody>
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
  const [creds, setCreds] = useState<BridgeCredentials | null>(null);
  const [block, setBlock] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<TakBridgeStatus | null>(null);

  useEffect(() => {
    if (step !== 4 || !creds) return;
    return subscribeBridgeStatus(creds.bridgeUid, setStatus, () => {});
  }, [step, creds]);

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
      setCreds(c);
      setBlock(envBlock(await backendEnv(), c));
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
        <ModalHeader>{rotating ? `Rotate ${rotating.label}` : 'Add TAK server'} ({step} of 4)</ModalHeader>
        <ModalBody className="space-y-3 text-sm">
          {step === 1 && (
            <Input label="Name for this TAK server" placeholder="e.g. Main TAK server" value={label} onValueChange={setLabel} autoFocus />
          )}
          {step === 2 && (
            <ol className="list-decimal space-y-1 pl-5">
              <li>In TAK Portal, create a user for the bridge, for example <code>crowdcad-bridge</code>.</li>
              <li>Add it to the TAK groups your responders use. The bridge only sees positions from groups it belongs to.</li>
              <li>Download the user&apos;s certificate bundle (<code>.p12</code>) and note its password. You will copy it to the TAK host.</li>
            </ol>
          )}
          {step === 3 && creds && (
            <>
              <p>
                Copy this now: the password is shown only once and CrowdCAD does not keep it. On the TAK host, save it as{' '}
                <code>.env</code> in the bridge folder and fill in the TAK section.
              </p>
              <Snippet symbol="" className="w-full" classNames={{ pre: 'whitespace-pre-wrap break-all text-xs' }}>
                {block}
              </Snippet>
              <p>Then, on the TAK host:</p>
              <Snippet symbol="" className="w-full" classNames={{ pre: 'whitespace-pre-wrap text-xs' }}>
                {COMPOSE_SNIPPET}
              </Snippet>
            </>
          )}
          {step === 4 && (
            <div className="flex items-center gap-2">
              {status ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-status-green" /> Connected. {status.takConnected ? 'The bridge reached the TAK Server.' : 'The bridge is running but not connected to TAK yet; check its logs.'}
                </>
              ) : (
                <>Waiting for the bridge to report in… This appears once <code>docker compose up</code> is running.</>
              )}
            </div>
          )}
          {step === 4 && rotating && (
            <p className="text-surface-faint">
              Next: link events to the new server, then revoke {rotating.label}.
            </p>
          )}
          {error && <p className="text-status-red">{error}</p>}
        </ModalBody>
        <ModalFooter>
          {step === 1 && (
            <Button className="bg-accent text-surface-light" isDisabled={!label.trim()} onPress={() => setStep(2)}>
              Next
            </Button>
          )}
          {step === 2 && (
            <Button className="bg-accent text-surface-light" isLoading={busy} onPress={generate}>
              Create bridge account
            </Button>
          )}
          {step === 3 && (
            <Button className="bg-accent text-surface-light" onPress={() => setStep(4)}>
              I&apos;ve copied it
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
          <h3 className="text-xl font-semibold">TAK</h3>
          <p className="text-sm text-surface-faint">TAK servers that can send live team positions to CrowdCAD events. In development.</p>
        </div>
        <Button size="sm" className="bg-accent text-surface-light" startContent={<Plus className="h-4 w-4" />} onPress={() => setWizard({ rotating: null })}>
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
