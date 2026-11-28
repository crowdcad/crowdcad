'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Clock } from '@/components/ui/icons';
import { moduleProgress, onProgressChange, readProgress, resetProgress, type TrainingProgress } from '@/training/progress';
import { moduleNumber, moduleSeconds, previewModulesShown, trackSeconds, visibleModules, visibleTracks } from '@/training/registry';
import { formatDuration } from '@/training/text';
import type { TrainingModule } from '@/training/types';

/**
 * The /training catalog: tracks in order, each module one row with its
 * estimated time and this browser's progress.
 */

function useProgress(): TrainingProgress {
  const [progress, setProgress] = useState<TrainingProgress>({});
  useEffect(() => {
    setProgress(readProgress());
    return onProgressChange(() => setProgress(readProgress()));
  }, []);
  return progress;
}

/** A checkbox whose ring fills as steps are done, and turns into a check when the module is complete. */
function ProgressCheck({ done, total, complete }: { done: number; total: number; complete: boolean }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const frac = complete ? 1 : total ? Math.min(1, done / total) : 0;
  const label = complete ? 'Completed' : `${done} of ${total} steps done`;
  return (
    <span role="img" aria-label={label} title={label} className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center" data-testid="training-progress-check">
      <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2.5" className="stroke-surface-liner" />
        {frac > 0 && (
          <circle
            cx="12"
            cy="12"
            r={r}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - frac)}
            className={complete ? 'stroke-status-green' : 'stroke-accent'}
          />
        )}
      </svg>
      {complete && <Check className="absolute h-3.5 w-3.5 text-status-green" strokeWidth={3} />}
    </span>
  );
}

function ModuleRow({ module, progress }: { module: TrainingModule; progress: TrainingProgress }) {
  const p = moduleProgress(progress, module.id, module.version);
  const complete = !!p?.completedAt;
  return (
    <Link
      href={`/training/${module.id}`}
      data-testid={`training-module-${module.id}`}
      className="group flex items-center gap-4 border border-surface-liner bg-surface-deep px-4 py-3 transition-colors hover:border-accent/60 hover:bg-surface-liner/40"
    >
      <ProgressCheck done={p?.done.length ?? 0} total={module.steps.length} complete={complete} />
      <div className="min-w-0 flex-1">
        <span className="mr-2 text-xs text-surface-light/60">Module {moduleNumber(module)}</span>
        <span className="font-semibold text-surface group-hover:text-accent">{module.title}</span>
        {module.release === 'preview' && <span className="ml-2 rounded bg-status-yellow/20 px-1.5 py-0.5 text-[11px] text-surface">Preview</span>}
      </div>
      <span className="flex shrink-0 items-center gap-1 text-xs text-surface-light/70">
        <Clock className="h-3.5 w-3.5" />
        {formatDuration(moduleSeconds(module))}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-surface-light/50 group-hover:text-accent" />
    </Link>
  );
}

export default function TrainingCatalog() {
  const progress = useProgress();
  const tracks = visibleTracks();
  const all = visibleModules();
  const completed = all.filter((m) => moduleProgress(progress, m.id, m.version)?.completedAt).length;
  const totalSec = all.reduce((s, m) => s + moduleSeconds(m), 0);

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-surface-deepest text-surface-light">
      <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold text-surface">Learn the dispatch interface by using it</h1>
        <p className="mt-3 max-w-[720px] text-surface-light/85">
          Learn to use the dispatch interface with practice data, step by step. These interactive instructions can also be
          accessed during a live event using the help button.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-surface-light/75">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> {formatDuration(totalSec)} total
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4" /> {completed} of {all.length} completed
          </span>
        </div>

        {tracks.map((track, ti) => {
          const modules = visibleModules(track.id);
          return (
            <section key={track.id} className="mt-10" data-testid={`training-track-${track.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-surface-liner pb-2">
                <h2 className="text-xl font-semibold text-surface">
                  {ti + 1}. {track.title}
                  {track.release === 'preview' && <span className="ml-2 align-middle text-xs font-normal text-status-yellow">Preview</span>}
                </h2>
                <span className="text-sm text-surface-light/70">
                  {modules.length} {modules.length === 1 ? 'module' : 'modules'} · {formatDuration(trackSeconds(track.id))}
                </span>
              </div>
              <p className="mt-2 text-sm text-surface-light/80">{track.summary}</p>
              <div className="mt-4 flex flex-col gap-px">
                {modules.map((m) => (
                  <ModuleRow key={m.id} module={m} progress={progress} />
                ))}
              </div>
            </section>
          );
        })}

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-surface-liner pt-4 text-xs text-surface-light/60">
          <span>{previewModulesShown() && all.some((m) => m.release === 'preview') ? 'Preview modules cover features that are not released yet.' : ''}</span>
          {completed > 0 && (
            <button type="button" className="hover:text-surface" onClick={() => resetProgress()}>
              Reset my progress
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
