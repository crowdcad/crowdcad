'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Chip } from '@heroui/react';
import { ArrowLeftRight, Lock, LockOpen, RotateCcw, X } from 'lucide-react';
import DispatchPage from '@/app/(main)/events/[eventId]/dispatch/page';
import { LiteProvider } from '@/lib/LiteContext';
import { useDispatchVocabulary } from '@/hooks/useDispatchVocabulary';
import { sectionsOf, visibleModules } from '@/training/registry';
import { plainStepText } from '@/training/text';
import type { TrainingModule } from '@/training/types';
import { stepKind, useTrainingSession } from '@/training/useTrainingSession';
import Coachmark from './Coachmark';
import StepsMenu from './StepsMenu';
import StepText from './StepText';

/**
 * The dispatch page reads its params with `use()`. A promise already marked
 * fulfilled is read synchronously, so the page never suspends (there is no
 * Suspense boundary around it here).
 */
function fulfilled<T>(value: T): Promise<T> {
  const p = Promise.resolve(value) as Promise<T> & { status?: string; value?: T };
  p.status = 'fulfilled';
  p.value = value;
  return p;
}

/**
 * A training module: the real dispatch board, running as a Lite event on an
 * in-memory store, with a step card and a coachmark guiding the trainee.
 * Nothing on this page reads or writes Firebase, IndexedDB or anything else
 * outside this tab.
 */
export default function TrainingPlayer({ module, startIndex = 0 }: { module: TrainingModule; startIndex?: number }) {
  const { activePreset } = useDispatchVocabulary();
  const t = useCallback((key: string) => activePreset.terms[key] ?? key, [activePreset]);
  const trackingChrome = useMemo(
    () =>
      module.tracking ? (
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-surface-deepest/85 px-3 py-1 text-xs text-surface-light shadow">
          {module.tracking.label}
        </div>
      ) : undefined,
    [module]
  );
  const session = useTrainingSession(module, startIndex, trackingChrome);
  const params = useMemo(() => fulfilled({ eventId: session.eventId }), [session.eventId]);
  const [cardSide, setCardSide] = useState<'left' | 'right'>('right');

  const { step, index, complete } = session;
  const kind = stepKind(step);
  const section = sectionsOf(module).find((s) => index >= s.start && index <= s.end);
  const nextModule = useMemo(() => {
    const list = visibleModules();
    return list[list.findIndex((m) => m.id === module.id) + 1];
  }, [module]);
  const pct = Math.round(((complete ? module.steps.length : index) / module.steps.length) * 100);

  return (
    <div className="flex h-dvh flex-col bg-surface-deepest">
      <header className="z-[300] flex h-14 shrink-0 items-center gap-3 border-b border-surface-liner bg-surface-deep px-4">
        <Link href="/training" className="flex items-center gap-2 text-sm text-surface-light/80 hover:text-surface" data-testid="training-exit">
          <X className="h-4 w-4" />
          <span className="hidden sm:inline">Training</span>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-surface">{module.title}</div>
          <div className="mt-1 h-1 w-full max-w-[320px] overflow-hidden rounded-full bg-surface-liner">
            <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Chip
          size="sm"
          variant="flat"
          startContent={session.unlocked || complete ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          className="hidden md:flex"
          data-testid="training-gate-state"
        >
          {session.unlocked || complete ? 'Free practice' : 'Guided'}
        </Chip>
        <StepsMenu module={module} index={index} complete={complete} onJump={session.jumpTo} />
      </header>

      <div className="relative min-h-0 flex-1">
        <LiteProvider isLiteMode store={session.store} writeGate={session.writeGate} tracking={session.tracking} isTraining>
          <DispatchPage params={params} />
        </LiteProvider>
      </div>

      {!complete && <Coachmark step={step} label={step.title} />}

      <aside
        aria-live="polite"
        data-testid="training-card"
        className={`fixed bottom-4 z-[1100] w-[min(380px,calc(100vw-2rem))] rounded-xl border border-surface-liner bg-surface-deep/95 p-4 text-sm text-surface-light shadow-2xl backdrop-blur ${cardSide === 'right' ? 'right-4' : 'left-4'}`}
      >
        <div className="mb-1 flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-surface-light/60">
          <span>
            {complete ? 'Complete' : `${section?.name ?? ''} · Step ${index + 1} of ${module.steps.length}`}
          </span>
          <button
            type="button"
            aria-label="Move this card to the other side"
            className="rounded p-1 hover:bg-surface-liner"
            onClick={() => setCardSide((s) => (s === 'right' ? 'left' : 'right'))}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {complete ? (
          <div data-testid="training-complete">
            <h2 className="text-base font-semibold text-surface">Module complete</h2>
            <p className="mt-1 text-surface-light/85">
              The board is yours now: type anything, try other features. It still stays in this browser and is gone when you leave.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-surface-light/85">
              {module.practice.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="flat" startContent={<RotateCcw className="h-3.5 w-3.5" />} onPress={() => session.jumpTo(0)}>
                Start over
              </Button>
              {nextModule ? (
                <Button as={Link} href={`/training/${nextModule.id}`} size="sm" color="primary">
                  Next: {nextModule.title}
                </Button>
              ) : (
                <Button as={Link} href="/training" size="sm" color="primary">
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
            {session.rejected && (
              <div role="alert" className="mt-3 rounded-lg border border-status-yellow/50 bg-status-yellow/10 px-3 py-2 text-xs" data-testid="training-gate-nudge">
                That wasn&apos;t saved: while this lesson is guided, the board only takes the values shown in the step
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
                . You can type anything once you finish the module.
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="light"
                startContent={<RotateCcw className="h-3.5 w-3.5" />}
                onPress={session.restartSection}
                data-testid="training-restart-section"
              >
                Restart section
              </Button>
              <Button size="sm" color="primary" onPress={kind === 'read' ? session.next : session.doIt} data-testid="training-primary">
                {kind === 'read' ? 'Next' : 'Do it for me'}
              </Button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
