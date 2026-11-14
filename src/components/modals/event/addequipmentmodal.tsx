// components/modals/AddEquipmentModal.tsx
"use client";

import * as React from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Autocomplete, AutocompleteItem, Tooltip,
} from "@heroui/react";
import { CircleHelp } from "lucide-react";
import { useDispatchTerms } from "@/lib/dispatchVocabulary/context";
import { staticSelectorButtonProps } from "@/lib/heroStatic";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Creates a temporary, event-only equipment item. */
  onSubmit: (name: string, location: string) => void | Promise<void>;
  /** The venue's named posts/locations, offered as autocomplete suggestions for the starting location. */
  locations?: string[];
};

/**
 * Adds a piece of equipment that exists only for this event — not part of
 * the venue's predefined catalog (e.g. gear borrowed just for today).
 */
export default function AddEquipmentModal({ isOpen, onClose, onSubmit, locations = [] }: Props) {
  const { t } = useDispatchTerms();
  const [name, setName] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setName("");
      setLocation("");
    }
  }, [isOpen]);

  const locationOptions = React.useMemo(
    () => Array.from(new Set(['Staging', 'Clinic', ...locations].filter(Boolean))),
    [locations]
  );

  const inputClassNames = {
    label: "text-surface-light mb-1",
    inputWrapper: "rounded-large px-4 hover:bg-surface-deep",
    input: "text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none",
  } as const;

  const canSubmit = name.trim().length > 0;

  const handleSubmit = async () => {
    if (submitting || !canSubmit) return;
    try {
      setSubmitting(true);
      await Promise.resolve(onSubmit(name.trim(), location.trim()));
      onClose();
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
              {t("Add Equipment")}
            </ModalHeader>

            <ModalBody className="space-y-3">
              <Input
                label={
                  <span className="inline-flex items-center gap-1">
                    {t("Equipment Name")}
                    <Tooltip content="Added for this event only, not the venue's saved equipment catalog." placement="top">
                      <CircleHelp className="w-3.5 h-3.5 text-surface-faint" />
                    </Tooltip>
                  </span>
                }
                labelPlacement="inside"
                variant="flat"
                size="lg"
                radius="lg"
                classNames={inputClassNames}
                value={name}
                onValueChange={setName}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                aria-label="Equipment Name"
                isRequired
                autoFocus
              />

              <Autocomplete
                label={t("Starting Location (optional)")}
                labelPlacement="inside"
                variant="flat"
                size="lg"
                radius="lg"
                inputProps={{ classNames: inputClassNames }}
                selectorButtonProps={staticSelectorButtonProps}
                inputValue={location}
                onInputChange={setLocation}
                onSelectionChange={(key) => { if (key) setLocation(key as string); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                allowsCustomValue
                placeholder="Staging"
                aria-label="Starting Location"
              >
                {locationOptions.map((loc) => (
                  <AutocompleteItem key={loc}>{t(loc)}</AutocompleteItem>
                ))}
              </Autocomplete>
            </ModalBody>

            <ModalFooter className="flex justify-end gap-2">
              <Button
                onPress={() => { close(); onClose(); }}
                className="px-4 py-2 hover:bg-status-red/10 border border-status-red text-status-red"
                variant="bordered"
                radius="lg"
              >
                {t("Cancel")}
              </Button>
              <Button
                onPress={handleSubmit}
                radius="lg"
                className="px-4 py-2 bg-accent hover:bg-accent/90 text-surface-light"
                isDisabled={submitting || !canSubmit}
              >
                {t("Add Equipment")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
