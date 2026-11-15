/**
 * Training progress, per browser only (localStorage): which steps of which
 * module version a trainee finished. No account and nothing sent anywhere.
 * Every access is guarded: private windows and blocked storage just mean no
 * remembered progress.
 */

const KEY = 'ccad-training-progress';

export interface ModuleProgress {
  version: number;
  done: string[];
  completedAt?: number;
}

export type TrainingProgress = Record<string, ModuleProgress>;

const listeners = new Set<() => void>();

export function readProgress(): TrainingProgress {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as TrainingProgress) : {};
  } catch {
    return {};
  }
}

function write(progress: TrainingProgress) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Storage unavailable: progress just isn't remembered.
  }
  for (const cb of listeners) cb();
}

/** Progress for a module, or none when it was for an older version of it. */
export function moduleProgress(progress: TrainingProgress, moduleId: string, version: number): ModuleProgress | null {
  const p = progress[moduleId];
  return p && p.version === version ? p : null;
}

export function markStepDone(moduleId: string, version: number, stepId: string) {
  const progress = readProgress();
  const current = moduleProgress(progress, moduleId, version) ?? { version, done: [] };
  if (current.done.includes(stepId)) return;
  write({ ...progress, [moduleId]: { ...current, done: [...current.done, stepId] } });
}

export function markModuleComplete(moduleId: string, version: number, stepIds: string[]) {
  const progress = readProgress();
  const current = moduleProgress(progress, moduleId, version) ?? { version, done: [] };
  write({
    ...progress,
    [moduleId]: { version, done: [...new Set([...current.done, ...stepIds])], completedAt: current.completedAt ?? Date.now() },
  });
}

export function resetProgress(moduleId?: string) {
  if (!moduleId) return write({});
  const progress = readProgress();
  delete progress[moduleId];
  write(progress);
}

export function onProgressChange(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}
