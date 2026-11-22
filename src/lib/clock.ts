/** Clock strings used across the board's logs. */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "14:05:09" for a timestamp. */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** "1405": the time prefix log entries are written with ("1405 - En Route"), for a Date or a timestamp. */
export function hhmmOf(at: Date | number = new Date()): string {
  const date = typeof at === 'number' ? new Date(at) : at;
  return pad2(date.getHours()) + pad2(date.getMinutes());
}
