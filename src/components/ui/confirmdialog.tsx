'use client';
/**
 * An in-app "Are you sure?" for destructive actions, in place of window.confirm: the confirm button shows a
 * spinner while the action runs, and a failure shows in the dialog instead of an alert.
 *
 *   const { confirm, dialog } = useConfirmDialog();
 *   confirm({ title: 'Delete event?', message: '…', confirmLabel: 'Delete', onConfirm: () => deleteIt() });
 *   return <>{…}{dialog}</>;
 */
import { useState, type ReactNode } from 'react';
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';

export interface ConfirmRequest {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  /** Runs when confirmed; the dialog closes once it resolves, and shows the error if it throws. */
  onConfirm: () => Promise<void>;
}

export function useConfirmDialog(): { confirm: (request: ConfirmRequest) => void; dialog: ReactNode } {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setRequest(null);
    setError(null);
  };

  const run = async () => {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      await request.onConfirm();
      setRequest(null);
    } catch (err) {
      console.error(`${request.title} failed:`, err);
      setError('That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const dialog = (
    <Modal isOpen={!!request} onClose={close} isDismissable={!busy} hideCloseButton size="sm" className="bg-surface-deep text-surface-light">
      <ModalContent data-testid="confirm-dialog">
        <ModalHeader className="text-surface">{request?.title}</ModalHeader>
        <ModalBody>
          <div className="text-sm text-surface-light">{request?.message}</div>
          {error && (
            <p className="text-sm text-status-red" role="alert">
              {error}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={close} isDisabled={busy} data-testid="confirm-dialog-cancel">
            Cancel
          </Button>
          <Button className="bg-status-red text-surface-light" onPress={run} isLoading={busy} data-testid="confirm-dialog-confirm">
            {request?.confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );

  return { confirm: setRequest, dialog };
}
