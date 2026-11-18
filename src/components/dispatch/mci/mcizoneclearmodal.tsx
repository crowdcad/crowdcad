'use client';

import React, { useState } from 'react';
import { ModalHeader, ModalBody, ModalFooter, Button, Select, SelectItem } from '@heroui/react';
import type { MciAssignment } from '@/app/types';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { MCI_CANCEL_BUTTON, MciModal } from './mciparts';

/** What a unit is reassigned to after its zone is marked clear. */
export interface ZoneClearReassignment {
  unit: string;
  status: 'Triage' | 'Treatment' | 'Available';
  assignment?: MciAssignment;
}

type Choice = 'keep' | 'available' | `zone:${string}` | `area:${string}`;

type Props = {
  /** The zone just marked clear, with the units still assigned to it; null keeps the dialog closed. */
  cleared: { zoneName: string; units: string[] } | null;
  /** Zones still open (the cleared one left out). */
  zones: { id: string; name: string }[];
  areas: { id: string; name: string }[];
  onClose: () => void;
  onReassign: (changes: ZoneClearReassignment[]) => void | Promise<void>;
};

function ReassignForm({ cleared, zones, areas, onClose, onReassign }: Omit<Props, 'cleared'> & { cleared: { zoneName: string; units: string[] } }) {
  const { t } = useDispatchTerms();
  // The first treatment location is the usual next job for a triage team, so it is preselected.
  const first: Choice = areas[0] ? `area:${areas[0].id}` : 'keep';
  const [choices, setChoices] = useState<Record<string, Choice>>(() => Object.fromEntries(cleared.units.map((u) => [u, first])));
  const [saving, setSaving] = useState(false);

  const changes = cleared.units.flatMap((unit): ZoneClearReassignment[] => {
    const c = choices[unit] ?? 'keep';
    if (c === 'keep') return [];
    if (c === 'available') return [{ unit, status: 'Available' }];
    const [kind, id] = c.split(':') as ['zone' | 'area', string];
    return [{ unit, status: kind === 'zone' ? 'Triage' : 'Treatment', assignment: { kind, id } }];
  });

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onReassign(changes);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModalHeader className="text-xl font-bold text-surface">
        {cleared.zoneName} is clear: reassign {cleared.units.length === 1 ? 'its team' : 'its teams'}
      </ModalHeader>
      <ModalBody className="gap-3 py-4">
        <p className="text-sm text-surface-faint">Pick where each {t('team')} working {cleared.zoneName} goes next.</p>
        {cleared.units.map((unit) => (
          <div key={unit} className="grid grid-cols-[6rem_1fr] items-center gap-3" data-testid={`mci-clear-reassign-${unit}`}>
            <span className="truncate font-semibold">{unit}</span>
            <Select
              aria-label={`Next assignment for ${unit}`}
              size="sm"
              radius="lg"
              selectedKeys={new Set([choices[unit] ?? 'keep'])}
              disallowEmptySelection
              onSelectionChange={(keys) => setChoices((prev) => ({ ...prev, [unit]: Array.from(keys as Set<string>)[0] as Choice }))}
              data-testid={`mci-clear-reassign-${unit}-select`}
            >
              {[
                ...areas.map((a) => <SelectItem key={`area:${a.id}`}>{`${t('Treatment')}: ${a.name}`}</SelectItem>),
                ...zones.map((z) => <SelectItem key={`zone:${z.id}`}>{`${t('Triage')}: ${z.name}`}</SelectItem>),
                <SelectItem key="available">{t('Available')}</SelectItem>,
                <SelectItem key="keep">{`Leave in ${cleared.zoneName}`}</SelectItem>,
              ]}
            </Select>
          </div>
        ))}
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button onPress={onClose} variant="flat" radius="lg" className={MCI_CANCEL_BUTTON} data-testid="mci-clear-reassign-skip">
          Skip
        </Button>
        <Button radius="lg" className="bg-accent px-4 py-2 text-surface-light" isDisabled={saving || changes.length === 0} onPress={submit} data-testid="mci-clear-reassign-confirm">
          Reassign
        </Button>
      </ModalFooter>
    </>
  );
}

/**
 * After a zone is marked clear, the teams still assigned to it there have nothing left to triage: this asks
 * where each goes next (a treatment location, another zone, or Available). Skip leaves them where they are.
 */
export default function MciZoneClearModal({ cleared, zones, areas, onClose, onReassign }: Props) {
  return (
    <MciModal isOpen={!!cleared} onClose={onClose} testId="mci-clear-reassign-modal">
      {() => (cleared ? <ReassignForm key={cleared.zoneName} cleared={cleared} zones={zones} areas={areas} onClose={onClose} onReassign={onReassign} /> : null)}
    </MciModal>
  );
}
