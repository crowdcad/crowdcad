import type { TrainingModule, TrainingTrack, TrackId } from './types';
import callAssignment from './modules/callAssignment';
import clinicPatients from './modules/clinicPatients';
import equipmentDelivery from './modules/equipmentDelivery';
import mobileTour from './modules/mobileTour';
import orientation from './modules/orientation';
import surgeAndLog from './modules/surgeAndLog';
import { extensions } from '@/extensions';

/**
 * Every training track and module, in catalog order. Adding a module: write
 * it in src/training/modules/ (or beside its feature), add it here, and the
 * catalog, the player, Help and the CI checks all pick it up. See
 * docs/TRAINING.md.
 */

/** Every track: the built-in ones, then extension packs' (read when needed: packs install after modules load). */
export function allTracks(): TrainingTrack[] {
  return [
  {
    id: 'dispatcher',
    title: 'Basic Dispatch Features',
    summary: 'The layout, calls, helper teams, clinic patients, surge, the log and dispatching from a phone.',
    release: 'stable',
  },
  ...extensions.flatMap((x) => x.training?.tracks ?? []),
  ];
}

// Basic Dispatch Features, in order. Still to build: "Posting schedules", between clinic patients and surge
// (docs/TRAINING.md, "To do").
/** Every module, in catalog order: the built-in ones, then extension packs'. */
export function allModules(): TrainingModule[] {
  return [
  orientation,
  callAssignment,
  equipmentDelivery,
  clinicPatients,
  surgeAndLog,
  mobileTour,
  ...extensions.flatMap((x) => x.training?.modules ?? []),
  ];
}

/**
 * Preview (unreleased) modules are shown only with NEXT_PUBLIC_TRAINING_PREVIEW=on
 * or in development, separately from any feature's own build flag.
 */
export function previewModulesShown(): boolean {
  return process.env.NEXT_PUBLIC_TRAINING_PREVIEW === 'on' || process.env.NODE_ENV === 'development';
}

export function visibleTracks(): TrainingTrack[] {
  const preview = previewModulesShown();
  return allTracks().filter((t) => (preview || t.release === 'stable') && visibleModules(t.id).length > 0);
}

export function visibleModules(track?: TrackId): TrainingModule[] {
  const preview = previewModulesShown();
  return allModules().filter((m) => (!track || m.track === track) && (preview || (m.release === 'stable' && trackOf(m)?.release === 'stable')));
}

export function trackOf(module: TrainingModule): TrainingTrack | undefined {
  return allTracks().find((t) => t.id === module.track);
}

export function findModule(id: string): TrainingModule | undefined {
  return visibleModules().find((m) => m.id === id);
}

/** Reading the step card, on top of each step's own estimate. */
const READ_SEC_PER_STEP = 10;

export function moduleSeconds(module: TrainingModule): number {
  return module.steps.reduce((sum, s) => sum + s.estSec + READ_SEC_PER_STEP, 0);
}

export function trackSeconds(track: TrackId): number {
  return visibleModules(track).reduce((sum, m) => sum + moduleSeconds(m), 0);
}

/** Section names in order, each with the index of its first step. */
export function sectionsOf(module: TrainingModule): { name: string; start: number; end: number }[] {
  const out: { name: string; start: number; end: number }[] = [];
  module.steps.forEach((step, i) => {
    const last = out[out.length - 1];
    if (last && last.name === step.section) last.end = i;
    else out.push({ name: step.section, start: i, end: i });
  });
  return out;
}

/** Index of the step after which the gate turns off. */
export function unlockIndex(module: TrainingModule): number {
  const i = module.unlockAfter ? module.steps.findIndex((s) => s.id === module.unlockAfter) : -1;
  return i >= 0 ? i : module.steps.length - 1;
}

/** A module's number in the catalog ("Module 3"): its place among the visible modules. */
export function moduleNumber(module: TrainingModule): number {
  return visibleModules().findIndex((m) => m.id === module.id) + 1;
}
