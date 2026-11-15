import type { Event } from '@/app/types';
import { parseAgeSex } from '@/lib/ageSex';

/**
 * The training write gate. While a module's guided steps are locked, a write
 * may only bring in text the script asked for: anything else a trainee types
 * (a real patient's name, say) is turned away before it reaches the board.
 * Once the module unlocks, the gate is off and the sandbox is free practice.
 * The sandbox never leaves the browser either way (src/training/memoryStore.ts).
 *
 * "Text" is every string in the event except identifiers, enum-like fields and
 * logs (which only repeat text that already passed). Text that was already
 * anywhere in the event before the write is always fine: moving a team to an
 * existing post copies that post's name.
 */

/** Keys whose strings are never typed by a person: ids, enums, timestamps, logs. */
const SKIP_KEYS = new Set([
  'id', 'status', 'phase', 'kind', 'outcome', 'color', 'previousStatus', 'mode', 'mapMode', 'userId',
  'createdAt', 'updatedAt', 'date', 'log', 'custodyLog', 'surgeLog', 'periods', 'interactionSessions',
  'message', 'mapUrl', 'by', 'from', 'to', 'type', 'action', 'icon', 'reason',
]);

/** Words the board itself writes as locations or labels. */
export const SYSTEM_TEXT = ['unknown', 'clinic', 'roaming', 'en route', 'on scene', 'walkup'];

function skipKey(key: string): boolean {
  return SKIP_KEYS.has(key) || /Id$/.test(key) || /Ids$/.test(key);
}

/** Lowercased, trimmed, inner whitespace collapsed. */
export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Every typed-text string in a value, normalized. */
export function textIn(value: unknown, out: Set<string> = new Set(), key = ''): Set<string> {
  if (key && skipKey(key)) return out;
  if (typeof value === 'string') {
    const n = normalizeText(value);
    if (n) out.add(n);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) textIn(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) textIn(v, out, k);
  }
  return out;
}

/** Text in `next` that was nowhere in `current`. */
export function newText(current: Event, next: Event): string[] {
  const before = textIn(current);
  return [...textIn(next)].filter((s) => !before.has(s));
}

/**
 * The allowed set for a list of scripted values: each value, plus the parts a
 * field splits it into (an Age/Sex field turns `34M` into `34` and `M`).
 */
export function allowedText(values: Iterable<string>): Set<string> {
  const out = new Set<string>(SYSTEM_TEXT);
  for (const value of values) {
    const n = normalizeText(value);
    if (!n) continue;
    out.add(n);
    const { age, gender } = parseAgeSex(value);
    if (age) out.add(normalizeText(age));
    if (gender) out.add(normalizeText(gender));
    // "34M" may be stored whole or as age 34 and sex M.
    const joined = /^(\d+\s*(?:mo|y|yo)?)\s*([a-z])$/i.exec(value.trim());
    if (joined) {
      out.add(normalizeText(joined[1]));
      out.add(normalizeText(joined[2]));
    }
    for (const part of value.split(/[,/]/)) {
      const p = normalizeText(part);
      if (p) out.add(p);
    }
  }
  return out;
}

export interface GateVerdict {
  ok: boolean;
  /** The text that was turned away, as normalized. */
  rejected: string[];
}

/** Whether a write may go through while locked, given the text the script allows so far. */
export function checkWrite(current: Event, next: Event, allowed: Set<string>): GateVerdict {
  const rejected = newText(current, next).filter((s) => !allowed.has(s));
  return { ok: rejected.length === 0, rejected };
}
