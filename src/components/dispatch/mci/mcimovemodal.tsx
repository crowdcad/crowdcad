'use client';

import React, { useState } from 'react';
import { ModalHeader, ModalBody, ModalFooter, Button, Select, SelectItem } from '@heroui/react';
import { emptyCounts, MCI_COLORS, mciAreaAccepts, sumCounts, type MciAreaStats, type MciCounts, type MciZoneStats } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { MCI_CANCEL_BUTTON, MciCountInputs, MciModal } from './mciparts';

type Props = {
  /** The zone patients are moved out of; null keeps the dialog closed. */
  zone: MciZoneStats | null;
  areas: MciAreaStats[];
  onClose: () => void;
  /** Without `areaId`, each color goes to its own tarp. */
  onMove: (zoneId: string, areaId: string | undefined, counts: MciCounts) => void | Promise<void>;
};

const MATCHING = '';

// Remounted by `key` for each zone, so the numbers start at what is in the zone.
function MoveForm({ zone, areas, onClose, onMove }: Omit<Props, 'zone'> & { zone: MciZoneStats }) {
  const { t } = useDispatchTerms();
  // With color tarps the default is "Matching color" (''): each color to its own tarp.
  const hasTarps = areas.some((a) => a.area.color);
  const [areaId, setAreaId] = useState<string>(hasTarps ? MATCHING : areas[0]?.area.id ?? '');
  const [counts, setCounts] = useState<MciCounts>({ ...zone.inZone });
  const [submitting, setSubmitting] = useState(false);

  // A tarp takes only its own color, so the other colors aren't offered.
  const picked = areas.find((a) => a.area.id === areaId);
  const colors = picked ? MCI_COLORS.filter((c) => mciAreaAccepts(picked.area, c)) : MCI_COLORS;
  const sending = colors.reduce((out, c) => ({ ...out, [c]: counts[c] }), emptyCounts());
  const total = sumCounts(sending);
  const ready = (areaId === MATCHING ? hasTarps : !!picked) && total > 0;
  const submit = async () => {
    if (submitting || !ready) return;
    setSubmitting(true);
    try {
      await onMove(zone.zone.id, areaId === MATCHING ? undefined : areaId, sending);
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
          selectedKeys={new Set([areaId])}
          onSelectionChange={(keys) => setAreaId(Array.from(keys as Set<string>)[0] ?? '')}
          disallowEmptySelection
          radius="lg"
          data-testid="mci-move-area"
        >
          {[...(hasTarps ? [{ key: MATCHING, name: 'Matching color (each to its own)' }] : []), ...areas.map((a) => ({ key: a.area.id, name: a.name }))].map((a) => (
            <SelectItem key={a.key}>{a.name}</SelectItem>
          ))}
        </Select>
        {areas.length === 0 && <p className="text-sm text-status-red">Add a treatment location first.</p>}

        {/* The move cannot exceed what is in the zone. */}
        <MciCountInputs colors={colors} available={zone.inZone} availableLabel="In zone" verb="Move" counts={counts} onChange={setCounts} testIdPrefix="mci-move" />
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button onPress={onClose} variant="flat" radius="lg" className={MCI_CANCEL_BUTTON}>
          {t('Cancel')}
        </Button>
        <Button
          radius="lg"
          className="bg-accent px-4 py-2 text-surface-light"
          isDisabled={submitting || !ready}
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
