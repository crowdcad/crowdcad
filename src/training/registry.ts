import type { TrainingModule, TrainingTrack, TrackId } from './types';
import callAssignment from './modules/callAssignment';
import clinicPatients from './modules/clinicPatients';
import mciResponse from './modules/mciResponse';
import orientation from './modules/orientation';
import surgeAndLog from './modules/surgeAndLog';
import takLiveTracking from './modules/takLiveTracking';

/**
 * Every training track and module, in catalog order. Adding a module: write
 * it in src/training/modules/ (or beside its feature), add it here, and the
 * catalog, the player, Help and the CI checks all pick it up. See
 * docs/TRAINING.md.
 */

export const TRACKS: TrainingTrack[] = [
  {
    id: 'start',
    title: 'Start here',
    summary: 'A first look around the dispatch board.',
    audience: 'Everyone, before their first shift',
    release: 'stable',
  },
  {
    id: 'dispatcher',
    title: 'Dispatcher essentials',
    summary: 'The calls, teams, clinics and equipment a dispatcher handles on every shift.',
    audience: 'New dispatchers',
    release: 'stable',
  },
  {
    id: 'mci',
    title: 'MCI response',
    summary: 'Declaring a mass casualty incident, counting and moving patients, logistics and role views.',
    audience: 'Dispatchers and supervisors running an MCI',
    release: 'preview',
  },
  {
    id: 'tak',
    title: 'TAK live tracking',
    summary: 'Running an event where teams report their positions from TAK devices.',
    audience: 'Dispatchers and event leads on TAK events',
    release: 'preview',
  },
];

export const MODULES: TrainingModule[] = [orientation, callAssignment, clinicPatients, surgeAndLog, mciResponse, takLiveTracking];

/**
 * Preview (unreleased) modules are shown only with NEXT_PUBLIC_TRAINING_PREVIEW=on
 * or in development. Not tied to NEXT_PUBLIC_TAK: a hosted site may run TAK
 * before its training is ready to be public.
 */
export function previewModulesShown(): boolean {
  return process.env.NEXT_PUBLIC_TRAINING_PREVIEW === 'on' || process.env.NODE_ENV === 'development';
}

export function visibleTracks(): TrainingTrack[] {
  const preview = previewModulesShown();
  return TRACKS.filter((t) => (preview || t.release === 'stable') && visibleModules(t.id).length > 0);
}

export function visibleModules(track?: TrackId): TrainingModule[] {
  const preview = previewModulesShown();
  return MODULES.filter((m) => (!track || m.track === track) && (preview || (m.release === 'stable' && trackOf(m)?.release === 'stable')));
}

export function trackOf(module: TrainingModule): TrainingTrack | undefined {
  return TRACKS.find((t) => t.id === module.track);
}

export function findModule(id: string): TrainingModule | undefined {
  return visibleModules().find((m) => m.id === id);
}

export function moduleSeconds(module: TrainingModule): number {
  return module.steps.reduce((sum, s) => sum + s.estSec, 0);
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
