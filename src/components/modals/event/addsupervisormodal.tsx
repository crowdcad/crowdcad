// components/modals/AddSupervisorModal.tsx
"use client";

import * as React from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Select, SelectItem, Tooltip,
} from "@heroui/react";
import { CircleHelp } from "lucide-react";
import { Role } from "@/app/types";
import { useDispatchTerms } from "@/lib/dispatchVocabulary/context";

type Props = {
  isOpen: boolean;
  onClose: () => void;

  // unify create/edit just like AddTeamModal
  mode?: "create" | "edit";
  onSubmit: () => void;
  titleOverride?: string;
  submitLabelOverride?: string;

  // existing bindings
  teamName: string;
  setTeamName: (v: string) => void;

  memberName: string;
  setMemberName: (v: string) => void;

  memberCert: string;
  setMemberCert: (v: string) => void;

  roles: Role[];
};

export default function AddSupervisorModal({
  isOpen,
  onClose,
  mode = "create",
  onSubmit,
  titleOverride,
  submitLabelOverride,
  teamName,
  setTeamName,
  memberName,
  setMemberName,
  memberCert,
  setMemberCert,
  roles,
}: Props) {
  const { t } = useDispatchTerms();
  const [submitting, setSubmitting] = React.useState(false);

  const inputClassNames = {
    label: "text-surface-light mb-1",
    inputWrapper: "rounded-large px-4 hover:bg-surface-deep",
    input: "text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none",
  } as const;

  const selectClassNames = {
    label: "text-surface-light mb-1",
    trigger: "rounded-large px-4 hover:bg-surface-deep data-[focus=true]:outline-none",
    value: "text-surface-light",
    popover: "bg-surface-deepest border border-surface-liner rounded-large",
    listbox: "p-1 [&_[data-hover=true]]:bg-surface-deep [&_[data-selected=true]]:bg-surface-deep",
  } as const;

  const title = titleOverride ?? (mode === "edit" ? t("Edit Supervisor") : t("Add New Supervisor"));
  const submitLabel = submitLabelOverride ?? (mode === "edit" ? t("Save Changes") : t("Create Supervisor"));

  const canSubmit = teamName.trim().length > 0;

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
              {title}
            </ModalHeader>

            <ModalBody className="space-y-3">
              <Input
                label={
                  <span className="inline-flex items-center gap-1">
                    {t("Supervisor Call Sign")}
                    <Tooltip content="The radio call sign this supervisor unit will be identified by on the dispatch board, not a person's name." placement="top">
                      <CircleHelp className="w-3.5 h-3.5 text-surface-faint" />
                    </Tooltip>
                  </span>
                }
                labelPlacement="inside"
                variant="flat"
                size="lg"
                radius="lg"
                classNames={inputClassNames}
                value={teamName}
                onValueChange={setTeamName}
                aria-label="Supervisor Call Sign"
                isRequired
              />

              <Input
                label={t("Supervisor Name (optional)")}
                labelPlacement="inside"
                variant="flat"
                size="lg"
                radius="lg"
                classNames={inputClassNames}
                value={memberName}
                onValueChange={setMemberName}
                aria-label="Supervisor Name"
              />

              <Select
                label={t("Certification (optional)")}
                labelPlacement="inside"
                variant="flat"
                size="lg"
                radius="lg"
                classNames={selectClassNames}
                selectedKeys={memberCert ? new Set([memberCert]) : new Set()}
                onSelectionChange={(keys) => {
                  const val = Array.from(keys)[0] as string | undefined;
                  setMemberCert(val ?? "");
                }}
                aria-label="Certification"
              >
                {roles.map((role) => (
                  <SelectItem key={role.name} aria-label={role.fullName} textValue={role.fullName}>
                    {role.name}
                  </SelectItem>
                ))}
              </Select>
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
                onPress={async () => {
                  if (submitting || !canSubmit) return;
                  try {
                    setSubmitting(true);
                    await Promise.resolve(onSubmit());
                  } finally {
                    setSubmitting(false);
                  }
                }}
                radius="lg"
                className="px-4 py-2 bg-accent hover:bg-accent/90 text-surface-light"
                isDisabled={submitting || !canSubmit}
              >
                {submitLabel}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
