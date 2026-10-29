'use client';

import React, { useId, useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Checkbox, Input } from '@heroui/react';
import type { MciColor } from '@/app/types';
import { MCI_COLORS, mciPatientLabel, sumCounts, type MciAreaStats, type MciCounts } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { MCI_COLOR_STYLES, MCI_NUMBER_INPUT, MciColorDot } from './mciparts';

type Props = {
  /** The treatment location patients leave from; null keeps the dialog closed. */
  area: MciAreaStats | null;
  /** Ambulance numbers already used this MCI, offered as suggestions. */
  units: string[];
  /** Patients are tracked: pick them by name (priority order), with a count only for black (D14). */
  trackPatients?: boolean;
  onClose: () => void;
  onTransport: (areaId: string, counts: MciCounts, trip: { unit: string; destination?: string }, patientIds: string[]) => boolean | Promise<boolean>;
};

/** Colors picked by name when patients are tracked; the rest keep a count. */
const NAMED_COLORS = new Set<MciColor>(['red', 'yellow', 'green']);

const inputClassNames = {
  inputWrapper: 'rounded-xl px-3 group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0',
  input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
} as const;

// Remounted by `key` for each location, so the numbers start at nothing.
function TransportForm({ area, units, trackPatients = false, onClose, onTransport }: Omit<Props, 'area'> & { area: MciAreaStats }) {
  const { t } = useDispatchTerms();
  const listId = useId();
  const [unit, setUnit] = useState('');
  const [destination, setDestination] = useState('');
  const [counts, setCounts] = useState<MciCounts>({ red: 0, yellow: 0, green: 0, black: 0 });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const namedPatients = trackPatients ? area.patients.filter((p) => NAMED_COLORS.has(p.color)) : [];
  const countedColors = MCI_COLORS.filter((color) => !trackPatients || !NAMED_COLORS.has(color));

  // A trip cannot take more than is in the location.
  const set = (color: (typeof MCI_COLORS)[number], raw: string) => {
    const n = Number.parseInt(raw, 10);
    const value = Number.isFinite(n) ? Math.max(0, Math.min(n, area.inTreatment[color])) : 0;
    setCounts((prev) => ({ ...prev, [color]: value }));
  };

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
            classNames={inputClassNames}
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
          maxLength={80}
          classNames={inputClassNames}
          data-testid="mci-transport-destination"
        />

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

        <div className={`grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-2 text-sm ${countedColors.every((c) => area.inTreatment[c] <= 0) && trackPatients ? 'hidden' : ''}`}>
          <span className="text-xs text-surface-faint" />
          <span className="text-xs text-surface-faint">Here now</span>
          <span className="text-xs text-surface-faint">Transport</span>
          {countedColors.map((color) => (
            <React.Fragment key={color}>
              <span className="inline-flex items-center gap-1.5 text-surface-light">
                <MciColorDot color={color} />
                {MCI_COLOR_STYLES[color].label}
              </span>
              <span className="text-center tabular-nums text-surface-light">{area.inTreatment[color]}</span>
              <input
                type="number"
                min={0}
                max={area.inTreatment[color]}
                inputMode="numeric"
                disabled={area.inTreatment[color] <= 0}
                aria-label={`Transport ${MCI_COLOR_STYLES[color].label.toLowerCase()}`}
                value={counts[color]}
                onChange={(e) => set(color, e.target.value)}
                className={`h-8 w-16 disabled:opacity-40 ${MCI_NUMBER_INPUT}`}
                data-testid={`mci-transport-${color}`}
              />
            </React.Fragment>
          ))}
        </div>
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button onPress={onClose} variant="flat" radius="lg" className="bg-status-red/20 px-4 py-2 text-status-red hover:bg-status-red/30">
          {t('Cancel')}
        </Button>
        <Button radius="lg" className="bg-accent px-4 py-2 text-surface-light" isDisabled={!canSubmit} onPress={submit} data-testid="mci-transport-confirm">
          {t('Transport')} ({total})
        </Button>
      </ModalFooter>
    </>
  );
}

export default function MciTransportModal({ area, units, trackPatients, onClose, onTransport }: Props) {
  return (
    <Modal
      isOpen={!!area}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="top-center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      classNames={{ base: 'mt-20 rounded-lg bg-surface-deepest text-surface-light', header: 'pb-0', footer: 'pt-0', body: 'minimal-scrollbar' }}
    >
      <ModalContent data-testid="mci-transport-modal">
        {() => (area ? <TransportForm key={area.area.id} area={area} units={units} trackPatients={trackPatients} onClose={onClose} onTransport={onTransport} /> : null)}
      </ModalContent>
    </Modal>
  );
}
