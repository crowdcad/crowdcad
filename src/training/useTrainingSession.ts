'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LiteTrackingFeed, LiteWriteGate } from '@/lib/LiteContext';
import { normalizeLiteDraftToEvent, toLiteDraftFromEvent } from '@/lib/liteEventAdapters';
import type { UnitTracking } from '@/lib/unitTracking';
import { clickSequence, findAnchor, findStepTarget, pressElement } from './anchors';
import { createMemoryLiteStore, type MemoryLiteStore } from './memoryStore';
import { boardAtStep, gateVerdict, stepDone, stepKind } from './replay';
import { markModuleComplete, markStepDone } from './progress';
import { sectionsOf, unlockIndex } from './registry';
import type { TrainingModule, TrainingStep } from './types';

/**
 * One trainee's run through a module: which step they are on, whether the
 * write gate is still locked, and the in-memory board they practise on.
 */

export { boardAtStep, stepDone, stepKind, type StepKind } from './replay';

/** Closes any open modal or menu (HeroUI listens for Escape) before the board changes underneath it. */
function closeOverlays() {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

export interface TrainingSession {
  store: MemoryLiteStore;
  eventId: string;
  index: number;
  step: TrainingStep;
  /** True once every step is done: the module is complete. */
  complete: boolean;
  /** The gate is off for good (past the module's unlock step). */
  unlocked: boolean;
  /** Text the gate just turned away, for the nudge. Cleared on the next step. */
  rejected: string[] | null;
  writeGate: LiteWriteGate;
  tracking?: LiteTrackingFeed;
  next(): void;
  /** Start the current section over, with its board reset. */
  restartSection(): void;
  /** Do the current step for the trainee. */
  doIt(): void;
  /** Restart at the first step of a section (or of the module), with the board as it would be there. */
  jumpTo(index: number): void;
  dismissRejected(): void;
}

export function useTrainingSession(module: TrainingModule, startIndex = 0, trackingChrome?: LiteTrackingFeed['chrome']): TrainingSession {
  // A deep link lands on the start of its step's section, where the board is set up for it.
  const requested = Math.max(0, Math.min(startIndex, module.steps.length - 1));
  const start = sectionsOf(module).find((sec) => requested >= sec.start && requested <= sec.end)?.start ?? 0;
  const eventId = module.seed().id;
  const [store] = useState(() => createMemoryLiteStore(boardAtStep(module, start)));
  const [index, setIndex] = useState(start);
  const [complete, setComplete] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [rejected, setRejected] = useState<string[] | null>(null);

  const step = module.steps[Math.min(index, module.steps.length - 1)];

  // Refs so the gate and listeners (handed to the page once) always see the latest state.
  const stateRef = useRef({ index, unlocked, complete });
  stateRef.current = { index, unlocked, complete };

  const finishStep = useCallback(
    (at: number) => {
      const s = module.steps[at];
      if (!s || stateRef.current.index !== at) return;
      markStepDone(module.id, module.version, s.id);
      setRejected(null);
      if (at >= unlockIndex(module)) setUnlocked(true);
      if (at >= module.steps.length - 1) {
        markModuleComplete(module.id, module.version, module.steps.map((x) => x.id));
        setComplete(true);
        return;
      }
      setIndex(at + 1);
    },
    [module]
  );

  // Data steps: done when the board says so.
  useEffect(
    () =>
      store.listen((draft) => {
        const { index: at, complete: done } = stateRef.current;
        if (done) return;
        const s = module.steps[at];
        if (s && stepDone(s, normalizeLiteDraftToEvent(draft))) finishStep(at);
      }),
    [store, module, finishStep]
  );

  // UI steps: done when their anchor shows up (a modal or menu opened).
  useEffect(() => {
    if (complete || !step.doneWhenVisible) return;
    const target = step.doneWhenVisible;
    const at = index;
    const id = window.setInterval(() => {
      if (findAnchor(target)) finishStep(at);
    }, 250);
    return () => window.clearInterval(id);
  }, [step, index, complete, finishStep]);

  // Data steps already true when reached (e.g. after Back): move on.
  useEffect(() => {
    if (complete) return;
    const draft = store.peek(eventId);
    if (draft && stepDone(step, normalizeLiteDraftToEvent(draft))) finishStep(index);
  }, [step, index, complete, store, eventId, finishStep]);

  const writeGate = useCallback<LiteWriteGate>(
    (current, next) => {
      const verdict = gateVerdict(module, stateRef.current, current, next);
      if (!verdict.ok) {
        setRejected(verdict.rejected);
        // For whoever maintains a module: the text the gate turned away (src/training/gate.ts SYSTEM_TEXT).
        if (process.env.NODE_ENV !== 'production') console.info('[training] write gate turned away:', verdict.rejected);
      }
      return verdict.ok;
    },
    [module]
  );

  const jumpTo = useCallback(
    (target: number) => {
      const sectionStart = sectionsOf(module).find((s) => target >= s.start && target <= s.end)?.start ?? 0;
      closeOverlays();
      store.put(boardAtStep(module, sectionStart));
      setRejected(null);
      setComplete(false);
      setIndex(sectionStart);
    },
    [module, store]
  );

  const next = useCallback(() => {
    if (stepKind(step) === 'read') finishStep(index);
    else if (index < module.steps.length - 1) setIndex(index + 1);
  }, [step, index, module, finishStep]);

  const restartSection = useCallback(() => jumpTo(index), [jumpTo, index]);

  const doIt = useCallback(() => {
    const kind = stepKind(step);
    if (kind === 'read') return finishStep(index);
    if (kind === 'ui') {
      // Click what the step asks for; the step finishes when its target opens.
      if (step.doClicks) {
        void clickSequence(step.doClicks);
        return;
      }
      const target = findStepTarget(step);
      if (target) pressElement(target);
      return;
    }
    const draft = store.peek(eventId);
    if (!draft || !step.apply) return;
    closeOverlays();
    // Let the modal close before the board changes under it.
    window.setTimeout(() => {
      const latest = store.peek(eventId) ?? draft;
      store.put(toLiteDraftFromEvent(step.apply!(normalizeLiteDraftToEvent(latest)), latest));
    }, 50);
  }, [step, index, store, eventId, finishStep]);

  const tracking = useMemo<LiteTrackingFeed | undefined>(() => {
    const script = module.tracking;
    if (!script) return undefined;
    return {
      chrome: trackingChrome,
      subscribe(onTracking: (t: UnitTracking | null) => void) {
        const began = Date.now();
        const tick = () => {
          const draft = store.peek(eventId);
          if (draft) onTracking(script.at((Date.now() - began) / 1000, normalizeLiteDraftToEvent(draft)));
        };
        tick();
        const id = window.setInterval(tick, script.tickMs ?? 2000);
        return () => window.clearInterval(id);
      },
    };
  }, [module, store, eventId, trackingChrome]);

  return {
    store,
    eventId,
    index,
    step,
    complete,
    unlocked,
    rejected,
    writeGate,
    tracking,
    next,
    restartSection,
    doIt,
    jumpTo,
    dismissRejected: () => setRejected(null),
  };
}
