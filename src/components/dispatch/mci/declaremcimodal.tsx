'use client';

import React, { useMemo, useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Checkbox } from '@heroui/react';
import type { Event, MciTreatmentArea, MciZone } from '@/app/types';
import { getEventClinics } from '@/lib/clinics';
import { getVenueZones } from '@/lib/zones';
import { isDuplicateMciName, newMciId, regularClinicCount } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';

type Props = {
  isOpen: boolean;
  event: Event;
  onClose: () => void;
  onDeclare: (input: { zones: MciZone[]; areas: MciTreatmentArea[] }) => void | Promise<void>;
};

const inputClassNames = {
  inputWrapper: 'rounded-2xl px-4 hover:bg-surface-deep group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0',
  input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
} as const;

// Remounted by `key` each time the dialog opens, so its picks start fresh.
function DeclareMciForm({ event, onClose, onDeclare }: Omit<Props, 'isOpen'>) {
  const { t } = useDispatchTerms();
  const existing = event.mci;

  // A zone or clinic already on the event's MCI (from an earlier period) is kept as it is, so it is not offered again.
  const venueZones = useMemo(
    () => getVenueZones(event.venue).filter((z) => !existing?.zones.some((e) => e.id === z.id)),
    [event.venue, existing?.zones]
  );
  const dispatchZoneIds = useMemo(() => new Set((event.dispatchZones || []).map((z) => z.id)), [event.dispatchZones]);
  const clinics = useMemo(
    () => getEventClinics(event.clinics).filter((c) => !existing?.areas.some((a) => a.id === c.id)),
    [event.clinics, existing?.areas]
  );

  const [zoneIds, setZoneIds] = useState<Set<string>>(
    () => new Set(venueZones.filter((z) => z.isDispatchZone || dispatchZoneIds.has(z.id)).map((z) => z.id))
  );
  const [clinicIds, setClinicIds] = useState<Set<string>>(() => new Set(clinics.map((c) => c.id)));
  const [addedZones, setAddedZones] = useState<string[]>([]);
  const [addedAreas, setAddedAreas] = useState<string[]>([]);
  const [zoneDraft, setZoneDraft] = useState('');
  const [areaDraft, setAreaDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  const pickedZoneNames = [
    ...(existing?.zones || []).map((z) => ({ name: z.name })),
    ...venueZones.filter((z) => zoneIds.has(z.id)).map((z) => ({ name: z.name })),
    ...addedZones.map((name) => ({ name })),
  ];
  const pickedAreaNames = [
    ...(existing?.areas || []).map((a) => ({ name: a.name })),
    ...clinics.filter((c) => clinicIds.has(c.id)).map((c) => ({ name: c.name })),
    ...addedAreas.map((name) => ({ name })),
  ];
  const zoneDraftTaken = isDuplicateMciName(pickedZoneNames, zoneDraft);
  const areaDraftTaken = isDuplicateMciName(pickedAreaNames, areaDraft);
  // A ticked venue zone can share a name with another ticked one; MCI zone names must be unique.
  const tickedNames = venueZones.filter((z) => zoneIds.has(z.id)).map((z) => z.name.trim().toLowerCase());
  const venueNameClash = new Set(tickedNames).size !== tickedNames.length;

  const addZone = () => {
    const name = zoneDraft.trim();
    if (!name || zoneDraftTaken) return;
    setAddedZones((prev) => [...prev, name]);
    setZoneDraft('');
  };
  const addArea = () => {
    const name = areaDraft.trim();
    if (!name || areaDraftTaken) return;
    setAddedAreas((prev) => [...prev, name]);
    setAreaDraft('');
  };

  const submit = async () => {
    if (submitting || venueNameClash) return;
    setSubmitting(true);
    try {
      const zones: MciZone[] = [
        ...venueZones.filter((z) => zoneIds.has(z.id)).map((z) => ({ id: z.id, name: z.name, venueZoneId: z.id })),
        ...addedZones.map((name) => ({ id: `mci-zone-${newMciId()}`, name })),
      ];
      const areas: MciTreatmentArea[] = [
        ...clinics.filter((c) => clinicIds.has(c.id)).map((c) => ({ id: c.id, name: c.name, clinicId: c.id })),
        ...addedAreas.map((name) => ({ id: `mci-area-${newMciId()}`, name })),
      ];
      await onDeclare({ zones, areas });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ModalHeader className="text-2xl font-bold text-surface">{t('Declare MCI')}</ModalHeader>
      <ModalBody className="gap-5 py-4">
        {existing && existing.zones.length + existing.areas.length > 0 && (
          <p className="text-sm text-surface-faint">
            Zones, treatment locations and counts from the earlier period are kept.
          </p>
        )}

        <section aria-label={t('Zones')} className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-surface-light">{t('Zones')}</h3>
          {venueZones.length === 0 && addedZones.length === 0 && (
            <p className="text-sm text-surface-faint">No venue zones. Add a zone by name below.</p>
          )}
          {venueZones.map((zone) => (
            <Checkbox
              key={zone.id}
              isSelected={zoneIds.has(zone.id)}
              onValueChange={(on) => setZoneIds((prev) => toggle(prev, zone.id, on))}
              data-testid={`mci-declare-zone-${zone.name}`}
            >
              <span className="text-surface-light">{zone.name}</span>
              {(zone.isDispatchZone || dispatchZoneIds.has(zone.id)) && <span className="ml-2 text-xs text-surface-faint">dispatch zone</span>}
            </Checkbox>
          ))}
          {addedZones.map((name) => (
            <div key={name} className="flex items-center justify-between rounded-lg border border-surface-liner px-3 py-1 text-sm text-surface-light">
              <span>{name}</span>
              <button type="button" className="text-xs text-status-red" onClick={() => setAddedZones((prev) => prev.filter((n) => n !== name))}>
                Remove
              </button>
            </div>
          ))}
          {venueNameClash && <p className="text-xs text-status-red">Two ticked zones share a name. Untick one.</p>}
          <div className="flex items-start gap-2">
            <Input
              aria-label={t('Add zone')}
              placeholder={t('Add zone')}
              size="sm"
              radius="lg"
              value={zoneDraft}
              onValueChange={setZoneDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addZone();
                }
              }}
              isInvalid={zoneDraftTaken}
              errorMessage={zoneDraftTaken ? 'A zone with that name is already on the list.' : undefined}
              classNames={inputClassNames}
              data-testid="mci-declare-zone-input"
            />
            <Button size="sm" variant="bordered" radius="lg" className="shrink-0 whitespace-nowrap" onPress={addZone} isDisabled={!zoneDraft.trim() || zoneDraftTaken} data-testid="mci-declare-zone-add">
              {t('Add zone')}
            </Button>
          </div>
        </section>

        <section aria-label={t('Treatment locations')} className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-surface-light">{t('Treatment locations')}</h3>
          {clinics.map((clinic) => {
            const regular = regularClinicCount(event, { clinicId: clinic.id });
            return (
              <Checkbox
                key={clinic.id}
                isSelected={clinicIds.has(clinic.id)}
                onValueChange={(on) => setClinicIds((prev) => toggle(prev, clinic.id, on))}
                data-testid={`mci-declare-clinic-${clinic.name}`}
              >
                <span className="text-surface-light">{clinic.name}</span>
                <span className="ml-2 text-xs text-surface-faint">
                  {regular} regular {regular === 1 ? 'patient' : 'patients'} now
                </span>
              </Checkbox>
            );
          })}
          {addedAreas.map((name) => (
            <div key={name} className="flex items-center justify-between rounded-lg border border-surface-liner px-3 py-1 text-sm text-surface-light">
              <span>{name}</span>
              <button type="button" className="text-xs text-status-red" onClick={() => setAddedAreas((prev) => prev.filter((n) => n !== name))}>
                Remove
              </button>
            </div>
          ))}
          <div className="flex items-start gap-2">
            <Input
              aria-label={t('Add treatment area')}
              placeholder={t('Add treatment area')}
              size="sm"
              radius="lg"
              value={areaDraft}
              onValueChange={setAreaDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addArea();
                }
              }}
              isInvalid={areaDraftTaken}
              errorMessage={areaDraftTaken ? 'A treatment location with that name is already on the list.' : undefined}
              classNames={inputClassNames}
              data-testid="mci-declare-area-input"
            />
            <Button size="sm" variant="bordered" radius="lg" className="shrink-0 whitespace-nowrap" onPress={addArea} isDisabled={!areaDraft.trim() || areaDraftTaken} data-testid="mci-declare-area-add">
              {t('Add treatment area')}
            </Button>
          </div>
        </section>
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button onPress={onClose} variant="bordered" radius="lg" className="border-status-red px-4 py-2 text-status-red hover:bg-status-red/10">
          {t('Cancel')}
        </Button>
        <Button
          radius="lg"
          className="bg-status-red px-4 py-2 text-surface-light"
          isDisabled={submitting || venueNameClash}
          onPress={submit}
          data-testid="mci-declare-confirm"
        >
          {t('Declare MCI')}
        </Button>
      </ModalFooter>
    </>
  );
}

export default function DeclareMciModal({ isOpen, event, onClose, onDeclare }: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="top-center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      size="xl"
      scrollBehavior="inside"
      classNames={{ base: 'mt-20 rounded-lg bg-surface-deepest text-surface-light', header: 'pb-0', footer: 'pt-0' }}
    >
      <ModalContent data-testid="mci-declare-modal">
        {() => <DeclareMciForm event={event} onClose={onClose} onDeclare={onDeclare} />}
      </ModalContent>
    </Modal>
  );
}
