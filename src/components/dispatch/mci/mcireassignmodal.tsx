'use client';

import React, { useState } from 'react';
import { ModalHeader, ModalBody, ModalFooter, Button, Input, Select, SelectItem } from '@heroui/react';
import type { MciColor } from '@/app/types';
import { MCI_COLORS, mciAreaAccepts, mciPatientLabel, type MciPatient } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { MCI_CANCEL_BUTTON, MCI_COLOR_STYLES, MCI_INPUT_CLASSNAMES, MciColorDot, MciModal, type MciAreaOption } from './mciparts';
import type { MciReassignTarget } from './mcipatientbox';

export type MciReassignRequest = { patient: MciPatient; target: MciReassignTarget };

type Props = {
  /** The patient and where the drop or menu wants them; null keeps the dialog closed. */
  request: MciReassignRequest | null;
  areas: MciAreaOption[];
  onClose: () => void;
  onConfirm: (patientId: string, target: { areaId: string; color: MciColor }, note: string) => boolean | Promise<boolean>;
};

// Remounted by `key` for each request, so the picks start at the drop target.
function ReassignForm({ request, areas, onClose, onConfirm }: Omit<Props, 'request'> & { request: MciReassignRequest }) {
  const { t } = useDispatchTerms();
  const { patient } = request;
  // Tarps take only their own color: dropped on a tarp of another color means retriage to it; a new color
  // whose patient is in a tarp of another color moves them to that color's tarp.
  const tarpOf = (c: MciColor) => areas.find((a) => a.color === c);
  const startArea = areas.find((a) => a.id === (request.target.areaId ?? patient.areaId));
  const startColor = request.target.color ?? (request.target.areaId && startArea?.color ? startArea.color : patient.color);
  const [color, setColorRaw] = useState<MciColor>(startColor);
  const [areaId, setAreaId] = useState(() => (startArea && !mciAreaAccepts(startArea, startColor) ? tarpOf(startColor)?.id ?? patient.areaId : startArea?.id ?? patient.areaId));
  const setColor = (c: MciColor) => {
    setColorRaw(c);
    const here = areas.find((a) => a.id === areaId);
    if (here && !mciAreaAccepts(here, c)) setAreaId(tarpOf(c)?.id ?? patient.areaId);
  };
  const choices = areas.filter((a) => a.id === patient.areaId || mciAreaAccepts(a, color));
  const fits = (() => {
    const at = areas.find((a) => a.id === areaId);
    return areaId === patient.areaId || (!!at && mciAreaAccepts(at, color));
  })();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const moving = areaId !== patient.areaId;
  const retriaging = color !== patient.color;
  const action = moving && retriaging ? 'Move and retriage' : moving ? 'Move' : 'Retriage';
  const label = mciPatientLabel(patient.details);
  const fromArea = areas.find((a) => a.id === patient.areaId)?.name ?? '';

  const submit = async () => {
    if (submitting || (!moving && !retriaging) || !fits) return;
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
            {choices.map((a) => (
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
          classNames={MCI_INPUT_CLASSNAMES}
          data-testid="mci-reassign-note"
        />
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button onPress={onClose} variant="flat" radius="lg" className={MCI_CANCEL_BUTTON}>
          {t('Cancel')}
        </Button>
        <Button
          radius="lg"
          className="bg-accent px-4 py-2 text-surface-light"
          isDisabled={submitting || (!moving && !retriaging) || !fits}
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
    <MciModal isOpen={!!request} onClose={onClose} testId="mci-reassign-modal">
      {() =>
        request ? (
          <ReassignForm key={`${request.patient.id}:${request.target.areaId ?? ''}:${request.target.color ?? ''}`} request={request} areas={areas} onClose={onClose} onConfirm={onConfirm} />
        ) : null
      }
    </MciModal>
  );
}
