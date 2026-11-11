'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isRoleLoginEmail, signInEmailFor } from '@/lib/roleAccounts';
import { authService } from '@/lib/services';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from '@heroui/react';

interface LoginModalProps {
  open: boolean;
  mode: 'login' | 'signup';
  onClose: () => void;
  setMode: (mode: 'login' | 'signup') => void;
  initialError?: string | null;
}

export default function LoginModal({
  open,
  mode,
  onClose,
  setMode,
  initialError,
}: LoginModalProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open && initialError) {
      setError(initialError);
    } else if (!open) {
      setError(null);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setShowForgotPassword(false);
      setResetMessage(null);
    }
  }, [open, initialError]);

  // Reset fields when switching modes
  useEffect(() => {
    setError(null);
    setPassword('');
    setConfirmPassword('');
    setShowForgotPassword(false);
    setResetMessage(null);
  }, [mode]);

  const handleSubmit = async () => {
    if (submitting) return;
    setError(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setSubmitting(true);

      if (mode === 'login') {
        // A role username ("treat-7k2q") signs in as its role login (#142).
        await authService.signIn(signInEmailFor(email), password);
      } else {
        await authService.signUp(email, password);
      }

      document.cookie = 'ccad_auth=1; Max-Age=604800; Path=/; SameSite=Lax';

      router.refresh();
      onClose();

      const redirectPath = sessionStorage.getItem('redirectPath');
      if (mode === 'login' && isRoleLoginEmail(signInEmailFor(email))) {
        router.push('/role');
      } else if (redirectPath) {
        sessionStorage.removeItem('redirectPath');
        router.push(redirectPath);
      } else {
        router.push('/venues/selection');
      }
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError('Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!email || resetSubmitting) return;
    setResetSubmitting(true);
    setResetMessage(null);
    try {
      await authService.sendPasswordResetEmail(email, `${window.location.origin}/reset-password`);
    } catch {
      // Deliberately swallowed — always show the same generic message below
      // so this form can't be used to enumerate which emails have accounts.
    } finally {
      setResetSubmitting(false);
      setResetMessage('If an account exists for that email, a reset link has been sent.');
    }
  };

  const isSubmitDisabled =
    submitting ||
    !email ||
    !password ||
    (mode === 'signup' && !confirmPassword);

  const inputClassNames = {
    label: 'text-surface-light mb-1',
    inputWrapper: 'rounded-large px-4 hover:bg-surface-deep',
    input:
      'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none',
  } as const;

  return (
    <Modal
      isOpen={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      placement="center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      classNames={{
        base: 'rounded-lg bg-surface-deepest text-surface-light',
        header: 'pb-0',
        body: 'py-4',
        footer: 'pt-0',
      }}
    >
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader className="text-2xl font-bold text-surface">
              {showForgotPassword ? 'Reset Password' : mode === 'login' ? 'Login' : 'Create an Account'}
            </ModalHeader>

            {showForgotPassword ? (
              <ModalBody>
                <p className="text-sm text-surface-light/80">
                  Enter your account email and we&apos;ll send you a link to reset your password.
                </p>
                <Input
                  label="Email Address"
                  labelPlacement="inside"
                  variant="flat"
                  color="default"
                  size="lg"
                  radius="lg"
                  type="email"
                  classNames={inputClassNames}
                  value={email}
                  onValueChange={setEmail}
                  aria-label="Email Address"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendResetEmail();
                  }}
                />

                {resetMessage && (
                  <p className="text-sm text-surface-light">{resetMessage}</p>
                )}

                <p className="mt-1 text-sm text-surface-light">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetMessage(null);
                    }}
                    className="text-status-blue hover:underline"
                  >
                    Back to login
                  </button>
                </p>
              </ModalBody>
            ) : (
              <ModalBody>
                <Input
                  label="Email Address"
                  description={mode === 'login' ? 'Or the role username you were given' : undefined}
                  labelPlacement="inside"
                  variant="flat"
                  color="default"
                  size="lg"
                  radius="lg"
                  type={mode === 'login' ? 'text' : 'email'}
                  autoComplete={mode === 'login' ? 'username' : 'email'}
                  autoCapitalize="none"
                  classNames={inputClassNames}
                  value={email}
                  onValueChange={setEmail}
                  aria-label="Email Address"
                />

                <Input
                  label="Password"
                  labelPlacement="inside"
                  variant="flat"
                  color="default"
                  size="lg"
                  radius="lg"
                  type="password"
                  classNames={inputClassNames}
                  value={password}
                  onValueChange={setPassword}
                  aria-label="Password"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && mode === 'login') handleSubmit();
                  }}
                />

                {mode === 'signup' && (
                  <Input
                    label="Confirm Password"
                    labelPlacement="inside"
                    variant="flat"
                    color="default"
                    size="lg"
                    radius="lg"
                    type="password"
                    classNames={inputClassNames}
                    value={confirmPassword}
                    onValueChange={setConfirmPassword}
                    aria-label="Confirm Password"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSubmit();
                    }}
                  />
                )}

                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="self-start text-sm text-status-blue hover:underline"
                  >
                    Forgot password?
                  </button>
                )}

                {error && (
                  <p className="text-sm text-status-red">{error}</p>
                )}

                <p className="mt-1 text-sm text-surface-light">
                  {mode === 'login' ? (
                    <>
                      Don&apos;t have an account?{' '}
                      <button
                        type="button"
                        onClick={() => setMode('signup')}
                        className="text-status-blue hover:underline"
                      >
                        Sign Up
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => setMode('login')}
                        className="text-status-blue hover:underline"
                      >
                        Log in
                      </button>
                    </>
                  )}
                </p>
              </ModalBody>
            )}

            <ModalFooter className="flex justify-end gap-2">
              <Button
                onPress={() => {
                  close();
                  onClose();
                }}
                className="px-4 py-2 hover:bg-status-red/10 border border-status-red text-status-red"
                variant="bordered"
                radius="lg"
              >
                Cancel
              </Button>
              {showForgotPassword ? (
                <Button
                  onPress={handleSendResetEmail}
                  radius="lg"
                  className="px-4 py-2 bg-accent hover:bg-accent/90 text-surface-light"
                  isDisabled={!email || resetSubmitting}
                  isLoading={resetSubmitting}
                >
                  Send Reset Link
                </Button>
              ) : (
              <Button
                onPress={handleSubmit}
                radius="lg"
                className="px-4 py-2 bg-accent hover:bg-accent/90 text-surface-light"
                isDisabled={isSubmitDisabled}
                isLoading={submitting}
              >
                {mode === 'login' ? 'Login' : 'Sign Up'}
              </Button>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
