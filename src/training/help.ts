import { trackOf, visibleModules } from './registry';
import { plainStepText } from './text';
import type { TrainingModule, TrainingStep, TrackId } from './types';

/**
 * The Help search: every visible training step, found by what a dispatcher
 * types ("assign a team", "patient to hospital"). It has no content of its
 * own: titles, text and `intents` come from the modules, so a new module is
 * searchable the day it is added.
 */

export interface HelpEntry {
  module: TrainingModule;
  step: TrainingStep;
  index: number;
  track: TrackId;
  /** Lowercased words to match: intents weigh most, then the title, then the text. */
  intents: string[];
  title: string;
  text: string;
}

export interface HelpContext {
  /** Boost a track that fits what the board is doing (an active MCI, a TAK event). */
  boostTracks?: TrackId[];
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
const STOP = new Set(['to', 'a', 'an', 'the', 'how', 'do', 'i', 'my', 'is', 'on', 'of', 'for', 'in', 'and', 'can', 'what', 'where', 'when']);

export function helpEntries(t: (key: string) => string = (k) => k): HelpEntry[] {
  return visibleModules().flatMap((module) =>
    module.steps.map((step, index) => ({
      module,
      step,
      index,
      track: module.track,
      intents: (step.intents ?? []).map((i) => i.toLowerCase()),
      title: plainStepText(step.title, t),
      text: plainStepText(step.body, t),
    }))
  );
}

function score(entry: HelpEntry, queryWords: string[], query: string, ctx: HelpContext): number {
  let s = 0;
  if (entry.intents.some((i) => i === query)) s += 12;
  for (const intent of entry.intents) if (query.length > 3 && (intent.includes(query) || query.includes(intent))) s += 6;
  const intentWords = new Set(entry.intents.flatMap(words));
  const titleWords = new Set(words(entry.title));
  const textWords = new Set(words(entry.text));
  for (const w of queryWords) {
    const stem = w.replace(/(ing|ed|es|s)$/, '');
    const hit = (set: Set<string>) => set.has(w) || [...set].some((x) => stem.length > 2 && x.startsWith(stem));
    if (hit(intentWords)) s += 4;
    if (hit(titleWords)) s += 3;
    if (hit(textWords)) s += 1;
  }
  if (s > 0 && entry.step.intents?.length) s += 1; // a step meant to be found
  if (s > 0 && ctx.boostTracks?.includes(entry.track)) s += 3;
  if (s > 0 && trackOf(entry.module)?.release === 'preview' && !ctx.boostTracks?.includes(entry.track)) s -= 1;
  return s;
}

/** The best matching steps for a query, at most one per module section. */
export function searchHelp(query: string, ctx: HelpContext = {}, t?: (key: string) => string, limit = 8): HelpEntry[] {
  const q = query.trim().toLowerCase();
  const queryWords = words(q).filter((w) => !STOP.has(w));
  if (!q || !queryWords.length) return [];
  const scored = helpEntries(t)
    .map((e) => ({ e, s: score(e, queryWords, q, ctx) }))
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s || a.e.index - b.e.index);
  const seen = new Set<string>();
  const out: HelpEntry[] = [];
  for (const { e } of scored) {
    const key = `${e.module.id}:${e.step.section}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

/** Suggestions before anything is typed: the steps tagged for Help in stable modules, one per module. */
export function helpSuggestions(ctx: HelpContext = {}, t?: (key: string) => string): HelpEntry[] {
  const entries = helpEntries(t).filter((e) => e.step.liveSafe && e.step.intents?.length);
  const boosted = entries.filter((e) => ctx.boostTracks?.includes(e.track));
  const rest = entries.filter((e) => !ctx.boostTracks?.includes(e.track) && trackOf(e.module)?.release === 'stable');
  const seen = new Set<string>();
  return [...boosted, ...rest].filter((e) => (seen.has(e.module.id) ? false : (seen.add(e.module.id), true))).slice(0, 6);
}

/** The deep link that practises a step in its module. */
export const practiceHref = (e: Pick<HelpEntry, 'module' | 'step'>) => `/training/${e.module.id}?step=${encodeURIComponent(e.step.id)}`;
