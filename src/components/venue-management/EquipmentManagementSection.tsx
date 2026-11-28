"use client";

import React from 'react';
import { Button, Input, ScrollShadow, Select, SelectItem, Tooltip } from '@heroui/react';
import { CircleHelp, Edit2, Plus, Trash2 } from '@/components/ui/icons';
import type { Equipment } from '@/app/types';
import { SMALL_FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';

interface EquipmentManagementSectionProps {
  equipmentInput: string;
  setEquipmentInput: (value: string) => void;
  addEquipment: () => void;
  equipment: Equipment[];
  editingEquipmentIndex: number | null;
  equipmentEditInput: string;
  setEquipmentEditInput: (value: string) => void;
  saveEquipmentEdit: () => void;
  cancelEquipmentEdit: () => void;
  startEditEquipment: (idx: number) => void;
  removeEquipment: (idx: number) => void;
  // Locations already placed on the venue, offered as the equipment item's
  // default location — the same location the event builder pre-fills from
  // when that item is added to an event, and can still adjust from there.
  locationOptions: string[];
  onSetLocation: (idx: number, location: string | undefined) => void;
}

const selectClassNames = {
  trigger: 'rounded-large px-3 hover:bg-surface-deep data-[focus=true]:outline-none',
  value: 'text-surface-light',
  popover: 'bg-surface-deepest border border-surface-liner rounded-large',
  listbox: 'p-1 [&_[data-hover=true]]:bg-surface-deep [&_[data-selected=true]]:bg-surface-deep',
} as const;

export default function EquipmentManagementSection({
  equipmentInput,
  setEquipmentInput,
  addEquipment,
  equipment,
  editingEquipmentIndex,
  equipmentEditInput,
  setEquipmentEditInput,
  saveEquipmentEdit,
  cancelEquipmentEdit,
  startEditEquipment,
  removeEquipment,
  locationOptions,
  onSetLocation,
}: EquipmentManagementSectionProps) {
  return (
    <>
      <h3 className="mb-2 text-surface-light font-semibold text-xl inline-flex items-center gap-1.5">
        Equipment <span className="text-surface-faint text-sm font-normal">(Optional)</span>
        <Tooltip content="Trackable gear stored on this venue (e.g., a gurney or AED) that events can pull in and assign a default location to." placement="top">
          <CircleHelp className="w-3.5 h-3.5 text-surface-faint" />
        </Tooltip>
      </h3>
      <div className="flex gap-2 mb-3">
        <Input
          placeholder="e.g., Gurney 1"
          value={equipmentInput}
          onValueChange={setEquipmentInput}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addEquipment();
            }
          }}
          variant="flat"
          classNames={SMALL_FIELD_CLASSNAMES}
        />
        <Button
          isIconOnly
          onPress={addEquipment}
          className="flex-shrink-0 bg-accent hover:bg-accent/90 text-surface-light"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {equipment.length > 0 && (
        <ScrollShadow className="space-y-2 pr-2 max-h-[calc(100vh-430px)] scrollbar-hide">
          {equipment.map((item, idx) => (
            <div
              key={item.id}
              data-testid="equipment-row"
              className="rounded-sm p-1 bg-default/40"
            >
              <div className="flex items-center gap-2 px-2 py-1">
                {editingEquipmentIndex === idx ? (
                  <>
                    <Input
                      value={equipmentEditInput}
                      onValueChange={setEquipmentEditInput}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          saveEquipmentEdit();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEquipmentEdit();
                        }
                      }}
                      variant="flat"
                      size="sm"
                      autoFocus
                      classNames={{
                        input: 'text-surface-light text-sm outline-none focus:outline-none data-[focus=true]:outline-none',
                        inputWrapper: 'rounded-small px-2 hover:bg-surface-deep',
                      }}
                    />
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        isIconOnly
                        size="sm"
                        radius="full"
                        variant="light"
                        color="success"
                        onPress={saveEquipmentEdit}
                        className="min-w-6 w-6 h-6 flex-shrink-0"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        radius="full"
                        variant="light"
                        onPress={cancelEquipmentEdit}
                        className="min-w-6 w-6 h-6 flex-shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-surface-light truncate flex-shrink-0">{item.name}</span>
                    <Select
                      variant="flat"
                      color="default"
                      placeholder="Select Default Location"
                      selectedKeys={item.location ? [item.location] : []}
                      onSelectionChange={(keys) => {
                        const locName = Array.from(keys)[0] as string | undefined;
                        onSetLocation(idx, locName);
                      }}
                      classNames={{
                        ...selectClassNames,
                        base: 'max-w-[200px]',
                      }}
                      size="sm"
                      className="ml-auto"
                    >
                      {locationOptions.map((name) => (
                        <SelectItem key={name}>{name}</SelectItem>
                      ))}
                    </Select>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        isIconOnly
                        size="sm"
                        radius="full"
                        variant="light"
                        onPress={() => startEditEquipment(idx)}
                        className="min-w-6 w-6 h-6 flex-shrink-0"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        radius="full"
                        variant="light"
                        color="danger"
                        onPress={() => removeEquipment(idx)}
                        className="min-w-6 w-6 h-6 flex-shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </ScrollShadow>
      )}
    </>
  );
}
