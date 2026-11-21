'use client';

import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import DispatchPage from '@/app/(main)/events/[eventId]/dispatch/page';
import { LiteProvider, type LiteTrackingFeed } from '@/lib/LiteContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { firstOf, withMember } from '@/extensions';
import { isFrameCommand, isFrameState, PHONE_VIEWPORT, type FrameCommand, type FrameState } from '@/training/frameBridge';
import type { TrainingModule } from '@/training/types';
import { useTrainingSession, type TrainingSession } from '@/training/useTrainingSession';
import Coachmark from './Coachmark';
import HelpButton from './HelpButton';
import StepsMenu from './StepsMenu';
import TrainingCard, { type TrainingCardActions, type TrainingCardState } from './TrainingCard';

// From extension packs: a map panel on practice data, the view a `surface` module shows, and wrappers (e.g. practice logins).
const trackingPanel = () => firstOf((x) => x.training?.TrackingPanel);
const practiceSurface = () => firstOf((x) => x.training?.PracticeSurface);

function ExtensionProviders({ children }: { children: React.ReactNode }) {
  const providers = withMember('training').flatMap((x) => (x.training.Provider ? [x.training.Provider] : []));
  return providers.reduceRight<React.ReactNode>((inner, Provider, i) => <Provider key={i}>{inner}</Provider>, <Fragment>{children}</Fragment>);
}

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

/** The bar above every module: back to the catalog, the title with a progress bar, the steps menu and Help. */
function PlayerHeader({ module, index, complete, onJump }: { module: TrainingModule; index: number; complete: boolean; onJump: (index: number) => void }) {
  const pct = Math.round(((complete ? module.steps.length : index) / module.steps.length) * 100);
  return (
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
      <StepsMenu module={module} index={index} complete={complete} onJump={onJump} />
      <HelpButton />
    </header>
  );
}

const cardState = (s: TrainingSession): TrainingCardState => ({ index: s.index, complete: s.complete, unlocked: s.unlocked, rejected: s.rejected });

/**
 * A training module: the real dispatch interface (or, for a `surface` module, an extension pack's practice view), running
 * as a Lite event on an in-memory store, with a step card and a coachmark guiding the trainee. Nothing on this
 * page reads or writes Firebase, IndexedDB or anything else outside this tab.
 *
 * A phone module (`device: 'phone'`) opened on a computer shows a phone-sized frame holding the same module
 * (`embed`), with the step card beside it; see src/training/frameBridge.ts.
 */
export default function TrainingPlayer({ module, startIndex = 0, embed = false }: { module: TrainingModule; startIndex?: number; embed?: boolean }) {
  // Whether this window is wider than a phone: decided once mounted, so a phone never loads the frame first.
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => setWide(window.innerWidth >= 700), []);
  if (module.device === 'phone' && !embed) {
    if (wide === null) return <div className="h-dvh bg-surface-deepest" />;
    if (wide) return <FramedPlayer module={module} startIndex={startIndex} />;
  }
  return <LivePlayer module={module} startIndex={startIndex} embed={embed} />;
}

