/**
 * A phone module on a computer runs inside a same-origin iframe sized like a phone (TrainingPlayer, `embed`),
 * so the page lays out exactly as on a phone, while the step card sits beside the frame. The page in the
 * frame runs the session and posts its state up; the card posts the trainee's presses down.
 */

export interface FrameState {
  type: 'crowdcad-training-state';
  moduleId: string;
  index: number;
  complete: boolean;
  unlocked: boolean;
  rejected: string[] | null;
}

export type FrameCommand =
  | { type: 'crowdcad-training-cmd'; moduleId: string; cmd: 'next' | 'doIt' | 'back' | 'restartSection' | 'dismissRejected' }
  | { type: 'crowdcad-training-cmd'; moduleId: string; cmd: 'jumpTo'; index: number };

export const isFrameState = (data: unknown, moduleId: string): data is FrameState =>
  !!data && typeof data === 'object' && (data as FrameState).type === 'crowdcad-training-state' && (data as FrameState).moduleId === moduleId;

export const isFrameCommand = (data: unknown, moduleId: string): data is FrameCommand =>
  !!data && typeof data === 'object' && (data as FrameCommand).type === 'crowdcad-training-cmd' && (data as FrameCommand).moduleId === moduleId;

/** The phone the frame imitates, in CSS pixels. */
export const PHONE_VIEWPORT = { width: 390, height: 844 };
