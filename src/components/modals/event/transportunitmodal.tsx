// components/modals/event/transportunitmodal.tsx
"use client";
import { MODAL_FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';
import FormModal from '@/components/modals/formmodal';

import * as React from "react";
import {
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
  const submit = onSubmit;

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Enter Transport Unit')}
      onSubmit={submit}
      bodyTestId="transport-unit-modal"
    >
      <Input
        autoFocus
        label={t('Transport Unit #')}
        labelPlacement="inside"
        placeholder={t('Transport Unit #')}
        variant="flat"
        color="default"
        size="lg"
        radius="lg"
        classNames={MODAL_FIELD_CLASSNAMES}
        value={value}
        onValueChange={onValueChange}
        aria-label="Transport Unit #"
        data-testid="transport-unit-input"
      />
    </FormModal>
  );
}
