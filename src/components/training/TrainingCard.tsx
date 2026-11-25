'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@heroui/react';
import { ChevronDown, ChevronUp, RotateCcw, Undo2, X } from 'lucide-react';
import { useDispatchVocabulary } from '@/hooks/useDispatchVocabulary';
import { visibleModules } from '@/training/registry';
import { plainStepText } from '@/training/text';
import type { TrainingModule } from '@/training/types';
import { stepKind } from '@/training/replay';
import { TRAINING_CARD_Z } from './Coachmark';
import StepText from './StepText';

export interface TrainingCardState {
  index: number;
  complete: boolean;
  unlocked: boolean;
  rejected: string[] | null;
}

export interface TrainingCardActions {
  next(): void;
  doIt(): void;
  back(): void;
  restartSection(): void;
  jumpTo(index: number): void;
}

/**
 * The step card: the current instruction, Next or Do it for me, Back and Restart section, and what to try once
 * the module is complete. `floating` sits in the window's corner over the board; `top` spans the top of a phone
 * screen in the page's flow (above the screen it teaches, clear of the role views' bottom bars); `inline` sits in the page beside a phone frame.
 */
export default function TrainingCard({
  module,
  state,
  actions,
  layout,
  note,
  live,
}: {
  module: TrainingModule;
  state: TrainingCardState;
  actions: TrainingCardActions;
  layout: 'floating' | 'top' | 'inline';
  /** A line under the instruction (e.g. that a module is best on a computer). */
  note?: string;
  /**
   * Help's "Show me" on a live board: the same card, headed "Help · <module>" with a close button, and the
   * given actions in place of Restart section / Do it for me (nothing is done for you on a live event).
   */
  live?: { onClose: () => void; footer: React.ReactNode };
}) {
  const { activePreset } = useDispatchVocabulary();
  const t = useCallback((key: string) => activePreset.terms[key] ?? key, [activePreset]);
  const [minimized, setMinimized] = useState(false);
  const { index, complete } = state;
  const step = module.steps[Math.min(index, module.steps.length - 1)];
  // A new step (or the end) always shows its instruction, even if the card was hidden.
  useEffect(() => setMinimized(false), [index, complete]);
  const kind = stepKind(step);
  const Figure = step.figure;
  const nextModule = useMemo(() => {
    const list = visibleModules();
    return list[list.findIndex((m) => m.id === module.id) + 1];
  }, [module]);

  const position =
    layout === 'floating'
      ? 'fixed bottom-4 right-4 w-[min(380px,calc(100vw-2rem))]'
      : layout === 'top'
        ? 'relative w-full shrink-0 max-h-[40dvh] overflow-y-auto !rounded-none border-x-0'
        : 'relative w-[min(380px,100%)]';

  return (
    <aside
      aria-live="polite"
      data-testid={live ? 'help-live-guide' : 'training-card'}
      data-step-id={complete ? 'complete' : step.id}
      data-gate={state.unlocked || complete ? 'free' : 'guided'}
      // Top layer: pressing the card while a board modal is open must not dismiss that modal and swallow the press.
      data-react-aria-top-layer="true"
      // Above everything, the coachmark's dimmed surround included.
      style={{ zIndex: TRAINING_CARD_Z }}
      className={`pointer-events-auto ${position} rounded-xl border border-surface-liner bg-surface-deep p-4 text-sm text-surface-light shadow-2xl`}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-surface-light/60">
        <span className="truncate">{live ? `Help · ${module.title}` : complete ? 'Complete' : `Step ${index + 1} of ${module.steps.length}`}</span>
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={minimized ? 'Show the step' : 'Hide the step to see the board'}
            aria-expanded={!minimized}
            className="rounded p-1 hover:bg-surface-liner"
            onClick={() => setMinimized((m) => !m)}
            data-testid="training-card-toggle"
          >
            {minimized ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {live ? (
            <button type="button" aria-label="Close help" className="rounded p-1 hover:bg-surface-liner" onClick={live.onClose} data-testid="help-live-close">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Back: undo the last step"
              title="Back: undo the last step"
              disabled={!complete && index === 0}
              className="rounded p-1 hover:bg-surface-liner disabled:pointer-events-none disabled:opacity-30"
              onClick={actions.back}
              data-testid="training-back"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>

      {minimized ? (
        <div className="truncate font-semibold text-surface">{complete ? 'Module complete' : step.title}</div>
      ) : complete ? (
        <div data-testid="training-complete">
          <h2 className="text-base font-semibold text-surface">Module complete</h2>
          <p className="mt-1 text-surface-light/85">You can now try anything on this screen.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-surface-light/85">
            {module.practice.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="flat" startContent={<RotateCcw className="h-3.5 w-3.5" />} onPress={() => actions.jumpTo(0)}>
              Start over
            </Button>
            {nextModule ? (
              <Button as={Link} href={`/training/${nextModule.id}`} target="_top" size="sm" color="primary">
                Next: {nextModule.title}
              </Button>
            ) : (
              <Button as={Link} href="/training" target="_top" size="sm" color="primary">
                All modules
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-base font-semibold text-surface" data-testid="training-step-title">
            {step.title}
          </h2>
          <p className="mt-1 leading-relaxed text-surface-light/90" aria-label={plainStepText(step.body, t)}>
            <StepText text={step.body} t={t} />
          </p>
          {Figure && (
            <div className="mt-2" data-testid="training-step-figure">
              <Figure />
            </div>
          )}
          {note && <p className="mt-2 text-xs text-surface-light/60">{note}</p>}
          {state.rejected && (
            <div role="alert" className="mt-3 rounded-lg border border-status-yellow/50 bg-status-yellow/10 px-3 py-2 text-xs" data-testid="training-gate-nudge">
              Not saved. For now, type only the values shown in this step
              {step.values?.length ? (
                <>
                  {' '}(
                  {step.values.map((v, i) => (
                    <React.Fragment key={v}>
                      {i > 0 && ', '}
                      <code className="font-mono">{v}</code>
                    </React.Fragment>
                  ))}
                  )
                </>
              ) : null}
              . Once you finish the module you can type anything.
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            {live ? (
              live.footer
            ) : (
              <>
                <Button size="sm" variant="light" startContent={<RotateCcw className="h-3.5 w-3.5" />} onPress={actions.restartSection} data-testid="training-restart-section">
                  Restart section
                </Button>
                <Button size="sm" color="primary" onPress={kind === 'read' ? actions.next : actions.doIt} data-testid="training-primary">
                  {kind === 'read' ? 'Next' : 'Do it for me'}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
