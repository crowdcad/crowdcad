/**
 * Step text: `{{Term}}` becomes the org's word for that dispatch term
 * (src/lib/dispatchVocabulary), `**bold**` is bold, `` `value` `` is a
 * value to type and `[label](https://...)` links out (a new tab). Parsed into
 * parts so the player can render chips without any HTML in module files.
 */

export type TextPart =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'value'; text: string }
  | { kind: 'link'; text: string; href: string };

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https:\/\/[^)\s]+\))/g;
const LINK = /^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/;

/**
 * `{{Team}}` is the org's label as written ("Team"). `{{team}}`, starting
 * lowercase, is the same term mid-sentence: the label is looked up by its
 * capitalized key and lowercased, unless it is an acronym ("MRC", "EMT").
 */
export function withTerms(text: string, t: (key: string) => string): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_m, raw: string) => {
    const key = raw.trim();
    if (!/^[a-z]/.test(key)) return t(key);
    const label = t(key.charAt(0).toUpperCase() + key.slice(1));
    return /^[A-Z]{2,}/.test(label) ? label : label.toLowerCase();
  });
}

export function parseStepText(text: string, t: (key: string) => string): TextPart[] {
  const parts: TextPart[] = [];
  for (const piece of withTerms(text, t).split(TOKEN)) {
    if (!piece) continue;
    if (piece.startsWith('**') && piece.endsWith('**')) parts.push({ kind: 'bold', text: piece.slice(2, -2) });
    else if (piece.startsWith('`') && piece.endsWith('`')) parts.push({ kind: 'value', text: piece.slice(1, -1) });
    else if (LINK.test(piece)) {
      const [, label, href] = piece.match(LINK)!;
      parts.push({ kind: 'link', text: label!, href: href! });
    } else parts.push({ kind: 'text', text: piece });
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
