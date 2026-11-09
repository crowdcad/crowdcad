'use client';

import React, { useState } from 'react';
import { ModalHeader, ModalBody, ModalFooter, Button, Select, SelectItem } from '@heroui/react';
import { sumCounts, type MciAreaStats, type MciCounts, type MciZoneStats } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { MCI_CANCEL_BUTTON, MciCountInputs, MciModal } from './mciparts';

type Props = {
  /** The zone patients are moved out of; null keeps the dialog closed. */
  zone: MciZoneStats | null;
  areas: MciAreaStats[];
  onClose: () => void;
  onMove: (zoneId: string, areaId: string, counts: MciCounts) => void | Promise<void>;
};

// Remounted by `key` for each zone, so the numbers start at what is in the zone.
function MoveForm({ zone, areas, onClose, onMove }: Omit<Props, 'zone'> & { zone: MciZoneStats }) {
  const { t } = useDispatchTerms();
  const [areaId, setAreaId] = useState<string>(areas[0]?.area.id ?? '');
  const [counts, setCounts] = useState<MciCounts>({ ...zone.inZone });
  const [submitting, setSubmitting] = useState(false);

  const total = sumCounts(counts);
  const submit = async () => {
    if (submitting || !areaId || total <= 0) return;
    setSubmitting(true);
    try {
      await onMove(zone.zone.id, areaId, counts);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ModalHeader className="text-xl font-bold text-surface">
        {t('Move to treatment')}: {zone.zone.name}
      </ModalHeader>
      <ModalBody className="gap-4 py-4">
        <Select
          label={t('Treatment location')}
          selectedKeys={areaId ? new Set([areaId]) : new Set()}
          onSelectionChange={(keys) => setAreaId(Array.from(keys as Set<string>)[0] ?? '')}
          disallowEmptySelection
          radius="lg"
          data-testid="mci-move-area"
        >
          {areas.map((a) => (
            <SelectItem key={a.area.id}>{a.name}</SelectItem>
          ))}
        </Select>
        {areas.length === 0 && <p className="text-sm text-status-red">Add a treatment location first.</p>}

        {/* The move cannot exceed what is in the zone. */}
        <MciCountInputs available={zone.inZone} availableLabel="In zone" verb="Move" counts={counts} onChange={setCounts} testIdPrefix="mci-move" />
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button onPress={onClose} variant="flat" radius="lg" className={MCI_CANCEL_BUTTON}>
          {t('Cancel')}
        </Button>
        <Button
          radius="lg"
          className="bg-accent px-4 py-2 text-surface-light"
          isDisabled={submitting || !areaId || total <= 0}
          onPress={submit}
          data-testid="mci-move-confirm"
        >
          {t('Move to treatment')} ({total})
        </Button>
      </ModalFooter>
    </>
  );
}

export default function MciMoveModal({ zone, areas, onClose, onMove }: Props) {
  return (
    <MciModal isOpen={!!zone} onClose={onClose} testId="mci-move-modal">
      {() => (zone ? <MoveForm key={zone.zone.id} zone={zone} areas={areas} onClose={onClose} onMove={onMove} /> : null)}
    </MciModal>
  );
}
