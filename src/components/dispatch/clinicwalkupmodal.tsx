// components/modals/ClinicWalkupModal.tsx
"use client";
import { MODAL_FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';
import FormModal from '@/components/modals/formmodal';

import * as React from "react";
import {
  Input,
} from "@heroui/react";

import { Event, Call } from "@/app/types";
import { useDispatchTerms } from "@/lib/dispatchVocabulary/context";
import { hhmmOf } from "@/lib/clock";

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
  async function submit() {
    const now = new Date();
    const stamp = hhmmOf(now);

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
          message: `${stamp} - Clinic walkup call created${
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
  }

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Add Clinic Walkup')}
      onSubmit={submit}
      formTestId="clinic-walkup-modal"
    >
      <Input
        autoFocus
        label={t('Age/Sex')}
        labelPlacement="inside"
        variant="flat"
        color="default"
        size="lg"
        radius="lg"
        classNames={MODAL_FIELD_CLASSNAMES}
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
        classNames={MODAL_FIELD_CLASSNAMES}
        value={clinicCall.chiefComplaint}
        onValueChange={(v) =>
          setClinicCall((prev) => ({ ...prev, chiefComplaint: v }))
        }
        aria-label="Chief Complaint"
      />
    </FormModal>
  );
}
