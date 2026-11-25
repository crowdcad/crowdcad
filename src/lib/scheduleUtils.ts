import { Time } from '@internationalized/date';
import { parseEventDate } from '@/lib/eventDate';

export function parseTimeValue(value: string, fallback: Time): Time {
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  ) {
    return new Time(hour, minute);
  }

  return fallback;
}

export function formatTimeValue(value: Time): string {
  return `${value.hour.toString().padStart(2, '0')}:${value.minute
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Combines the event's calendar date with the schedule's From/To wall
 * times into real timestamps, wrapping To to the next calendar day when it
 * falls at or before From — the same overnight-event convention
 * buildPostingTimes below already uses for generating posting times. The
 * date is read as a calendar day (parseEventDate): `new Date("2026-11-30")`
 * is UTC midnight, the day before anywhere west of UTC.
 */
export function scheduleTimesToWindow(
  dateStr: string,
  from: Time,
  to: Time
): { start: number; end: number } {
  const base = parseEventDate(dateStr) ?? new Date();
  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();

  const start = new Date(year, month, day, from.hour, from.minute, 0, 0).getTime();
  const fromMinutes = from.hour * 60 + from.minute;
  const toMinutes = to.hour * 60 + to.minute;
  const dayOffset = toMinutes <= fromMinutes ? 1 : 0;
  const end = new Date(year, month, day + dayOffset, to.hour, to.minute, 0, 0).getTime();

  return { start, end };
}

export function buildPostingTimes(from: Time, to: Time, byMinutesRaw: string): string[] {
  const byMinutes = Number.parseInt(byMinutesRaw, 10);
  if (!Number.isFinite(byMinutes) || byMinutes <= 0) return [];

  const minutesInDay = 24 * 60;
  const startMinutes = from.hour * 60 + from.minute;
  const toMinutes = to.hour * 60 + to.minute;
  const endMinutes = toMinutes <= startMinutes ? toMinutes + minutesInDay : toMinutes;

  const times: string[] = [];
  const maxIterations = Math.ceil((endMinutes - startMinutes) / Math.max(1, byMinutes)) + 2;
  let iteration = 0;

  for (let value = startMinutes; value <= endMinutes; value += byMinutes) {
    iteration += 1;
    if (iteration > maxIterations) break;

    const normalized = value % minutesInDay;
    const hour = Math.floor(normalized / 60);
    const minute = normalized % 60;
    times.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
  }

  return times;
}
