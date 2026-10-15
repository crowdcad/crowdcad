'use client';

import { useRouter } from 'next/navigation';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from '@heroui/react';
import { STATIC_CLOSE_BUTTON_CLASS } from '@/lib/heroStatic';

export interface EventSummaryModalProps {
  open: boolean;
  onClose: () => void;

  onExportCsv: () => void;

  eventId?: string;
}

export default function EventSummaryModal({
  open,
  onClose,
  onExportCsv,
  eventId,
}: EventSummaryModalProps) {
  const router = useRouter();

  const getEventIdFromURL = (): string | undefined => {
    if (typeof window === 'undefined') return undefined;
    const m = window.location.pathname.match(/\/events\/([^/]+)/);
    return m?.[1];
  };

  const handleViewSummary = () => {
    const id = eventId || getEventIdFromURL();
    if (id) {
      router.push(`/events/${id}/summary`);
    }
    onClose();
  };

  return (
    <Modal
      isOpen={open}
      onOpenChange={(open) => { if (!open) onClose(); }}
      placement="center"
      backdrop="opaque"
      radius="lg"
      classNames={{
        base: 'rounded-lg bg-surface-deepest text-surface-light max-w-lg w-full',
        header: 'pb-0',
        body: 'py-4',
        footer: 'pt-0',
        closeButton: STATIC_CLOSE_BUTTON_CLASS,
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          Event Summary
        </ModalHeader>
        <ModalBody>
          <p className="text-surface-light/90 text-sm">
            View or export a summary of all dispatch activity associated with this
            event. Viewing the summary does not end the event. You can return to the
            event at any time through the venue selection page.
          </p>
        </ModalBody>
        <ModalFooter className="flex items-center justify-end gap-2">
          <Button
            onPress={onClose}
            className="px-4 py-2 hover:bg-status-red/10 border border-status-red text-status-red"
            variant="bordered"
            radius="lg"
          >
            Cancel
          </Button>
          <Button
            onPress={() => {
              onExportCsv();
              onClose();
            }}
            variant="flat"
            radius="lg"
            className="px-4 py-2 hover:bg-surface-liner text-surface-light"
          >
            Export CSV
          </Button>
          <Button
            onPress={handleViewSummary}
            radius="lg"
            className="px-4 py-2 bg-accent hover:bg-accent/90 text-surface-light"
          >
            View Full Summary
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
