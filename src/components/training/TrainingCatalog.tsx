'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Clock, PlayCircle } from 'lucide-react';
import { moduleProgress, onProgressChange, readProgress, resetProgress, type TrainingProgress } from '@/training/progress';
import { moduleNumber, moduleSeconds, previewModulesShown, sectionsOf, trackSeconds, visibleModules, visibleTracks } from '@/training/registry';
import { formatDuration } from '@/training/text';
import type { TrainingModule } from '@/training/types';

/**
 * The /training catalog: tracks in order, each module with its estimated
 * time, its sections and this browser's progress.
 */

function useProgress(): TrainingProgress {
  const [progress, setProgress] = useState<TrainingProgress>({});
  useEffect(() => {
    setProgress(readProgress());
    return onProgressChange(() => setProgress(readProgress()));
  }, []);
  return progress;
}

function ModuleCard({ module, progress }: { module: TrainingModule; progress: TrainingProgress }) {
  const p = moduleProgress(progress, module.id, module.version);
  const done = !!p?.completedAt;
  const started = !done && !!p?.done.length;
  const pct = p ? Math.round((p.done.length / module.steps.length) * 100) : 0;
  return (
    <Link
      href={`/training/${module.id}`}
      data-testid={`training-module-${module.id}`}
      className="group flex flex-col gap-2 border border-surface-liner bg-surface-deep p-4 transition-colors hover:border-accent/60 hover:bg-surface-liner/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-surface-light/60">Module {moduleNumber(module)}</div>
          <h3 className="text-base font-semibold text-surface group-hover:text-accent">{module.title}</h3>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs text-surface-light/70">
          <Clock className="h-3.5 w-3.5" />
          {formatDuration(moduleSeconds(module))}
        </span>
      </div>
      <p className="text-sm text-surface-light/85">{module.summary}</p>
      <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-surface-light/60">
        {sectionsOf(module).map((s, i) => (
          <li key={s.name}>
            {i + 1}. {s.name}
          </li>
        ))}
      </ol>
      <div className="mt-auto flex items-center justify-between pt-1 text-xs">
        {done ? (
          <span className="flex items-center gap-1 text-status-green">
            <Check className="h-3.5 w-3.5" /> Completed
          </span>
        ) : started ? (
          <span className="flex items-center gap-2 text-surface-light/80">
            <span className="h-1 w-20 overflow-hidden rounded-full bg-surface-liner">
              <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
            </span>
            {pct}%
          </span>
        ) : (
          <span className="text-surface-light/60">Not started</span>
        )}
        <span className="flex items-center gap-1 text-accent">
          <PlayCircle className="h-4 w-4" /> {done ? 'Practice again' : started ? 'Continue' : 'Start'}
        </span>
      </div>
      {module.release === 'preview' && <span className="self-start rounded bg-status-yellow/20 px-1.5 py-0.5 text-[11px] text-surface">Preview</span>}
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
        <p className="text-xs uppercase tracking-widest text-accent">CrowdCAD Training</p>
        <h1 className="mt-2 text-3xl font-bold text-surface">Learn the dispatch board by using it</h1>
        <p className="mt-3 max-w-[720px] text-surface-light/85">
          Each module opens the real dispatch board with practice data and walks you through one task, step by step.
          Start at the top, or jump to what you need.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-surface-light/75">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> {formatDuration(totalSec)} in all
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
              <div className="mt-4 grid grid-cols-1 gap-px md:grid-cols-2">
                {modules.map((m) => (
                  <ModuleCard key={m.id} module={m} progress={progress} />
                ))}
              </div>
            </section>
          );
        })}

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-surface-liner pt-4 text-xs text-surface-light/60">
          <span>{previewModulesShown() ? 'Preview modules cover features that are not released yet.' : ''}</span>
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
