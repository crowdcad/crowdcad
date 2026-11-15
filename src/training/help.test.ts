import { afterEach, describe, expect, it } from 'vitest';
import { helpSuggestions, practiceHref, searchHelp } from './help';
import { visibleModules } from './registry';

const top = (q: string, ctx = {}) => {
  const r = searchHelp(q, ctx)[0];
  return r ? `${r.module.id}:${r.step.id}` : null;
};

describe('Help search', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_TRAINING_PREVIEW;
  });

  it('finds the step a dispatcher means', () => {
    expect(top('add a call')).toBe('call-assignment:open-add-call');
    expect(top('how do I assign a team to a call')).toBe('call-assignment:open-add-menu');
    expect(top('walk-in patient')).toBe('clinic-patients:open-walkup');
    expect(top('where is the gurney')).toBe('orientation:switch-to-equipment');
  });

  it('returns nothing for an empty or stopword-only query', () => {
    expect(searchHelp('')).toEqual([]);
    expect(searchHelp('how do I')).toEqual([]);
  });

  it('hides preview modules unless they are shown', () => {
    expect(searchHelp('declare mci').some((r) => r.module.release === 'preview')).toBe(false);
    process.env.NEXT_PUBLIC_TRAINING_PREVIEW = 'on';
    expect(top('declare mci')).toBe('mci-response:open-declare');
  });

  it('suggests one pointer step per module before anything is typed', () => {
    const s = helpSuggestions();
    expect(s.length).toBeGreaterThan(0);
    expect(new Set(s.map((e) => e.module.id)).size).toBe(s.length);
    expect(s.every((e) => e.step.liveSafe)).toBe(true);
  });

  it('links each result to its step in the module', () => {
    const r = searchHelp('add a call')[0];
    expect(practiceHref(r)).toBe('/training/call-assignment?step=open-add-call');
  });

  it('gives every stable module at least one way to be found', () => {
    for (const m of visibleModules()) expect(m.steps.some((s) => s.intents?.length), `${m.id} has no intents`).toBe(true);
  });
});
