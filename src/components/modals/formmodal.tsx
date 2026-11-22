'use client';
/**
 * A short form in a modal (enter a transport unit, add a clinic walk-up, ...): the title, the fields, and
 * Cancel / Submit. Submit is disabled while `onSubmit` runs, so a double press saves once.
 */
import React from 'react';
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';

export default function FormModal({
  isOpen,
  onClose,
  title,
  onSubmit,
  formTestId,
  bodyTestId,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  onSubmit: () => void | Promise<void>;
  formTestId?: string;
  bodyTestId?: string;
  children: React.ReactNode;
}) {
  const { t } = useDispatchTerms();
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="top-center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      classNames={{
        base: 'rounded-lg bg-surface-deepest text-surface-light mt-20',
        header: 'pb-0',
        body: 'py-4',
        footer: 'pt-0',
      }}
    >
      <ModalContent>
        {(close) => (
          <form onSubmit={handleSubmit} data-testid={formTestId}>
            <ModalHeader className="text-2xl font-bold text-surface">{title}</ModalHeader>
            <ModalBody data-testid={bodyTestId}>{children}</ModalBody>
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
                {t('Cancel')}
              </Button>
              <Button type="submit" radius="lg" className="px-4 py-2 bg-accent hover:bg-accent/90 text-surface-light" isDisabled={submitting}>
                {t('Submit')}
              </Button>
            </ModalFooter>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
}
