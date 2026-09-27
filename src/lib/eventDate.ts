// An event's `date` is a calendar day, not an instant. The create wizards hold
// it as "YYYY-MM-DD" and cloud events store it as UTC midnight of that day
// ("2026-09-27T00:00:00.000Z"). Passing either to `new Date()` yields UTC
// midnight, which toLocaleDateString() renders as the *previous* day anywhere
// west of UTC — so always read the calendar day from the string instead.

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** Local-midnight Date for the event's calendar day, or null if unparseable. */
export function parseEventDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const match = CALENDAR_DAY.exec(value);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/** Locale-formatted event day ("9/27/2026"), or `fallback` when missing/invalid. */
export function formatEventDate(value: string | undefined | null, fallback = ''): string {
  return parseEventDate(value)?.toLocaleDateString() ?? fallback;
}
