'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardBody, Button, Input } from '@heroui/react';
import { authService, ServiceError } from '@/lib/services';
import { FORM_FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';

const inputClassNames = FORM_FIELD_CLASSNAMES;

const cardProps = {
  isBlurred: true,
  className: 'border border-default-200',
  style: { backgroundColor: 'hsl(var(--surface-bg-2) / 0.5)' },
} as const;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const code = searchParams.get('oobCode') || searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!code) return;
    if (!newPassword) {
      setError('Enter a new password');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      await authService.confirmPasswordReset(code, newPassword);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ServiceError
          ? err.message
          : 'Failed to reset password. The link may have expired — request a new one.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!code) {
    return (
      <Card {...cardProps}>
        <CardBody className="p-6">
          <h1 className="text-2xl font-semibold mb-2">Invalid Reset Link</h1>
          <p className="text-surface-light/80">
            This password reset link is invalid or has expired. Request a new one from the sign-in screen.
          </p>
          <Link href="/" className="mt-4 inline-block text-status-blue hover:underline">
            Back to sign in
          </Link>
        </CardBody>
      </Card>
    );
  }

  if (done) {
    return (
      <Card {...cardProps}>
        <CardBody className="p-6">
          <h1 className="text-2xl font-semibold mb-2">Password Reset</h1>
          <p className="text-surface-light/80">Your password has been updated. You can now sign in with it.</p>
          <Link href="/" className="mt-4 inline-block text-status-blue hover:underline">
            Back to sign in
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card {...cardProps}>
        <CardBody className="p-6">
          <h1 className="text-2xl font-semibold mb-1">Reset Password</h1>
          <p className="text-surface-light/80 mb-6">Choose a new password for your account.</p>

          <div className="grid grid-cols-1 gap-4">
            <Input
              label="New Password"
              labelPlacement="outside"
              size="lg"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              classNames={inputClassNames}
            />
            <Input
              label="Confirm New Password"
              labelPlacement="outside"
              size="lg"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              classNames={inputClassNames}
            />
          </div>

          {error && <p className="text-status-red text-sm mt-3">{error}</p>}

          <div className="mt-6">
            <Button
              type="submit"
              size="lg"
              radius="lg"
              className="bg-accent hover:bg-accent/90 text-surface-light"
              isLoading={saving}
              isDisabled={saving}
            >
              Reset Password
            </Button>
          </div>
        </CardBody>
      </Card>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="relative min-h-[calc(100vh-3.5rem)] bg-surface-deepest text-surface-light overflow-hidden">
      <section className="relative z-10 max-w-md mx-auto px-6 py-12">
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </section>
    </main>
  );
}
