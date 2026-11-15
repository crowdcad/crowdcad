import type { Event } from '@/app/types';
import { normalizeLiteDraftToEvent, toLiteDraftFromEvent } from '@/lib/liteEventAdapters';
import type { LiteEventDraft } from '@/lib/liteEventStore';
import { allowedText, checkWrite, type GateVerdict } from './gate';
import type { TrainingModule, TrainingStep } from './types';

/** The board at the start of step `index`: the seed with every earlier step done. */
export function boardAtStep(module: TrainingModule, index: number): LiteEventDraft {
  const seed = module.seed();
  let event: Event = normalizeLiteDraftToEvent(seed);
  for (const step of module.steps.slice(0, index)) if (step.apply) event = step.apply(event);
  return toLiteDraftFromEvent(event, seed);
}

/** Whether a step is finished on this board (data steps only). */
export function stepDone(step: TrainingStep, event: Event): boolean {
  return !!step.done && step.done(event);
}

/** read: Next moves on; ui: done when its target appears; data: done when the board matches. */
export type StepKind = 'read' | 'ui' | 'data';
export const stepKind = (step: TrainingStep): StepKind => (step.done ? 'data' : step.doneWhenVisible ? 'ui' : 'read');

/**
 * The write gate's decision for a session: open once the module unlocked or
 * finished, or on a free step; otherwise only the script's text so far.
 */
export function gateVerdict(
  module: TrainingModule,
  state: { index: number; unlocked: boolean; complete: boolean },
  current: Event,
  next: Event
): GateVerdict {
  if (state.unlocked || state.complete || module.steps[state.index]?.free) return { ok: true, rejected: [] };
  const allowed = allowedText(module.steps.slice(0, state.index + 1).flatMap((s) => s.values ?? []));
  return checkWrite(current, next, allowed);
}