function LivePlayer({ module, startIndex, embed }: { module: TrainingModule; startIndex: number; embed: boolean }) {
  // Over the map on a module with a tracking feed: a badge saying the positions are practice ones, and, when the
  // TAK module is compiled in, its real map panel on practice data.
  const trackingChrome = useMemo<LiteTrackingFeed['chrome']>(() => {
    const script = module.tracking;
    if (!script) return undefined;
    const badge = (
      <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-surface-deepest/85 px-3 py-1 text-xs text-surface-light shadow">
        {script.label}
      </div>
    );
    const Panel = script.panel ? trackingPanel() : null;
    if (!Panel) return badge;
    return function TrainingTrackingChrome(ctx) {
      return (
        <>
          {badge}
          <Panel event={ctx.event} layers={ctx.layers} tracking={ctx.tracking} />
        </>
      );
    };
  }, [module]);
  const session = useTrainingSession(module, startIndex, trackingChrome);
  const params = useMemo(() => fulfilled({ eventId: session.eventId }), [session.eventId]);
  const isMobile = useIsMobile();

  // In a phone frame: post the state to the card beside the frame and take its presses.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const { index, complete, unlocked, rejected } = session;
  useEffect(() => {
    if (!embed || window.parent === window) return;
    const msg: FrameState = { type: 'crowdcad-training-state', moduleId: module.id, index, complete, unlocked, rejected };
    window.parent.postMessage(msg, window.location.origin);
  }, [embed, module.id, index, complete, unlocked, rejected]);
  useEffect(() => {
    if (!embed) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !isFrameCommand(e.data, module.id)) return;
      const s = sessionRef.current;
      const c = e.data;
      if (c.cmd === 'jumpTo') s.jumpTo(c.index);
      else if (c.cmd === 'dismissRejected') s.dismissRejected();
      else s[c.cmd]();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [embed, module.id]);

  const PracticeSurfaceView = practiceSurface();
  const phone = module.device === 'phone';
  const phoneDirect = phone && isMobile;
  return (
    <div className="flex h-dvh flex-col bg-surface-deepest">
      {!embed && <PlayerHeader module={module} index={index} complete={complete} onJump={session.jumpTo} />}
      {/* On a phone, a phone module's card sits above the screen, in the page, so it never covers a bottom bar. */}
      {!embed && phoneDirect && <TrainingCard module={module} state={cardState(session)} actions={session} layout="top" />}

      <div className={`relative min-h-0 flex-1 ${module.surface ? "overflow-y-auto" : ""}`}>
        <ExtensionProviders>
          {module.surface && PracticeSurfaceView ? (
            <PracticeSurfaceView module={module} store={session.store} eventId={session.eventId} />
          ) : (
            <LiteProvider isLiteMode store={session.store} writeGate={session.writeGate} tracking={session.tracking} isTraining>
              <DispatchPage params={params} />
            </LiteProvider>
          )}
        </ExtensionProviders>
      </div>

      {!complete && <Coachmark step={session.step} label={session.step.title} />}

      {!embed && !phoneDirect && (
        <TrainingCard
          module={module}
          state={cardState(session)}
          actions={session}
          layout="floating"
          note={isMobile && !phone ? "Best on a computer: the board's phone layout hides some of the controls these steps point at." : undefined}
        />
      )}
    </div>
  );
}

/** A phone module on a computer: the module in a phone-sized frame, the step card beside it. */
function FramedPlayer({ module, startIndex }: { module: TrainingModule; startIndex: number }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<TrainingCardState>({ index: startIndex, complete: false, unlocked: false, rejected: null });
  // The card waits for the frame's first state: a press before the frame listens would be lost.
  const [ready, setReady] = useState(false);
  // The frame's height follows the window, up to a tall phone's.
  const [height, setHeight] = useState(PHONE_VIEWPORT.height);
  useEffect(() => {
    const fit = () => setHeight(Math.max(560, Math.min(PHONE_VIEWPORT.height, window.innerHeight - 56 - 48)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !isFrameState(e.data, module.id)) return;
      const { index, complete, unlocked, rejected } = e.data;
      setState({ index, complete, unlocked, rejected });
      setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [module.id]);

  const actions = useMemo<TrainingCardActions>(() => {
    const send = (cmd: FrameCommand) => frameRef.current?.contentWindow?.postMessage(cmd, window.location.origin);
    const base = { type: 'crowdcad-training-cmd' as const, moduleId: module.id };
    return {
      next: () => send({ ...base, cmd: 'next' }),
      doIt: () => send({ ...base, cmd: 'doIt' }),
      back: () => send({ ...base, cmd: 'back' }),
      restartSection: () => send({ ...base, cmd: 'restartSection' }),
      jumpTo: (index: number) => send({ ...base, cmd: 'jumpTo', index }),
    };
  }, [module.id]);

  return (
    <div className="flex h-dvh flex-col bg-surface-deepest">
      <PlayerHeader module={module} index={state.index} complete={state.complete} onJump={actions.jumpTo} />
      <div className="flex min-h-0 flex-1 items-center justify-center gap-8 overflow-auto p-6">
        <div className="shrink-0 rounded-[2.75rem] border-[10px] border-surface-liner bg-black p-0 shadow-2xl" data-testid="training-phone-frame">
          <iframe
            ref={frameRef}
            title={`${module.title} on a phone`}
            src={`/training/${module.id}?embed=phone&step=${startIndex + 1}`}
            style={{ width: PHONE_VIEWPORT.width, height }}
            className="block rounded-[2rem] bg-surface-deepest"
            data-testid="training-phone-iframe"
          />
        </div>
        {ready ? (
          <TrainingCard module={module} state={state} actions={actions} layout="inline" />
        ) : (
          <div className="w-[min(380px,100%)] text-sm text-surface-light/60">Loading the phone…</div>
        )}
      </div>
    </div>
  );
}
