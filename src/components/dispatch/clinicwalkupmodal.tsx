// components/modals/ClinicWalkupModal.tsx
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

import { Event, Call } from "@/app/types";
import { useDispatchTerms } from "@/lib/dispatchVocabulary/context";

type ClinicCallState = {
  age: string;
  gender: string;
  chiefComplaint: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  event?: Event | null;
  updateEvent: (data: Partial<Event>) => Promise<void>;

  clinicCall: ClinicCallState;
  setClinicCall: React.Dispatch<React.SetStateAction<ClinicCallState>>;

  formatAgeSex: (age?: string, gender?: string) => string;
  parseAgeSex: (raw: string) => { age: string; gender: string };
  clinicId?: string;
};

export default function ClinicWalkupModal({
  isOpen,
  onClose,
  event,
  updateEvent,
  clinicCall,
  setClinicCall,
  formatAgeSex,
  parseAgeSex,
  clinicId,
}: Props) {
  const { t } = useDispatchTerms();
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      const now = new Date();
      const hhmm =
        now.getHours().toString().padStart(2, "0") +
        now.getMinutes().toString().padStart(2, "0");

      const nextOrder =
        event?.calls?.length
          ? Math.max(
              ...event.calls.map((c) => (typeof c.order === "number" ? c.order : 0))
            ) + 1
          : 1;

      const cleanCall: Call = {
        id: Date.now().toString(),
        order: nextOrder,
        status: "Delivered", // clinic walkups are delivered to clinic immediately
        location: "Clinic",
        assignedTeam: [],
        chiefComplaint: clinicCall.chiefComplaint?.trim() || "Walkup",
        source: "Walkup",
        ...(clinicCall.age?.trim() && { age: clinicCall.age.trim() }),
        ...(clinicCall.gender?.trim() && { gender: clinicCall.gender.trim() }),
        clinic: true,
        ...(clinicId && { clinicId }),
        priority: false,
        log: [
          {
            timestamp: now.getTime(),
            message: `${hhmm} - Clinic walkup call created${
              clinicCall.chiefComplaint ? `, complaint: ${clinicCall.chiefComplaint}` : ""
            }, age/sex: ${formatAgeSex(clinicCall.age, clinicCall.gender) || "N/A"}`,
          },
        ],
      };

      await updateEvent({
        calls: [...(event?.calls || []), cleanCall],
      });

      setClinicCall({ age: "", gender: "", chiefComplaint: "" });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  // Match QuickCallModal input styling exactly
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
          <form onSubmit={handleSubmit} data-testid="clinic-walkup-modal">
            <ModalHeader className="text-2xl font-bold text-surface">
              {t('Add Clinic Walkup')}
            </ModalHeader>

            <ModalBody>
              <Input
                autoFocus
                label={t('Age/Sex')}
                labelPlacement="inside"
                variant="flat"
                color="default"
                size="lg"
                radius="lg"
                classNames={inputClassNames}
                value={formatAgeSex(clinicCall.age, clinicCall.gender)}
                onValueChange={(v) => {
                  const { age, gender } = parseAgeSex(v);
                  setClinicCall((prev) => ({ ...prev, age, gender }));
                }}
                aria-label="Age/Sex"
              />

              <Input
                label={t('Chief Complaint')}
                labelPlacement="inside"
                variant="flat"
                color="default"
                size="lg"
                radius="lg"
                classNames={inputClassNames}
                value={clinicCall.chiefComplaint}
                onValueChange={(v) =>
                  setClinicCall((prev) => ({ ...prev, chiefComplaint: v }))
                }
                aria-label="Chief Complaint"
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
