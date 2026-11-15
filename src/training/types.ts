import type { Event } from '@/app/types';
import type { LiteEventDraft } from '@/lib/liteEventStore';
import type { UnitTracking } from '@/lib/unitTracking';

/**
 * CrowdCAD Training (docs/TRAINING.md): modules are data. The player
 * (src/components/training/TrainingPlayer.tsx), the Help search
 * (src/training/help.ts) and the CI checks (src/training/modules.test.ts,
 * tests/e2e/training.spec.ts) all read these same definitions.
 */

export type TrackId = 'start' | 'dispatcher' | 'setup' | 'mci' | 'tak';

export interface TrainingTrack {
  id: TrackId;
  title: string;
  summary: string;
  /** Who it is for, shown on the catalog page. */
  audience: string;
  /** Unreleased features: listed only where preview modules are shown (see `previewModulesShown`). */
  release: 'stable' | 'preview';
}

/**
 * Where a coachmark points: a `data-testid` (preferred, the same ids the
 * e2e tests use) or, prefixed with `css:`, any selector.
 */
export type Anchor = string;

export interface TrainingStep {
  /** Stable within the module; used in `?step=` links and progress. */
  id: string;
  /** Groups steps in the steps menu. Jumping lands on the first step of a section. */
  section: string;
  /** A few words, for the steps menu and Help results. */
  title: string;
  /**
   * The instruction. `{{Term}}` shows the org's word for a dispatch term
   * (src/lib/dispatchVocabulary), `**bold**` is bold, and `` `value` ``
   * is a value to type, shown as a chip.
   */
  body: string;
  /** What the coachmark points at. Unset: the instruction card shows on its own. */
  anchor?: Anchor;
  /** Optional more specific anchor tried first (e.g. a row that may not be rendered yet). */
  anchors?: Anchor[];
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Estimated seconds for a first-timer; module durations are the sum. */
  estSec: number;
  /** Phrases a dispatcher might type into Help to find this step. */
  intents?: string[];
  /**
   * Text this step asks the trainee to type. While the module is locked the
   * write gate (src/training/gate.ts) accepts only these, the seed's own
   * text and earlier steps' values.
   */
  values?: string[];
  /** Done when the event looks like this. Unset (and no `doneWhenVisible`): a read-and-continue step. */
  done?: (event: Event) => boolean;
  /** Done when this anchor is on screen (opening a menu or a modal: no data changes). */
  doneWhenVisible?: Anchor;
  /** The event after this step, done for the trainee ("Do it for me", jumping ahead, CI). */
  apply?: (event: Event) => Event;
  /** Lift the write gate for this step only (e.g. "try a call of your own"). */
  free?: boolean;
  /** Safe as a pointer on a real event's board (Help, "Show me here"): it only points, never needs seed data. */
  liveSafe?: boolean;
}

export interface TrainingModule {
  id: string;
  /** Bump when steps change meaning: progress for older versions is dropped. */
  version: number;
  track: TrackId;
  title: string;
  summary: string;
  release: 'stable' | 'preview';
  /** The board the module starts on: a fresh copy each call. */
  seed: () => LiteEventDraft;
  steps: TrainingStep[];
  /**
   * The step after which the write gate turns off for good and the sandbox is
   * free to practise in. Defaults to the last step: the gate is off once the
   * module is complete.
   */
  unlockAfter?: string;
  /** What to try in free practice, shown once the module is complete. */
  practice: string[];
  /** A scripted position feed (TAK modules). Started when the player mounts. */
  tracking?: TrackingScript;
}

/** A scripted stand-in for TAK: positions as a function of seconds since the module began. */
export interface TrackingScript {
  label: string;
  /** Called every tick with elapsed seconds. */
  at: (elapsedSec: number, event: Event) => UnitTracking;
  tickMs?: number;
}
