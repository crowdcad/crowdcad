'use client';

import React, { useMemo, useState } from 'react';
import { ModalHeader, ModalBody, ModalFooter, Button, Input, Checkbox, RadioGroup, Radio } from '@heroui/react';
import type { Event, MciColor, MciTreatmentArea, MciZone } from '@/app/types';
import { getEventClinics } from '@/lib/clinics';
import { getVenueZones } from '@/lib/zones';
import { deriveMci, isDuplicateMciName, MCI_COLORS, mciTarpName as tarpName, newMciId, regularClinicCount, type DeclareMciInput } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import HelpTip from '@/components/ui/helptip';
import { MCI_CANCEL_BUTTON, MCI_CHECKBOX_CLASSNAMES, MCI_INPUT_CLASSNAMES, MciColorDot, MciModal } from './mciparts';

type Props = {
  isOpen: boolean;
  event: Event;
  onClose: () => void;
  onDeclare: (input: DeclareMciInput) => void | Promise<void>;
};

// Round in every UI style, so the two choices never read as checkboxes.
const RADIO_CLASSNAMES = { ...MCI_CHECKBOX_CLASSNAMES, wrapper: '!rounded-circle border-surface-faint group-data-[selected=true]:!border-accent', control: '!rounded-circle !bg-accent' } as const;

const inputClassNames = { ...MCI_INPUT_CLASSNAMES, inputWrapper: 'rounded-2xl px-4 hover:bg-surface-deep' } as const;

/** One checkbox row: the name in normal case (a checkbox is a <label>, which the condensed style would put in capitals). */
function Pick({ checked, onChange, disabled, testId, children }: { checked: boolean; onChange: (on: boolean) => void; disabled?: boolean; testId?: string; children: React.ReactNode }) {
  return (
    <Checkbox isSelected={checked} onValueChange={onChange} isDisabled={disabled} classNames={MCI_CHECKBOX_CLASSNAMES} data-testid={testId}>
      {children}
    </Checkbox>
  );
}

function AddedRow({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-surface-liner px-3 py-1 text-sm text-surface-light">
      <span>{name}</span>
      <button type="button" className="text-xs text-status-red" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function AddByName({ placeholder, value, onChange, onAdd, taken, takenText, testId }: { placeholder: string; value: string; onChange: (v: string) => void; onAdd: () => void; taken: boolean; takenText: string; testId: string }) {
  return (
    <div className="flex items-start gap-2">
      <Input
        aria-label={placeholder}
        placeholder={placeholder}
        size="sm"
        radius="lg"
        value={value}
        onValueChange={onChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onAdd();
          }
        }}
        isInvalid={taken}
        errorMessage={taken ? takenText : undefined}
        classNames={inputClassNames}
        data-testid={`${testId}-input`}
      />
      <Button size="sm" variant="flat" radius="lg" className="shrink-0 whitespace-nowrap" onPress={onAdd} isDisabled={!value.trim() || taken} data-testid={`${testId}-add`}>
        {placeholder}
      </Button>
    </div>
  );
}

const toggled = <T,>(set: Set<T>, id: T, on: boolean) => {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
};

