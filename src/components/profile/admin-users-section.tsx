'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardBody, Input, Spinner, Switch } from '@heroui/react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { dbService, isPocketbaseBackend } from '@/lib/services';
import type { UserDoc } from '@/lib/userDoc';
import type { ServiceUser } from '@/lib/services';

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
}

function toRow(id: string, data: UserDoc & Record<string, unknown>): UserRow {
  return {
    id,
    email: (data.email as string) || '(no email on record)',
    displayName: (data.displayName as string) || (data.name as string) || '',
    isAdmin: Boolean(data.isAdmin),
  };
}

/** Deletes everything a user owns (venues, events, dispatch logs) plus their `users/{id}` doc.
 *  On PocketBase, deleting the `users` record also deletes the underlying auth account.
 *  On Firebase, the Auth account itself is untouched — it has no privileged server-side path
 *  here — so it must be removed separately via the Firebase Console if a full account removal
 *  is needed. */
async function deleteUserAndData(userId: string): Promise<void> {
  const [venues, events, logs] = await Promise.all([
    dbService.queryCollection('venues', [{ field: 'userId', op: '==', value: userId }]),
    dbService.queryCollection('events', [{ field: 'userId', op: '==', value: userId }]),
    dbService.queryCollection('dispatchLogs', [{ field: 'userId', op: '==', value: userId }]),
  ]);

  await Promise.all([
    ...venues.map((v) => dbService.deleteDocument('venues', v.id)),
    ...events.map((e) => dbService.deleteDocument('events', e.id)),
    ...logs.map((l) => dbService.deleteDocument('dispatchLogs', l.id)),
  ]);

  await dbService.deleteDocument('users', userId);
}

export default function AdminUsersSection({ currentUser }: { currentUser: ServiceUser }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [adminTarget, setAdminTarget] = useState<UserRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const docs = await dbService.getCollection<UserDoc & Record<string, unknown>>('users');
      setRows(docs.map((d) => toRow(d.id, d.data ?? {})));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.email.toLowerCase().includes(q) || r.displayName.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const toggleAdmin = async (row: UserRow) => {
    setAdminTarget(null);
    setUpdatingId(row.id);
    try {
      await dbService.setDocument('users', row.id, { isAdmin: !row.isAdmin }, { merge: true });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, isAdmin: !r.isAdmin } : r)));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteUserAndData(deleteTarget.id);
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete user.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card isBlurred className="w-full border border-default-200 bg-surface-deep/40">
      <CardBody className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">Manage Administrator Access</h3>
          <Button
            isIconOnly
            size="sm"
            radius="full"
            variant="light"
            onPress={load}
            isDisabled={loading}
            aria-label="Refresh users"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email"
          classNames={{
            inputWrapper: 'rounded-large px-4 hover:bg-surface-deep',
            input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none',
          }}
          className="mb-4"
        />

        {loading ? (
          <Spinner size="sm" classNames={{ circle1: 'border-b-accent', circle2: 'border-b-accent' }} />
        ) : (
          <div className="minimal-scrollbar space-y-2 max-h-96 overflow-y-auto pr-2">
            {filtered.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-large bg-surface-deeper/90 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-surface-light truncate">{row.displayName || row.email}</p>
                  {row.displayName && <p className="text-xs text-surface-faint truncate">{row.email}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {row.id === currentUser.uid ? (
                    <span className="text-xs text-surface-light/50">(you)</span>
                  ) : (
                    <Button
                      isIconOnly
                      size="sm"
                      radius="full"
                      variant="light"
                      color="danger"
                      onPress={() => {
                        setDeleteError(null);
                        setDeleteTarget(row);
                      }}
                      aria-label={`Delete account for ${row.email}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Switch
                    isSelected={row.isAdmin}
                    onValueChange={() => setAdminTarget(row)}
                    isDisabled={updatingId === row.id}
                    aria-label={`Admin access for ${row.email}`}
                    classNames={{ wrapper: 'group-data-[selected=true]:bg-accent' }}
                  />
                </div>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-sm text-surface-light/50">No users found.</p>}
          </div>
        )}
      </CardBody>

      {adminTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full bg-surface-deepest border border-default-200">
            <CardBody className="p-6">
              <h3 className="text-xl font-semibold mb-2">
                {adminTarget.isAdmin ? 'Remove Admin Access?' : 'Grant Admin Access?'}
              </h3>
              <p className="text-surface-light/80 mb-4">
                {adminTarget.isAdmin
                  ? <>Are you sure? <span className="font-medium">{adminTarget.email}</span> will lose admin privileges.</>
                  : <>Are you sure? <span className="font-medium">{adminTarget.email}</span> will get full admin privileges.</>}
              </p>
              <div className="flex gap-3">
                <Button
                  onPress={() => toggleAdmin(adminTarget)}
                  color={adminTarget.isAdmin ? 'danger' : 'default'}
                  className={adminTarget.isAdmin ? 'flex-1' : 'flex-1 bg-accent'}
                >
                  {adminTarget.isAdmin ? 'Remove Admin' : 'Make Admin'}
                </Button>
                <Button onPress={() => setAdminTarget(null)} variant="bordered" className="flex-1">
                  Cancel
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full bg-surface-deepest border border-status-red/30">
            <CardBody className="p-6">
              <h3 className="text-xl font-semibold text-status-red mb-2">Delete Account</h3>
              <p className={`text-surface-light/80 ${isPocketbaseBackend ? 'mb-4' : 'mb-2'}`}>
                This permanently deletes <span className="font-medium">{deleteTarget.email}</span>&apos;s
                venues, events, dispatch logs, and profile
                {isPocketbaseBackend ? ', including their sign-in account.' : '.'} This cannot be undone.
              </p>
              {!isPocketbaseBackend && (
                <p className="text-xs text-surface-faint mb-4">
                  Their sign-in account itself is not removed by this action (Firebase Auth doesn&apos;t
                  allow that from the app). You can remove it separately in the Firebase Console if needed.
                </p>
              )}
              {deleteError && <p className="text-sm text-status-red mb-4">{deleteError}</p>}
              <div className="flex gap-3">
                <Button
                  onPress={handleDeleteConfirm}
                  color="danger"
                  isDisabled={deleting}
                  isLoading={deleting}
                  className="flex-1"
                >
                  Delete Account &amp; Data
                </Button>
                <Button
                  onPress={() => setDeleteTarget(null)}
                  variant="bordered"
                  isDisabled={deleting}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </Card>
  );
}
