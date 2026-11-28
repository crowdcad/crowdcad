import React from 'react';
import { Input, Chip, Tooltip } from '@heroui/react';
import { CircleHelp } from '@/components/ui/icons';

type ScheduleChip = { id: string; time: string; editable: boolean };

type Props = {
  postsEnabled: boolean;
  scheduleBy: string;
  setScheduleBy: (value: string) => void;
  scheduleChips: ScheduleChip[];
  setScheduleChips: React.Dispatch<React.SetStateAction<ScheduleChip[]>>;
  editingChipId: string | null;
  setEditingChipId: React.Dispatch<React.SetStateAction<string | null>>;
  editingChipValue: string;
  setEditingChipValue: React.Dispatch<React.SetStateAction<string>>;
  setPostingTimes: (updater: (prev: string[]) => string[]) => void;
  inputClassNames: {
    label: string;
    inputWrapper: string;
    input: string;
  };
};

export default function PostingScheduleSection({
  postsEnabled,
  scheduleBy,
  setScheduleBy,
  scheduleChips,
  setScheduleChips,
  editingChipId,
  setEditingChipId,
  editingChipValue,
  setEditingChipValue,
  setPostingTimes,
  inputClassNames,
}: Props) {
  return (
    <div className="space-y-3 mt-6">
      <h3 className="text-surface-light font-semibold text-lg inline-flex items-center gap-1.5">
        Schedule
        <Tooltip content="How often, in minutes, posts are automatically regenerated between the event's Start and End time." placement="top">
          <CircleHelp className="w-3.5 h-3.5 text-surface-faint" />
        </Tooltip>
      </h3>

      <div className="max-w-[10rem] pb-3">
        {/* The event's own start/end now live as "Start Time"/"End Time" on
            the Event Configuration step (see MetadataSection) — only the
            posting interval ("By") and the generated posting chips below
            are specific to posting. */}
        <Input
          label="By"
          labelPlacement="inside"
          variant="flat"
          color="default"
          placeholder="75"
          value={scheduleBy}
          onValueChange={setScheduleBy}
          type="number"
          min="1"
          endContent="min"
          isDisabled={!postsEnabled}
          classNames={inputClassNames}
          size="md"
        />
      </div>

      {scheduleChips.length > 0 && (
        <div className={`flex flex-wrap gap-2 mt-4 ${!postsEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
          {scheduleChips.map((chip) => (
            <Chip
              key={chip.id}
              onClose={() => {
                const timeToRemove = chip.time;
                setScheduleChips((prev) => prev.filter((c) => c.id !== chip.id));
                setPostingTimes((prev) => prev.filter((time) => time !== timeToRemove));
              }}
              variant="flat"
              onClick={() => {
                setEditingChipId(chip.id);
                setEditingChipValue(chip.time);
              }}
              className="cursor-pointer bg-accent/20 text-accent"
            >
              {editingChipId === chip.id ? (
                <input
                  type="text"
                  value={editingChipValue}
                  onChange={(e) => setEditingChipValue(e.target.value)}
                  onBlur={() => {
                    const oldTime = scheduleChips.find((current) => current.id === chip.id)?.time;
                    setScheduleChips((prev) =>
                      prev.map((current) =>
                        current.id === chip.id ? { ...current, time: editingChipValue } : current
                      )
                    );
                    if (oldTime) {
                      setPostingTimes((prev) =>
                        prev.map((time) => (time === oldTime ? editingChipValue : time))
                      );
                    }
                    setEditingChipId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const oldTime = scheduleChips.find((current) => current.id === chip.id)?.time;
                      setScheduleChips((prev) =>
                        prev.map((current) =>
                          current.id === chip.id ? { ...current, time: editingChipValue } : current
                        )
                      );
                      if (oldTime) {
                        setPostingTimes((prev) =>
                          prev.map((time) => (time === oldTime ? editingChipValue : time))
                        );
                      }
                      setEditingChipId(null);
                    }
                  }}
                  autoFocus
                  className="bg-transparent outline-none w-16 text-center"
                />
              ) : (
                chip.time
              )}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
