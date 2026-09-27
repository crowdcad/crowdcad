import type { Event } from '@/app/types';

const pad = (n: number, len = 2) => n.toString().padStart(len, '0');

/**
 * Formats a log entry's epoch timestamp for CSV export as a full local
 * date + time ("YYYY-MM-DD HH:mm:ss"), instead of just a time-of-day —
 * an event that runs past midnight still sorts and reads unambiguously
 * this way. The dispatch board's own on-screen logs stay date-free
 * (HH:mm), this is exports only.
 */
export function formatLogTimestampForCsv(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '';
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const csvQuote = (text: string) => `"${text.replace(/"/g, '""')}"`;

/**
 * Flat "Log Type,Team/Call ID,Timestamp,Message" CSV of every team and call
 * log entry — the Lite / event-summary quick export.
 */
export function buildLogSummaryCsv(event: Pick<Event, 'staff' | 'calls'>): string {
  const rows: string[] = [];
  for (const team of event.staff || []) {
    for (const entry of team.log || []) {
      rows.push(`Staff,${team.team},${formatLogTimestampForCsv(entry.timestamp)},${csvQuote(entry.message || '')}`);
    }
  }
  for (const call of event.calls || []) {
    for (const entry of call.log || []) {
      rows.push(`Call,${call.id},${formatLogTimestampForCsv(entry.timestamp)},${csvQuote(entry.message || '')}`);
    }
  }
  return ['Log Type,Team/Call ID,Timestamp,Message', ...rows].join('\n');
}
