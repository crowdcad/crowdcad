'use client';

import React from 'react';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { Check, ListOrdered } from '@/components/ui/icons';
import { sectionsOf } from '@/training/registry';
import { formatDuration } from '@/training/text';
import type { TrainingModule } from '@/training/types';

/**
 * Every section and step of a module. Picking a section restarts there with
 * the board as it would be after the earlier sections, so a trainee can go
 * straight to the part they are struggling with.
 */
export default function StepsMenu({
  module,
  index,
  complete,
  onJump,
}: {
  module: TrainingModule;
  index: number;
  complete: boolean;
  onJump: (index: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const sections = sectionsOf(module);
  return (
    <Popover placement="bottom-end" isOpen={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button size="sm" variant="flat" radius="full" startContent={<ListOrdered className="h-4 w-4" />} data-testid="training-steps-menu">
          Steps
        </Button>
      </PopoverTrigger>
      {/* justify-start: HeroUI centers popover content, which pushes the top of a list taller than the popover out of
          view. The top padding keeps the first section off the popover's edge when it scrolls. */}
      <PopoverContent className="w-[320px] max-h-[min(70vh,calc(100dvh-5rem))] justify-start overflow-y-auto bg-surface-deep px-2 pb-2 pt-3 text-surface-light">
        <ol className="flex w-full flex-col gap-1">
          {sections.map((section, si) => {
            const secs = module.steps.slice(section.start, section.end + 1).reduce((s, x) => s + x.estSec + 10, 0);
            const current = index >= section.start && index <= section.end && !complete;
            return (
              <li key={section.name}>
                <button
                  type="button"
                  data-testid={`training-section-${si + 1}`}
                  onClick={() => {
                    setOpen(false);
                    onJump(section.start);
                  }}
                  className={`flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-liner ${current ? 'bg-surface-liner' : ''}`}
                >
                  <span className="font-semibold">
                    {si + 1}. {section.name}
                  </span>
                  <span className="shrink-0 text-xs text-surface-light/60">{formatDuration(secs)}</span>
                </button>
                <ul className="ml-4 mt-0.5 flex flex-col">
                  {module.steps.slice(section.start, section.end + 1).map((step, k) => {
                    const at = section.start + k;
                    const done = complete || at < index;
                    return (
                      <li
                        key={step.id}
                        className={`flex items-center gap-2 px-2 py-0.5 text-sm ${at === index && !complete ? 'text-surface' : 'text-surface-light/70'}`}
                      >
                        <span className="inline-flex w-4 justify-center">
                          {done ? <Check className="h-3.5 w-3.5 text-status-green" /> : at === index && !complete ? '•' : ''}
                        </span>
                        {step.title}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 w-full border-t border-surface-liner px-2 pt-2 text-xs text-surface-light/60">
          Picking a section starts it over with the board set up for it.
        </p>
      </PopoverContent>
    </Popover>
  );
}
