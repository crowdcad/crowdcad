// Review-step summaries and step navigation shared by the cloud and Lite
// event-creation wizards.

import type { Time } from '@internationalized/date';
import { formatTimeValue } from '@/lib/scheduleUtils';
import { formatEventDate } from '@/lib/eventDate';
import type { ReviewField } from './ReviewColumns';

/** "1 team", "3 teams". */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** m:ss for the unassigned-call surge threshold (defaults to 2:00). */
function formatSurgeSeconds(seconds: number | undefined): string {
  const total = seconds ?? 120;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Fields for the "Event Configuration" review column. `venueName` is omitted in Lite (no venues). */
export function eventConfigReviewFields(opts: {
  name?: string;
  venueName?: string | null;
  includeVenue?: boolean;
  date?: string;
  scheduleFrom: Time;
  scheduleTo: Time;
  surgeLimitPercent?: number;
  pendingTransportSurgeThreshold?: number;
  unassignedCallSurgeSeconds?: number;
}): ReviewField[] {
  return [
    { label: 'Event name', value: opts.name?.trim() || '(untitled)' },
    ...(opts.includeVenue ? [{ label: 'Venue', value: opts.venueName || '(none)' }] : []),
    { label: 'Date', value: formatEventDate(opts.date, '—') },
    { label: 'Start / End time', value: `${formatTimeValue(opts.scheduleFrom)} – ${formatTimeValue(opts.scheduleTo)}` },
    { label: 'Surge limit', value: `${opts.surgeLimitPercent ?? 70}%` },
    { label: 'Pending transport surge', value: `${opts.pendingTransportSurgeThreshold ?? 3} patients` },
    { label: 'Unassigned call surge', value: formatSurgeSeconds(opts.unassignedCallSurgeSeconds) },
  ];
}

export function staffReviewFields(teamCount: number, supervisorCount: number): ReviewField[] {
  return [
    { label: 'Teams', value: countLabel(teamCount, 'team') },
    { label: 'Supervisors', value: countLabel(supervisorCount, 'supervisor') },
  ];
}

export function postScheduleReviewValue(postsEnabled: boolean, postCount: number, repostTimeCount: number): string {
  return postsEnabled
    ? `${countLabel(postCount, 'post')} · ${countLabel(repostTimeCount, 'repost time')}`
    : 'Not enabled';
}

/** Back/next over an ordered list of step ids. */
export function getStepNavigation<T extends string>(
  stepOrder: readonly T[],
  currentStepId: string,
  setCurrentStepId: (id: T) => void
) {
  const stepIdx = stepOrder.indexOf(currentStepId as T);
  return {
    isFirstStep: stepIdx <= 0,
    isLastStep: stepIdx === stepOrder.length - 1,
    goNext: () => {
      if (stepIdx >= 0 && stepIdx < stepOrder.length - 1) setCurrentStepId(stepOrder[stepIdx + 1]);
    },
    goBack: () => {
      if (stepIdx > 0) setCurrentStepId(stepOrder[stepIdx - 1]);
    },
  };
}
