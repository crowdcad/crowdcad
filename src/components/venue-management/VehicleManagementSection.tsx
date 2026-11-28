"use client";

import React, { useState } from 'react';
import { Button, Checkbox, Input, ScrollShadow, Select, SelectItem, Tooltip } from '@heroui/react';
import { CircleHelp, Edit2, Plus, Trash2 } from '@/components/ui/icons';
import type { Equipment, Vehicle } from '@/app/types';
import { SMALL_FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';

interface VehicleManagementSectionProps {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  vehicles: Vehicle[];
  /** The venue's equipment, offered for each vehicle. */
  equipment: Equipment[];
  /** Locations placed on the venue, offered as a vehicle's default location. */
  locationOptions: string[];
  onAdd: (name: string) => void;
  onRename: (idx: number, name: string) => void;
  onRemove: (idx: number) => void;
  onSetLocation: (idx: number, location: string | undefined) => void;
  /** The equipment (by id) that lives on the vehicle. */
  onSetEquipment: (idx: number, equipmentIds: string[]) => void;
}

const selectClassNames = {
  trigger: 'rounded-large px-3 hover:bg-surface-deep data-[focus=true]:outline-none',
  value: 'text-surface-light',
  popover: 'bg-surface-deepest border border-surface-liner rounded-large',
  listbox: 'p-1 [&_[data-hover=true]]:bg-surface-deep [&_[data-selected=true]]:bg-surface-deep',
} as const;

/** The venue's vehicles (#176): carts and other vehicles, where each is kept and the equipment on it. */
export default function VehicleManagementSection({
  enabled,
  setEnabled,
  vehicles,
  equipment,
  locationOptions,
  onAdd,
  onRename,
  onRemove,
  onSetLocation,
  onSetEquipment,
}: VehicleManagementSectionProps) {
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editInput, setEditInput] = useState('');

  const add = () => {
    const name = input.trim();
    if (!name) return;
    onAdd(name);
    setInput('');
  };
  const saveEdit = () => {
    if (editing === null || !editInput.trim()) return;
    onRename(editing, editInput.trim());
    setEditing(null);
  };

  return (
    <>
      <h3 className="mb-2 text-surface-light font-semibold text-xl inline-flex items-center gap-1.5">
        Vehicles <span className="text-surface-faint text-sm font-normal">(Optional)</span>
        <Tooltip content="Carts or other vehicles that carry equipment. Events at this venue can turn on a Vehicles tab to track them." placement="top">
          <CircleHelp className="w-3.5 h-3.5 text-surface-faint" />
        </Tooltip>
      </h3>
      <Checkbox isSelected={enabled} onValueChange={setEnabled} size="sm" classNames={{ wrapper: 'after:bg-accent' }} className="mb-3">
        <span className="text-sm text-surface-light">Enable Vehicles</span>
      </Checkbox>
      {enabled && (
        <>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="e.g., Cart 1"
              value={input}
              onValueChange={setInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
              variant="flat"
              classNames={SMALL_FIELD_CLASSNAMES}
              aria-label="Vehicle name"
            />
            <Button isIconOnly onPress={add} className="flex-shrink-0 bg-accent hover:bg-accent/90 text-surface-light" aria-label="Add vehicle">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {vehicles.length > 0 && (
            <ScrollShadow className="space-y-2 pr-2 max-h-[calc(100vh-470px)] scrollbar-hide">
              {vehicles.map((vehicle, idx) => (
                <div key={vehicle.id} data-testid="vehicle-row" className="rounded-sm p-1 bg-default/40">
                  <div className="flex items-center gap-2 px-2 py-1">
                    {editing === idx ? (
                      <Input
                        value={editInput}
                        onValueChange={setEditInput}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            saveEdit();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditing(null);
                          }
                        }}
                        onBlur={saveEdit}
                        variant="flat"
                        size="sm"
                        autoFocus
                        aria-label="Vehicle name"
                        classNames={{
                          input: 'text-surface-light text-sm outline-none focus:outline-none data-[focus=true]:outline-none',
                          inputWrapper: 'rounded-small px-2 hover:bg-surface-deep',
                        }}
                      />
                    ) : (
                      <span className="text-sm text-surface-light truncate flex-shrink-0">{vehicle.name}</span>
                    )}
                    <div className="ml-auto flex items-center gap-2 min-w-0">
                      <Select
                        variant="flat"
                        placeholder="Select Default Location"
                        aria-label="Default location"
                        selectedKeys={vehicle.location ? [vehicle.location] : []}
                        onSelectionChange={(keys) => onSetLocation(idx, Array.from(keys)[0] as string | undefined)}
                        classNames={{ ...selectClassNames, base: 'w-[170px]' }}
                        size="sm"
                      >
                        {locationOptions.map((name) => (
                          <SelectItem key={name}>{name}</SelectItem>
                        ))}
                      </Select>
                      <Select
                        variant="flat"
                        selectionMode="multiple"
                        placeholder="Equipment"
                        aria-label="Equipment on this vehicle"
                        selectedKeys={new Set(equipment.filter((e) => e.location === vehicle.name).map((e) => e.id))}
                        onSelectionChange={(keys) => onSetEquipment(idx, Array.from(keys as Set<string>))}
                        classNames={{ ...selectClassNames, base: 'w-[150px]' }}
                        size="sm"
                      >
                        {equipment.map((e) => (
                          <SelectItem key={e.id}>{e.name}</SelectItem>
                        ))}
                      </Select>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        isIconOnly
                        size="sm"
                        radius="full"
                        variant="light"
                        onPress={() => {
                          setEditing(idx);
                          setEditInput(vehicle.name);
                        }}
                        className="min-w-6 w-6 h-6 flex-shrink-0"
                        aria-label="Rename vehicle"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        radius="full"
                        variant="light"
                        color="danger"
                        onPress={() => onRemove(idx)}
                        className="min-w-6 w-6 h-6 flex-shrink-0"
                        aria-label="Remove vehicle"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </ScrollShadow>
          )}
        </>
      )}
    </>
  );
}
