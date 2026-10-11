import React from 'react';
import { Checkbox, Tooltip } from '@heroui/react';
import { CircleHelp } from 'lucide-react';

/** "Mark as Dispatch Zone", with a hover explanation; shared by the new-area dialog and the area edit modal. */
export default function DispatchZoneCheckbox({
  isSelected,
  onValueChange,
  labelClassName = 'text-surface-light text-xs',
}: {
  isSelected: boolean;
  onValueChange: (value: boolean) => void;
  labelClassName?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Checkbox isSelected={isSelected} onValueChange={onValueChange} size="sm" classNames={{ label: labelClassName }}>
        Mark as Dispatch Zone
      </Checkbox>
      <Tooltip
        placement="top"
        className="max-w-xs"
        content="A dispatch zone gets its own calls tab on the dispatch board: every call at a location inside the area is listed there, so one dispatcher can handle that part of the event. It is drawn with diagonal stripes on the map."
      >
        <CircleHelp className="h-3.5 w-3.5 flex-shrink-0 text-surface-faint" aria-label="What is a dispatch zone?" />
      </Tooltip>
    </div>
  );
}