// Remounted by `key` each time the dialog opens, so its picks start fresh.
function DeclareMciForm({ event, onClose, onDeclare }: Omit<Props, 'isOpen'>) {
  const { t } = useDispatchTerms();
  const existing = event.mci;
  // After a stand-down: carry on the earlier MCI or start an entirely new one. Neither is assumed.
  const redeclare = !!existing && existing.periods.length > 0 && !existing.active;
  const [mode, setMode] = useState<'keep' | 'new' | null>(null);

  // Patients still in a zone or location can't be dropped from an MCI that keeps its counts.
  const busy = useMemo(() => {
    if (!existing) return { zones: new Map<string, number>(), areas: new Map<string, number>() };
    const d = deriveMci({ mci: existing, calls: event.calls, clinics: event.clinics });
    return {
      zones: new Map(d.zones.filter((z) => z.inZoneTotal > 0).map((z) => [z.zone.id, z.inZoneTotal])),
      areas: new Map(d.areas.filter((a) => a.inTreatmentTotal > 0).map((a) => [a.area.id, a.inTreatmentTotal])),
    };
  }, [existing, event.calls, event.clinics]);
  const locked = (kind: 'zones' | 'areas', id: string) => (mode === 'keep' ? busy[kind].get(id) ?? 0 : 0);

  // Zones from the earlier MCI, listed first and ticked (the ones dropped on an earlier re-declare unticked).
  const earlierZones = useMemo(() => [...(existing?.zones ?? []), ...(existing?.retiredZones ?? [])], [existing?.zones, existing?.retiredZones]);
  const venueZones = useMemo(
    () => getVenueZones(event.venue).filter((z) => !earlierZones.some((e) => e.id === z.id || e.venueZoneId === z.id) && !existing?.areas.some((a) => a.id === z.id || a.venueZoneId === z.id)),
    [event.venue, earlierZones, existing?.areas]
  );
  const dispatchZoneIds = useMemo(() => new Set((event.dispatchZones || []).map((z) => z.id)), [event.dispatchZones]);

  // Treatment locations: a tarp per color (the earlier one when there is one), then clinics and earlier locations.
  const earlierAreas = useMemo(() => [...(existing?.areas ?? []), ...(existing?.retiredAreas ?? [])], [existing?.areas, existing?.retiredAreas]);
  const tarpFor = (c: MciColor) => earlierAreas.find((a) => a.color === c);
  const otherAreas = useMemo(() => {
    const earlier = earlierAreas.filter((a) => !a.color);
    const clinics = getEventClinics(event.clinics)
      .filter((c) => !earlier.some((a) => a.id === c.id || a.clinicId === c.id))
      .map((c): MciTreatmentArea => ({ id: c.id, name: c.name, clinicId: c.id }));
    return [...earlier, ...clinics];
  }, [earlierAreas, event.clinics]);

  const [zoneIds, setZoneIds] = useState<Set<string>>(
    () =>
      new Set([
        ...(existing?.zones ?? []).map((z) => z.id),
        ...venueZones.filter((z) => z.isDispatchZone || dispatchZoneIds.has(z.id)).map((z) => z.id),
      ])
  );
  const [areaIds, setAreaIds] = useState<Set<string>>(
    () => new Set([...(existing?.areas ?? []).filter((a) => !a.color).map((a) => a.id), ...otherAreas.filter((a) => a.clinicId && !existing?.retiredAreas?.some((r) => r.id === a.id)).map((a) => a.id)])
  );
  const [tarps, setTarps] = useState<Set<MciColor>>(() => new Set(MCI_COLORS.filter((c) => !existing?.retiredAreas?.some((a) => a.color === c))));
  const [addedZones, setAddedZones] = useState<string[]>([]);
  const [addedAreas, setAddedAreas] = useState<string[]>([]);
  const [zoneDraft, setZoneDraft] = useState('');
  const [areaDraft, setAreaDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // On by default (D11); a re-declare starts from the earlier choice.
  const [trackPatients, setTrackPatients] = useState(existing?.trackPatients ?? true);

  const zoneOn = (id: string) => zoneIds.has(id) || locked('zones', id) > 0;
  const areaOn = (id: string) => areaIds.has(id) || locked('areas', id) > 0;

  const pickedZones: MciZone[] = [
    ...earlierZones.filter((z) => zoneOn(z.id)),
    ...venueZones.filter((z) => zoneIds.has(z.id)).map((z) => ({ id: z.id, name: z.name, venueZoneId: z.id })),
  ];
  const pickedAreas: MciTreatmentArea[] = [
    ...MCI_COLORS.filter((c) => tarps.has(c) || (tarpFor(c) && locked('areas', tarpFor(c)!.id) > 0)).map((c) => tarpFor(c) ?? { id: `tarp-${c}`, name: tarpName(c), color: c }),
    ...otherAreas.filter((a) => areaOn(a.id)),
  ];
  const zoneDraftTaken = isDuplicateMciName([...pickedZones, ...addedZones.map((name) => ({ name }))], zoneDraft);
  const areaDraftTaken = isDuplicateMciName([...pickedAreas, ...addedAreas.map((name) => ({ name }))], areaDraft);
  // MCI zone names must be unique; two ticked venue zones can share one.
  const tickedNames = pickedZones.map((z) => z.name.trim().toLowerCase());
  const nameClash = new Set(tickedNames).size !== tickedNames.length;

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

  const canDeclare = !submitting && !nameClash && (!redeclare || mode !== null);
  const submit = async () => {
    if (!canDeclare) return;
    setSubmitting(true);
    try {
      const zones: MciZone[] = [...pickedZones, ...addedZones.map((name) => ({ id: `mci-zone-${newMciId()}`, name }))];
      const areas: MciTreatmentArea[] = [
        ...pickedAreas.map((a) => (a.id.startsWith('tarp-') && !earlierAreas.some((e) => e.id === a.id) ? { ...a, id: `mci-area-${newMciId()}` } : a)),
        ...addedAreas.map((name) => ({ id: `mci-area-${newMciId()}`, name })),
      ];
      await onDeclare({ zones, areas, trackPatients, ...(redeclare && mode ? { mode } : {}) });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const lockedNote = (n: number) => (n > 0 ? <span className="ml-2 text-xs text-surface-faint">{n} still here</span> : null);

  return (
    <>
      <ModalHeader className="text-2xl font-bold text-surface">{t('Declare MCI')}</ModalHeader>
      <ModalBody className="gap-5 py-4 text-sm text-surface-light">
        {redeclare && (
          <RadioGroup
            aria-label="Earlier MCI"
            value={mode}
            onValueChange={(v) => setMode(v as 'keep' | 'new')}
            classNames={{ wrapper: 'gap-2' }}
            data-testid="mci-declare-mode"
          >
            <Radio value="keep" classNames={RADIO_CLASSNAMES} data-testid="mci-declare-mode-keep">
              Keep existing zones, treatment locations and counts from the earlier period
            </Radio>
            <Radio value="new" classNames={RADIO_CLASSNAMES} data-testid="mci-declare-mode-new">
              Declare entirely new MCI
            </Radio>
          </RadioGroup>
        )}

        <section aria-label={t('Zones')} className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <h3 className="text-base font-semibold">{t('Zones')}</h3>
            <HelpTip text="Zones are where patients are found and tagged. The venue's dispatch zones start ticked." label="About zones" />
          </div>
          <p className="text-surface-faint">Select existing zones, and add or delete zones below.</p>
          {earlierZones.map((zone) => (
            <Pick key={zone.id} checked={zoneOn(zone.id)} disabled={locked('zones', zone.id) > 0} onChange={(on) => setZoneIds((prev) => toggled(prev, zone.id, on))} testId={`mci-declare-zone-${zone.name}`}>
              {zone.name}
              {lockedNote(locked('zones', zone.id))}
            </Pick>
          ))}
          {venueZones.map((zone) => (
            <Pick key={zone.id} checked={zoneIds.has(zone.id)} onChange={(on) => setZoneIds((prev) => toggled(prev, zone.id, on))} testId={`mci-declare-zone-${zone.name}`}>
              {zone.name}
            </Pick>
          ))}
          {addedZones.map((name) => (
            <AddedRow key={name} name={name} onRemove={() => setAddedZones((prev) => prev.filter((n) => n !== name))} />
          ))}
          {nameClash && <p className="text-xs text-status-red">Two ticked zones share a name. Untick one.</p>}
          <AddByName placeholder={t('Add zone')} value={zoneDraft} onChange={setZoneDraft} onAdd={addZone} taken={zoneDraftTaken} takenText="A zone with that name is already on the list." testId="mci-declare-zone" />
        </section>

        <section aria-label={t('Treatment locations')} className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <h3 className="text-base font-semibold">{t('Treatment locations')}</h3>
            <HelpTip text="A color's treatment zone (a tarp) only takes patients tagged that color. Clinics and other locations take any color. Zones are drawn on the map later." label="About treatment locations" />
          </div>
          <p className="text-surface-faint">Select or add treatment areas below.</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2" data-testid="mci-declare-tarps">
            {MCI_COLORS.map((c) => {
              const earlier = tarpFor(c);
              const held = earlier ? locked('areas', earlier.id) : 0;
              return (
                <Pick key={c} checked={tarps.has(c) || held > 0} disabled={held > 0} onChange={(on) => setTarps((prev) => toggled(prev, c, on))} testId={`mci-declare-tarp-${c}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <MciColorDot color={c} />
                    {earlier?.name ?? tarpName(c)}
                  </span>
                  {lockedNote(held)}
                </Pick>
              );
            })}
          </div>
          {otherAreas.map((area) => {
            const regular = area.clinicId ? regularClinicCount(event, { clinicId: area.clinicId }) : 0;
            return (
              <Pick key={area.id} checked={areaOn(area.id)} disabled={locked('areas', area.id) > 0} onChange={(on) => setAreaIds((prev) => toggled(prev, area.id, on))} testId={`mci-declare-clinic-${area.name}`}>
                {area.name}
                {regular > 0 && <span className="ml-2 text-xs text-surface-faint">{regular} regular {regular === 1 ? 'patient' : 'patients'}</span>}
                {lockedNote(locked('areas', area.id))}
              </Pick>
            );
          })}
          {addedAreas.map((name) => (
            <AddedRow key={name} name={name} onRemove={() => setAddedAreas((prev) => prev.filter((n) => n !== name))} />
          ))}
          <AddByName placeholder={t('Add treatment area')} value={areaDraft} onChange={setAreaDraft} onAdd={addArea} taken={areaDraftTaken} takenText="A treatment location with that name is already on the list." testId="mci-declare-area" />
        </section>

        <div className="flex items-center gap-1">
          <Pick checked={trackPatients} onChange={setTrackPatients} testId="mci-declare-track-patients">
            Track patients in treatment
          </Pick>
          <HelpTip text="A box per patient for age, sex and chief complaint. Untick for counts only." label="About tracking patients" />
        </div>
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        <Button onPress={onClose} variant="flat" radius="lg" className={MCI_CANCEL_BUTTON}>
          {t('Cancel')}
        </Button>
        <Button radius="lg" className="bg-status-red px-4 py-2 text-surface-light" isDisabled={!canDeclare} onPress={submit} data-testid="mci-declare-confirm">
          {t('Declare MCI')}
        </Button>
      </ModalFooter>
    </>
  );
}

export default function DeclareMciModal({ isOpen, event, onClose, onDeclare }: Props) {
  return (
    <MciModal isOpen={isOpen} onClose={onClose} testId="mci-declare-modal" size="xl">
      {() => <DeclareMciForm event={event} onClose={onClose} onDeclare={onDeclare} />}
    </MciModal>
  );
}
