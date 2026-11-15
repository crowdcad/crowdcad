// components/modals/event/transportunitmodal.tsx
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

import { useDispatchTerms } from "@/lib/dispatchVocabulary/context";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  value: string;
  onValueChange: (value: string) => void;
};

export default function TransportUnitModal({
  isOpen,
  onClose,
  onSubmit,
  value,
  onValueChange,
}: Props) {
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

  const inputClassNames = {
    label: "text-surface-light mb-1",
    inputWrapper: ["rounded-2xl px-4", "hover:bg-surface-deep"].join(" "),
    input:
      "text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none",
  } as const;

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
        base: "rounded-lg bg-surface-deepest text-surface-light mt-20",
        header: "pb-0",
        body: "py-4",
        footer: "pt-0",
      }}
    >
      <ModalContent>
        {(close) => (
          <form onSubmit={handleSubmit}>
            <ModalHeader className="text-2xl font-bold text-surface">
              {t('Enter Transport Unit')}
            </ModalHeader>

            <ModalBody data-testid="transport-unit-modal">
              <Input
                autoFocus
                label={t('Transport Unit #')}
                labelPlacement="inside"
                placeholder={t('Transport Unit #')}
                variant="flat"
                color="default"
                size="lg"
                radius="lg"
                classNames={inputClassNames}
                value={value}
                onValueChange={onValueChange}
                aria-label="Transport Unit #"
                data-testid="transport-unit-input"
              />
            </ModalBody>

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
              <Button
                type="submit"
                radius="lg"
                className="px-4 py-2 bg-accent hover:bg-accent/90 text-surface-light"
                isDisabled={submitting}
              >
                {t('Submit')}
              </Button>
            </ModalFooter>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
}
