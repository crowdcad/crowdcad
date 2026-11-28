import { hhmmOf } from '@/lib/clock';
// Posting-schedule time helpers. Posting times are stored as "HHmm" (or
// occasionally "HH:mm") strings on event.postingTimes.

/**
 * Whether the event uses posts: event creation's "Enable Posts" generates a
 * posting schedule, and that schedule is the only record of the choice. Lite
 * events also store it as postingScheduleEnabled.
 */
export function hasPostingSchedule(event: { postingTimes?: string[]; postingScheduleEnabled?: boolean } | null | undefined): boolean {
  return event?.postingScheduleEnabled ?? (event?.postingTimes?.length ?? 0) > 0;
}

/** Minutes since midnight for "HH:mm" or "HHmm" (3-digit values are zero-padded), or null if invalid. */
export function parseTimeToMinutes(timeStr: string): number | null {
  if (timeStr.includes(':')) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (!isNaN(hours) && !isNaN(minutes)) return hours * 60 + minutes;
  }

  const cleanTime = timeStr.padStart(4, '0');
  const hours = parseInt(cleanTime.substring(0, 2));
  const minutes = parseInt(cleanTime.substring(2, 4));
  if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
    return hours * 60 + minutes;
  }
  return null;
}

/** "HHmm" for the given moment. */
export function toHHmm(date: Date): string {
  return hhmmOf(date);
}

function sortedValidTimes(times: string[]) {
  return times
    .map(time => ({ time, minutes: parseTimeToMinutes(time) }))
    .filter((t): t is { time: string; minutes: number } => t.minutes !== null)
    .sort((a, b) => a.minutes - b.minutes);
}

/**
 * The posting time whose shift is in effect at `now`: the most recent time
 * that has already passed today, or — before the first time of the day — the
 * first one. Once every time today has passed, the first time (tomorrow's
 * first shift) is highlighted instead of the last.
 */
export function getActivePostingTime(postingTimes: string[] | undefined, now: Date = new Date()): string | null {
  const valid = sortedValidTimes(postingTimes || []);
  if (valid.length === 0) return null;

  const currentMins = now.getHours() * 60 + now.getMinutes();
  const last = valid[valid.length - 1];
  if (currentMins > last.minutes) return valid[0].time;

  let active = valid[0].time;
  for (const t of valid) {
    if (currentMins >= t.minutes) active = t.time;
  }
  return active;
}

export interface TeamPostSlot {
  time: string;
  /** The next posting time, where this one's shift ends (none for the last). */
  until?: string;
  post: string | null;
}

/** A team's post for each posting time, in time order (D66). */
export function teamPostSlots(event: { postingTimes?: string[]; postAssignments?: Record<string, Record<string, string>> }, team: string): TeamPostSlot[] {
  const times = sortedValidTimes(event.postingTimes || []).map((t) => t.time);
  return times.map((time, i) => {
    const slot = event.postAssignments?.[time] || {};
    return { time, until: times[i + 1], post: Object.keys(slot).find((p) => slot[p] === team) ?? null };
  });
}

/** The slot running at `minutes` past midnight (none before the schedule starts), and the one after it. */
export function currentPostSlot(slots: TeamPostSlot[], minutes: number): { current: TeamPostSlot | null; next: TeamPostSlot | null } {
  let i = -1;
  for (let k = 0; k < slots.length; k++) if ((parseTimeToMinutes(slots[k].time) ?? 0) <= minutes) i = k;
  return { current: slots[i] ?? null, next: slots[i + 1] ?? null };
}
