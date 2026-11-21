/** Clock strings used across the board's logs. */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "14:05:09" for a timestamp. */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** "1405": the time prefix log entries are written with ("1405 - En Route"). */
export function hhmm(date: Date = new Date()): string {
  return pad2(date.getHours()) + pad2(date.getMinutes());
}
