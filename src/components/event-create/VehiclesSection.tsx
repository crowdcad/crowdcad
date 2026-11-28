import React from 'react';
import { Button, Checkbox, Chip, Input, ScrollShadow, Select, SelectItem } from '@heroui/react';
import { Plus, Trash2 } from '@/components/ui/icons';
import type { Event, EventEquipment, Vehicle, Venue } from '@/app/types';
import { randomId } from '@/lib/utils';
import { venueVehicles } from '@/lib/vehicles';
import { SMALL_FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';

type EventDraft = Partial<Event> & { venue: Venue; eventEquipment: EventEquipment[] };

type Props = {
  eventData: EventDraft;
  setEventData: React.Dispatch<React.SetStateAction<EventDraft>>;
  /** Venue locations, offered as where a vehicle starts. */
  locations: string[];
  selectClassNames: { label: string; input: string; inputWrapper: string };
};

/**
 * Event setup's Vehicles step (#176): turns the board's Vehicles tab on, and
 * sets where each vehicle starts (a post, or the unit crewing it) and the
 * equipment it carries. Starts from the venue's vehicles.
 */
export function VehiclesSection({ eventData, setEventData, locations, selectClassNames }: Props) {
  const [newName, setNewName] = React.useState('');
  const enabled = !!eventData.vehiclesEnabled;
  const vehicles = eventData.eventVehicles ?? [];
  const venueIds = new Set(venueVehicles(eventData.venue).map((v) => v.id));
  const units = [...(eventData.staff || []).map((s) => s.team), ...(eventData.supervisor || []).map((s) => s.team)];
  const startOptions = Array.from(new Set([...units, ...locations]));

  const setEnabled = (on: boolean) =>
    setEventData((prev) => ({
      ...prev,
      vehiclesEnabled: on,
      // The first time, start from the venue's vehicles.
      eventVehicles: on && !prev.eventVehicles?.length ? venueVehicles(prev.venue) : prev.eventVehicles,
    }));
  const updateVehicle = (id: string, patch: Partial<Vehicle>) =>
    setEventData((prev) => ({ ...prev, eventVehicles: (prev.eventVehicles ?? []).map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
  const addVehicle = () => {
    const name = newName.trim();
    if (!name || vehicles.some((v) => v.name.toLowerCase() === name.toLowerCase())) return;
    setEventData((prev) => ({ ...prev, eventVehicles: [...(prev.eventVehicles ?? []), { id: randomId(), name }] }));
    setNewName('');
  };
  const removeVehicle = (vehicle: Vehicle) =>
    setEventData((prev) => ({
      ...prev,
      eventVehicles: (prev.eventVehicles ?? []).filter((v) => v.id !== vehicle.id),
      eventEquipment: prev.eventEquipment.map((e) => (e.defaultLocation === vehicle.name ? { ...e, defaultLocation: undefined } : e)),
    }));
  // Equipment on a vehicle starts there and returns there.
  const setEquipment = (vehicle: Vehicle, ids: string[]) =>
    setEventData((prev) => ({
      ...prev,
      eventEquipment: prev.eventEquipment.map((e) => {
        if (ids.includes(e.id)) return { ...e, defaultLocation: vehicle.name };
        if (e.defaultLocation !== vehicle.name) return e;
        const venueItem = prev.venue.equipment?.find((v) => v.id === e.id);
        return { ...e, defaultLocation: venueItem?.location !== vehicle.name ? venueItem?.location : undefined };
      }),
    }));

  return (
    <div className="flex-1 min-h-0 py-3 flex flex-col">
      <div className="flex-shrink-0 pb-3">
        <Checkbox isSelected={enabled} onValueChange={setEnabled} size="sm" classNames={{ wrapper: 'after:bg-accent' }}>
          <span className="text-sm text-surface-light">Enable Vehicles</span>
        </Checkbox>
      </div>
      {enabled && (
        <>
          <div className="flex-shrink-0 pb-3 flex gap-2">
            <Input
              placeholder="Add a vehicle for this event only"
              value={newName}
              onValueChange={setNewName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addVehicle();
                }
              }}
              variant="flat"
              size="lg"
              classNames={SMALL_FIELD_CLASSNAMES}
              aria-label="Vehicle name"
            />
            <Button isIconOnly size="lg" onPress={addVehicle} className="flex-shrink-0 bg-accent hover:bg-accent/90 text-surface-light" aria-label="Add vehicle">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          <ScrollShadow className="space-y-1.5 pr-2 scrollbar-hide flex-1 min-h-0" hideScrollBar style={{ overflow: 'auto' }}>
            {vehicles.map((vehicle) => (
              <div key={vehicle.id} className="rounded-sm p-3 bg-default/40" data-testid="event-vehicle-row">
                <div className="flex items-center gap-3">
                  <span className="text-surface-light font-medium flex-shrink-0">{vehicle.name}</span>
                  {!venueIds.has(vehicle.id) && (
                    <Chip size="sm" variant="flat" className="bg-accent/20 text-accent">
                      Event only
                    </Chip>
                  )}
                  <Select
                    variant="flat"
                    placeholder="Location or crew"
                    aria-label="Location or crew"
                    selectedKeys={vehicle.location ? [vehicle.location] : []}
                    onSelectionChange={(keys) => updateVehicle(vehicle.id, { location: Array.from(keys)[0] as string | undefined })}
                    classNames={{ ...selectClassNames, base: 'max-w-[200px]' }}
                    size="sm"
                    className="ml-auto"
                  >
                    {startOptions.map((name) => (
                      <SelectItem key={name}>{name}</SelectItem>
                    ))}
                  </Select>
                  <Select
                    variant="flat"
                    selectionMode="multiple"
                    placeholder="Equipment"
                    aria-label="Equipment on this vehicle"
                    selectedKeys={new Set(eventData.eventEquipment.filter((e) => e.defaultLocation === vehicle.name).map((e) => e.id))}
                    onSelectionChange={(keys) => setEquipment(vehicle, Array.from(keys as Set<string>))}
                    classNames={{ ...selectClassNames, base: 'max-w-[180px]' }}
                    size="sm"
                  >
                    {eventData.eventEquipment.map((e) => (
                      <SelectItem key={e.id}>{e.name}</SelectItem>
                    ))}
                  </Select>
                  <button type="button" onClick={() => removeVehicle(vehicle)} className="p-1 rounded bg-transparent flex-shrink-0" aria-label="Remove vehicle">
                    <Trash2 className="h-4 w-4 text-status-red" />
                  </button>
                </div>
              </div>
            ))}
          </ScrollShadow>
        </>
      )}
    </div>
  );
}
