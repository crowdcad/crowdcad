"use client";

import * as React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "@heroui/react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

const CONFIRM_PHRASE = "End Event";

export default function EndEventModal({ isOpen, onClose, onConfirm }: Props) {
  const [value, setValue] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) setValue("");
  }, [isOpen]);

  // Any capitalization: case is hard to see in the condensed UI's font.
  const canSubmit = value.trim().toLowerCase() === CONFIRM_PHRASE.toLowerCase();

  const inputClassNames = {
    label: "text-surface-light mb-1",
    inputWrapper: "rounded-large px-4 hover:bg-surface-deep",
    input: "text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none",
  } as const;

  const handleConfirm = async () => {
    if (!canSubmit || submitting) return;
    try {
      setSubmitting(true);
      await Promise.resolve(onConfirm());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      placement="top-center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      classNames={{
        base: "rounded-lg bg-surface-deepest text-surface-light mt-20",
        header: "pb-0",
        body: "py-4",
        footer: "pt-0",
      }}
    >
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader className="text-2xl font-bold text-surface">
              End Event
            </ModalHeader>

            <ModalBody className="space-y-3">
              <p className="text-sm text-surface-light">
                Data collection and dispatch logs will stop immediately. No further calls, status changes,
                or activity can be logged after this, and it cannot be undone.
              </p>
              <Input
                autoFocus
                label={`Type "${CONFIRM_PHRASE}" to confirm`}
                labelPlacement="outside"
                variant="flat"
                size="lg"
                radius="lg"
                classNames={{ ...inputClassNames, base: "pt-2" }}
                value={value}
                onValueChange={setValue}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
              />
            </ModalBody>

            <ModalFooter className="flex justify-end gap-2">
              <Button
                onPress={() => { close(); onClose(); }}
                className="px-4 py-2 hover:bg-surface-deep border border-surface-liner text-surface-light"
                variant="bordered"
                radius="lg"
              >
                Cancel
              </Button>
              <Button
                onPress={handleConfirm}
                isDisabled={!canSubmit || submitting}
                isLoading={submitting}
                radius="lg"
                className="px-4 py-2 bg-status-red hover:bg-status-red/90 text-surface-light"
              >
                End Event
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
