/**
 * Step text: `{{Term}}` becomes the org's word for that dispatch term
 * (src/lib/dispatchVocabulary), `**bold**` is bold and `` `value` `` is a
 * value to type. Parsed into parts so the player can render chips without
 * any HTML in module files.
 */

export type TextPart =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'value'; text: string };

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`)/g;

export function withTerms(text: string, t: (key: string) => string): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_m, key: string) => t(key.trim()));
}

export function parseStepText(text: string, t: (key: string) => string): TextPart[] {
  const parts: TextPart[] = [];
  for (const piece of withTerms(text, t).split(TOKEN)) {
    if (!piece) continue;
    if (piece.startsWith('**') && piece.endsWith('**')) parts.push({ kind: 'bold', text: piece.slice(2, -2) });
    else if (piece.startsWith('`') && piece.endsWith('`')) parts.push({ kind: 'value', text: piece.slice(1, -1) });
    else parts.push({ kind: 'text', text: piece });
  }
  return parts;
}

/** Plain text, for search and accessibility. */
export function plainStepText(text: string, t: (key: string) => string = (k) => k): string {
  return parseStepText(text, t).map((p) => p.text).join('');
}

/** Seconds as a catalog duration: "4 min", rounded up, never under a minute. */
export function formatDuration(sec: number): string {
  const min = Math.max(1, Math.ceil(sec / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
