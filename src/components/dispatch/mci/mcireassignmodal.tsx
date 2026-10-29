'use client';

import React, { useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Select, SelectItem } from '@heroui/react';
import type { MciColor } from '@/app/types';
import { MCI_COLORS, mciPatientLabel, type MciPatient } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { MCI_COLOR_STYLES, MciColorDot } from './mciparts';
import type { MciReassignTarget } from './mcipatientbox';

export type MciReassignRequest = { patient: MciPatient; target: MciReassignTarget };

type Props = {
  /** The patient and where the drop or menu wants them; null keeps the dialog closed. */
  request: MciReassignRequest | null;
  areas: { id: string; name: string }[];
  onClose: () => void;
  onConfirm: (patientId: string, target: { areaId: string; color: MciColor }, note: string) => boolean | Promise<boolean>;
};

const inputClassNames = {
  inputWrapper: 'rounded-xl px-3 group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0',
  input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
} as const;

// Remounted by `key` for each request, so the picks start at the drop target.
function ReassignForm({ request, areas, onClose, onConfirm }: Omit<Props, 'request'> & { request: MciReassignRequest }) {
  const { t } = useDispatchTerms();
  const { patient } = request;
  const [areaId, setAreaId] = useState(request.target.areaId ?? patient.areaId);
  const [color, setColor] = useState<MciColor>(request.target.color ?? patient.color);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const moving = areaId !== patient.areaId;
  const retriaging = color !== patient.color;
  const action = moving && retriaging ? 'Move and retriage' : moving ? 'Move' : 'Retriage';
  const label = mciPatientLabel(patient.details);
  const fromArea = areas.find((a) => a.id === patient.areaId)?.name ?? '';

  const submit = async () => {
    if (submitting || (!moving && !retriaging)) return;
    setSubmitting(true);
    try {
      if (await onConfirm(patient.id, { areaId, color }, note)) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ModalHeader className="flex flex-col gap-1 text-xl font-bold text-surface">
        {action} patient
        <span className="flex items-center gap-1.5 text-sm font-normal text-surface-faint">
          <MciColorDot color={patient.color} />
          {label || 'No details yet'} at {fromArea}
        </span>
      </ModalHeader>
      <ModalBody className="gap-3 py-4">
        <div className="grid grid-cols-2 gap-2">
          <Select
            label={t('Treatment location')}
            size="sm"
            radius="lg"
            selectedKeys={new Set([areaId])}
            onSelectionChange={(keys) => setAreaId(Array.from(keys as Set<string>)[0] ?? patient.areaId)}
            disallowEmptySelection
            data-testid="mci-reassign-area"
          >
            {areas.map((a) => (
              <SelectItem key={a.id}>{a.name}</SelectItem>
            ))}
          </Select>
          <Select
            label="Tag color"
            size="sm"
            radius="lg"
            selectedKeys={new Set([color])}
            onSelectionChange={(keys) => setColor((Array.from(keys as Set<string>)[0] as MciColor) ?? patient.color)}
            disallowEmptySelection
            data-testid="mci-reassign-color"
          >
            {MCI_COLORS.map((c) => (
              <SelectItem key={c} textValue={MCI_COLOR_STYLES[c].label} startContent={<MciColorDot color={c} />}>
                {MCI_COLOR_STYLES[c].label}
              </SelectItem>
            ))}
          </Select>
        </div>
        <Input
          autoFocus
          label="Note (optional)"
          size="sm"
          radius="lg"
          maxLength={120}
          value={note}
          onValueChange={setNote}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
          classNames={inputClassNames}
          data-testid="mci-reassign-note"
        />
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button onPress={onClose} variant="flat" radius="lg" className="bg-status-red/20 px-4 py-2 text-status-red hover:bg-status-red/30">
          {t('Cancel')}
        </Button>
        <Button
          radius="lg"
          className="bg-accent px-4 py-2 text-surface-light"
          isDisabled={submitting || (!moving && !retriaging)}
          onPress={submit}
          data-testid="mci-reassign-confirm"
        >
          {action}
        </Button>
      </ModalFooter>
    </>
  );
}

export default function MciReassignModal({ request, areas, onClose, onConfirm }: Props) {
  return (
    <Modal
      isOpen={!!request}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="top-center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      classNames={{ base: 'mt-20 rounded-lg bg-surface-deepest text-surface-light', header: 'pb-0', footer: 'pt-0', body: 'minimal-scrollbar' }}
    >
      <ModalContent data-testid="mci-reassign-modal">
        {() =>
          request ? (
            <ReassignForm key={`${request.patient.id}:${request.target.areaId ?? ''}:${request.target.color ?? ''}`} request={request} areas={areas} onClose={onClose} onConfirm={onConfirm} />
          ) : null
        }
      </ModalContent>
    </Modal>
  );
}
