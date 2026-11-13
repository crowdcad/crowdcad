'use client';

import React, { useId, useState } from 'react';
import { ModalHeader, ModalBody, ModalFooter, Button, Checkbox, Input } from '@heroui/react';
import type { MciColor } from '@/app/types';
import { MCI_COLORS, emptyCounts, mciPatientLabel, sumCounts, type MciAreaStats, type MciCounts } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { MCI_CANCEL_BUTTON, MCI_INPUT_CLASSNAMES, MciColorDot, MciCountInputs, MciModal } from './mciparts';

type Props = {
  /** The treatment location patients leave from; null keeps the dialog closed. */
  area: MciAreaStats | null;
  /** Ambulance numbers already used this MCI, offered as suggestions. */
  units: string[];
  /** Hospitals from the Logistics tab, offered as destinations: a transport to one counts as sent there. */
  hospitals?: string[];
  /** Patients are tracked: pick them by name (priority order), with a count only for black (D14). */
  trackPatients?: boolean;
  onClose: () => void;
  onTransport: (areaId: string, counts: MciCounts, trip: { unit: string; destination?: string }, patientIds: string[]) => boolean | Promise<boolean>;
};

/** Colors picked by name when patients are tracked; the rest keep a count. */
const NAMED_COLORS = new Set<MciColor>(['red', 'yellow', 'green']);

// Remounted by `key` for each location, so the numbers start at nothing.
function TransportForm({ area, units, hospitals = [], trackPatients = false, onClose, onTransport }: Omit<Props, 'area'> & { area: MciAreaStats }) {
  const { t } = useDispatchTerms();
  const listId = useId();
  const hospitalListId = useId();
  const [unit, setUnit] = useState('');
  const [destination, setDestination] = useState('');
  const [counts, setCounts] = useState<MciCounts>(emptyCounts);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const namedPatients = trackPatients ? area.patients.filter((p) => NAMED_COLORS.has(p.color)) : [];
  const countedColors = MCI_COLORS.filter((color) => !trackPatients || !NAMED_COLORS.has(color));


  const total = sumCounts(counts) + picked.size;
  const canSubmit = !submitting && unit.trim().length > 0 && total > 0;
  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const ok = await onTransport(area.area.id, counts, { unit, destination }, [...picked]);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ModalHeader className="text-xl font-bold text-surface">
        {t('Transport')}: {area.name}
      </ModalHeader>
      <ModalBody className="gap-4 py-4">
        <div className="flex flex-col gap-1">
          <Input
            label={t('Ambulance number')}
            size="sm"
            radius="lg"
            value={unit}
            onValueChange={setUnit}
            list={listId}
            maxLength={40}
            isRequired
            classNames={MCI_INPUT_CLASSNAMES}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
            data-testid="mci-transport-unit"
          />
          <datalist id={listId}>
            {units.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>

        <Input
          label={`${t('Destination')} (optional)`}
          size="sm"
          radius="lg"
          value={destination}
          onValueChange={setDestination}
          list={hospitalListId}
          maxLength={80}
          classNames={MCI_INPUT_CLASSNAMES}
          data-testid="mci-transport-destination"
        />
        <datalist id={hospitalListId}>
          {hospitals.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>

        {trackPatients && (
          <div className="flex flex-col gap-1" data-testid="mci-transport-patients">
            <span className="text-xs text-surface-faint">Patients, in transport order</span>
            {namedPatients.length === 0 && <p className="text-sm italic text-surface-faint">No red, yellow or green patients here.</p>}
            <div className="minimal-scrollbar flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {namedPatients.map((p) => (
                <Checkbox
                  key={p.id}
                  size="sm"
                  isSelected={picked.has(p.id)}
                  onValueChange={(on) =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                  classNames={{ base: 'm-0 max-w-full rounded-md px-1 py-0.5 hover:bg-surface-liner/50', label: 'flex min-w-0 items-center gap-2 text-sm normal-case tracking-normal' }}
                  data-testid={`mci-transport-patient-${p.color}`}
                >
                  <span className="w-5 text-center text-xs font-semibold tabular-nums text-surface-faint">{p.rank ?? ''}</span>
                  <MciColorDot color={p.color} />
                  <span className={`truncate ${mciPatientLabel(p.details) ? 'text-surface-light' : 'italic text-surface-faint'}`}>{mciPatientLabel(p.details) || 'No details'}</span>
                </Checkbox>
              ))}
            </div>
          </div>
        )}

        {/* A trip cannot take more than is in the location. */}
        <MciCountInputs
          colors={countedColors}
          available={area.inTreatment}
          availableLabel="Here now"
          verb="Transport"
          counts={counts}
          onChange={setCounts}
          disableEmpty
          testIdPrefix="mci-transport"
          className={trackPatients && countedColors.every((c) => area.inTreatment[c] <= 0) ? 'hidden' : ''}
        />
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button onPress={onClose} variant="flat" radius="lg" className={MCI_CANCEL_BUTTON}>
          {t('Cancel')}
        </Button>
        <Button radius="lg" className="bg-accent px-4 py-2 text-surface-light" isDisabled={!canSubmit} onPress={submit} data-testid="mci-transport-confirm">
          {t('Transport')} ({total})
        </Button>
      </ModalFooter>
    </>
  );
}

export default function MciTransportModal({ area, units, hospitals, trackPatients, onClose, onTransport }: Props) {
  return (
    <MciModal isOpen={!!area} onClose={onClose} testId="mci-transport-modal">
      {() => (area ? <TransportForm key={area.area.id} area={area} units={units} hospitals={hospitals} trackPatients={trackPatients} onClose={onClose} onTransport={onTransport} /> : null)}
    </MciModal>
  );
}
