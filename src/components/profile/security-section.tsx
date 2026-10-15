'use client';

import { useEffect, useState } from 'react';
import { Button, Card, CardBody, Input } from '@heroui/react';
import { authService, dbService, ServiceError, type ServiceUser } from '@/lib/services';
import { Eye, EyeOff, LogOut, Trash2, Download } from 'lucide-react';
import { PROFILE_ACTION_BUTTON } from './buttonStyles';

export default function SecuritySection({ user }: { user: ServiceUser }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [lastPasswordChange, setLastPasswordChange] = useState<Date | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [dispatchLogs, setDispatchLogs] = useState<unknown[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userDoc = await dbService.getDocument<Record<string, unknown>>('users', user.uid);
        if (userDoc.exists && userDoc.data) {
          const raw = userDoc.data.lastPasswordChange;
          const date =
            raw && typeof (raw as { toDate?: () => Date }).toDate === 'function'
              ? (raw as { toDate: () => Date }).toDate()
              : raw instanceof Date
              ? raw
              : raw
              ? new Date(raw as string)
              : null;
          setLastPasswordChange(date);
        }
      } catch (err) {
        console.error('Error loading user data:', err);
      }
    };

    const loadDispatchLogs = async () => {
      try {
        const logs = await dbService.queryCollection('dispatchLogs', [
          { field: 'userId', op: '==', value: user.uid },
        ]);
        setDispatchLogs(logs.map((snap) => ({ id: snap.id, ...(snap.data ?? {}) })));
      } catch (err) {
        console.error('Error loading dispatch logs:', err);
      }
    };

    loadUserData();
    loadDispatchLogs();
  }, [user.uid]);

  const handleChangePassword = async () => {
    if (!authService.currentUser) return setMessage('Not signed in');
    setPasswordError(null);
    if (!currentPassword) {
      setPasswordError('Enter your current password');
      return;
    }
    if (!newPassword) {
      setPasswordError('Enter a new password');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordSaving(true);
    setMessage(null);
    try {
      await authService.updatePassword(currentPassword, newPassword);

      const uid = authService.currentUser!.uid;
      await dbService.setDocument('users', uid, { lastPasswordChange: new Date() }, { merge: true });
      setLastPasswordChange(new Date());

      setMessage('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError(null);
      setShowPasswordForm(false);
    } catch (err) {
      if (err instanceof ServiceError) {
        const code = err.code;
        const errMessage = err.message;
        if (code === 'auth/wrong-password' || /wrong-password|invalid-credential/i.test(errMessage)) {
          setPasswordError('Current password is incorrect');
          setMessage(null);
        } else {
          setPasswordError(null);
          setMessage(errMessage || 'Failed to update password');
        }
      } else {
        setPasswordError(null);
        setMessage(err instanceof Error ? err.message : 'Failed to update password');
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleCancelPasswordForm = () => {
    setShowPasswordForm(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
  };

  const handleSignOut = async () => {
    try {
      await authService.signOut();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to sign out');
    }
  };

  const handleDeleteAccount = async () => {
    if (!authService.currentUser || !deletePassword) {
      setMessage('Enter your password to confirm deletion');
      return;
    }

    setDeleting(true);
    setMessage(null);
    try {
      await dbService.deleteDocument('users', authService.currentUser.uid);
      await authService.deleteCurrentUser(deletePassword);
    } catch (err) {
      if (err instanceof ServiceError) {
        const code = err.code;
        const errMessage = err.message;
        if (code === 'auth/wrong-password' || /wrong-password|invalid-credential/i.test(errMessage)) {
          setMessage('Incorrect password');
        } else {
          setMessage(errMessage || 'Failed to delete account');
        }
      } else {
        setMessage(err instanceof Error ? err.message : 'Failed to delete account');
      }
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setDeletePassword('');
    }
  };

  const handleExportData = () => {
    const data = { user, dispatchLogs };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crowdcad-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 w-full">
      <h2 className="text-3xl font-bold">Security</h2>

      <Card isBlurred className="w-full border border-default-200 bg-surface-deep/40">
        <CardBody className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold">Password</h3>
              {lastPasswordChange && (
                <p className="text-xs text-surface-light/70 mt-1">
                  Last changed: {lastPasswordChange.toLocaleDateString()}
                </p>
              )}
            </div>
            {!showPasswordForm && (
              <Button variant="bordered" size="md" radius="lg" className={PROFILE_ACTION_BUTTON} onPress={() => setShowPasswordForm(true)}>
                Change Password
              </Button>
            )}
          </div>

          {showPasswordForm && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Current Password</label>
                  <Input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    classNames={{
                      inputWrapper: 'rounded-large px-4 hover:bg-surface-deep',
                      input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none',
                    }}
                    endContent={
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="text-surface-light/70 hover:text-surface-light"
                      >
                        {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">New Password</label>
                  <Input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    classNames={{
                      inputWrapper: 'rounded-large px-4 hover:bg-surface-deep',
                      input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none',
                    }}
                    endContent={
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="text-surface-light/70 hover:text-surface-light"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Confirm New Password</label>
                  <Input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    classNames={{
                      inputWrapper: 'rounded-large px-4 hover:bg-surface-deep',
                      input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none',
                    }}
                    endContent={
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="text-surface-light/70 hover:text-surface-light"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button onPress={handleChangePassword} disabled={passwordSaving} className="bg-accent">
                  {passwordSaving ? 'Updating...' : 'Update Password'}
                </Button>
                <Button variant="bordered" onPress={handleCancelPasswordForm} disabled={passwordSaving}>
                  Cancel
                </Button>
              </div>
              {passwordError && <p className="text-status-red text-sm">{passwordError}</p>}
            </div>
          )}
        </CardBody>
      </Card>

      <Card isBlurred className="w-full border border-default-200 bg-surface-deep/40">
        <CardBody className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold">Data &amp; Account</h3>
              <p className="text-sm text-surface-light/70 mt-1">{dispatchLogs.length} dispatch log entries</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onPress={handleExportData} variant="bordered" size="md" radius="lg" className={PROFILE_ACTION_BUTTON} startContent={<Download className="w-4 h-4" />}>
                Export Data
              </Button>
              <Button
                onPress={() => setShowDeleteConfirm(true)}
                color="danger"
                variant="flat"
                size="md"
                radius="lg"
                className={PROFILE_ACTION_BUTTON}
                startContent={<Trash2 className="w-4 h-4" />}
              >
                Delete Account
              </Button>
              <Button onPress={handleSignOut} size="md" radius="lg" startContent={<LogOut className="w-4 h-4" />} className={`${PROFILE_ACTION_BUTTON} bg-accent`}>
                Sign Out
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {message && (
        <div className="fixed bottom-4 right-4 z-50 p-4 bg-accent/90 border border-accent/20 rounded shadow-lg">
          <p className="text-surface-light">{message}</p>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full bg-surface-deepest border border-status-red/30">
            <CardBody className="p-6">
              <h3 className="text-xl font-semibold text-status-red mb-2">Delete Account</h3>
              <p className="text-surface-light/80 mb-4">
                This action cannot be undone. All your data will be permanently deleted.
              </p>
              <p className="text-sm text-surface-faint mb-4">Enter your password to confirm:</p>
              <Input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your password"
                classNames={{
                  inputWrapper:
                    'group-data-[focus=true]:ring-0 group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0',
                  input: 'outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
                }}
              />
              <div className="flex gap-3 mt-4">
                <Button
                  onPress={handleDeleteAccount}
                  color="danger"
                  disabled={deleting || !deletePassword}
                  className="flex-1"
                >
                  {deleting ? 'Deleting...' : 'Delete Account'}
                </Button>
                <Button
                  onPress={() => {
                    setShowDeleteConfirm(false);
                    setDeletePassword('');
                    setMessage(null);
                  }}
                  variant="bordered"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
              {message && <p className="mt-3 text-sm text-status-red">{message}</p>}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
