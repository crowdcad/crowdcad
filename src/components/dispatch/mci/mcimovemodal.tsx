'use client';

import React, { useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Select, SelectItem } from '@heroui/react';
import { MCI_COLORS, sumCounts, type MciAreaStats, type MciCounts, type MciZoneStats } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { MCI_COLOR_STYLES, MciColorDot } from './mciparts';

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

  // The move cannot exceed what is in the zone.
  const set = (color: (typeof MCI_COLORS)[number], raw: string) => {
    const n = Number.parseInt(raw, 10);
    const value = Number.isFinite(n) ? Math.max(0, Math.min(n, zone.inZone[color])) : 0;
    setCounts((prev) => ({ ...prev, [color]: value }));
  };

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

        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-2 text-sm">
          <span className="text-xs text-surface-faint" />
          <span className="text-xs text-surface-faint">In zone</span>
          <span className="text-xs text-surface-faint">Move</span>
          {MCI_COLORS.map((color) => (
            <React.Fragment key={color}>
              <span className="inline-flex items-center gap-1.5 text-surface-light">
                <MciColorDot color={color} />
                {MCI_COLOR_STYLES[color].label}
              </span>
              <span className="text-center tabular-nums text-surface-light">{zone.inZone[color]}</span>
              <input
                type="number"
                min={0}
                max={zone.inZone[color]}
                inputMode="numeric"
                aria-label={`Move ${MCI_COLOR_STYLES[color].label.toLowerCase()}`}
                value={counts[color]}
                onChange={(e) => set(color, e.target.value)}
                className="h-8 w-16 rounded-md border border-surface-liner bg-surface-deep text-center tabular-nums text-surface-light outline-none focus:outline-none focus:ring-0 focus-visible:ring-0"
                data-testid={`mci-move-${color}`}
              />
            </React.Fragment>
          ))}
        </div>
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button onPress={onClose} variant="bordered" radius="lg" className="border-status-red px-4 py-2 text-status-red hover:bg-status-red/10">
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
    <Modal
      isOpen={!!zone}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="top-center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      classNames={{ base: 'mt-20 rounded-lg bg-surface-deepest text-surface-light', header: 'pb-0', footer: 'pt-0' }}
    >
      <ModalContent data-testid="mci-move-modal">
        {() => (zone ? <MoveForm key={zone.zone.id} zone={zone} areas={areas} onClose={onClose} onMove={onMove} /> : null)}
      </ModalContent>
    </Modal>
  );
}
