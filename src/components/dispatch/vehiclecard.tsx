'use client';

import { useEffect, useState } from 'react';
import { Autocomplete, AutocompleteItem, Card, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Select, SelectItem } from '@heroui/react';
import { MapPin, MoreVertical, Truck } from 'lucide-react';
import type { Event, Vehicle } from '@/app/types';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { staticSelectorButtonProps } from '@/lib/heroStatic';

type VehicleCardProps = {
  vehicle: Vehicle;
  event: Event;
  /** Equipment on this vehicle: what lives on it, or is on it now. */
  equipmentOn: string[];
  /** Every piece of the event's equipment, offered for the vehicle. */
  equipmentNames: string[];
  /** A post, or the unit crewing it. */
  onLocationChange: (vehicleId: string, location: string) => void;
  onEquipmentChange: (vehicleId: string, equipmentNames: string[]) => void;
  onDelete: (vehicleId: string) => void;
};

/** A vehicle on the board's Vehicles tab: where it is (or who crews it) and the equipment on it. */
export default function VehicleCard({ vehicle, event, equipmentOn, equipmentNames, onLocationChange, onEquipmentChange, onDelete }: VehicleCardProps) {
  const { t } = useDispatchTerms();
  const [locationInput, setLocationInput] = useState(vehicle.location ?? '');
  useEffect(() => setLocationInput(vehicle.location ?? ''), [vehicle.location]);

  const posts = (event.venue?.posts || []).map((p) => (typeof p === 'string' ? p : p.name));
  const units = [...(event.staff || []), ...(event.supervisor || [])].map((u) => u.team);
  const locationOptions = Array.from(new Set([...units, ...posts].filter(Boolean)));
  const commit = (value: string) => {
    if (value !== (vehicle.location ?? '')) onLocationChange(vehicle.id, value);
  };

  return (
    <Card className="dispatch-shell-card w-full border-0 rounded-none bg-transparent shadow-none hover:bg-surface-deep" data-testid={`vehicle-card-${vehicle.name}`}>
      <div className="relative flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <div className="flex items-center gap-1.5 font-semibold text-[15px] sm:text-base text-surface-light min-w-0">
          <Truck className="w-4 h-4 shrink-0" />
          <span className="truncate">{vehicle.name}</span>
        </div>
        <Dropdown placement="bottom-end" offset={6}>
          <DropdownTrigger>
            <button
              className="p-0 m-0 border-0 bg-transparent text-surface-light hover:text-status-blue transition-colors cursor-pointer flex items-center justify-center"
              aria-label="Vehicle actions"
              type="button"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="Vehicle actions"
            itemClasses={{ base: 'px-3 py-2 text-sm text-surface-light rounded-xl' }}
            onAction={(key) => {
              if (key === 'delete') onDelete(vehicle.id);
            }}
          >
            <DropdownItem key="delete" className="text-status-red">{t('Delete')}</DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>

      <div className="flex items-center gap-3 px-4 pb-3">
        <div className="min-w-0 flex-[1.5]">
          <Autocomplete
            aria-label="Location"
            startContent={(
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                <MapPin className="h-[18px] w-[18px] shrink-0 text-surface-faint" />
              </span>
            )}
            placeholder={t('Location or crew')}
            inputValue={locationInput}
            onInputChange={setLocationInput}
            onSelectionChange={(key) => {
              if (key) commit(String(key));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(locationInput.trim());
            }}
            onBlur={() => commit(locationInput.trim())}
            allowsCustomValue
            className="min-w-0"
            classNames={{ base: 'min-w-0 data-[focus-visible=true]:outline-none data-[focus=true]:outline-none' }}
            selectorButtonProps={staticSelectorButtonProps}
            inputProps={{
              classNames: {
                inputWrapper: 'bg-surface-deep text-surface-light border border-surface-liner rounded-full pl-3 group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0 data-[focus-visible=true]:ring-0 data-[focus-visible=true]:ring-offset-0 focus-within:ring-0 focus:ring-0',
                input: 'bg-surface-deep pl-1 data-[focus-visible=true]:ring-0 focus:ring-0 focus-visible:ring-0 outline-none focus:outline-none data-[focus=true]:outline-none',
              },
            }}
          >
            {locationOptions.map((name) => (
              <AutocompleteItem key={name}>{t(name)}</AutocompleteItem>
            ))}
          </Autocomplete>
        </div>
        <div className="min-w-0 flex-[1]">
          <Select
            aria-label="Equipment on this vehicle"
            selectionMode="multiple"
            placeholder={t('Equipment')}
            selectedKeys={new Set(equipmentOn)}
            onSelectionChange={(keys) => onEquipmentChange(vehicle.id, Array.from(keys as Set<string>))}
            classNames={{ base: 'min-w-0', trigger: 'bg-surface-deep text-surface-light border border-surface-liner rounded-full' }}
          >
            {equipmentNames.map((name) => (
              <SelectItem key={name}>{name}</SelectItem>
            ))}
          </Select>
        </div>
      </div>
    </Card>
  );
}
