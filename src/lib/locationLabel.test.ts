import { describe, expect, it } from 'vitest';
import { resolvePostName } from './locationLabel';

const posts = new Set(['Gate A', 'Near the stage']);
const isPost = (n: string) => posts.has(n);

describe('resolvePostName', () => {
  it('maps live-tracking labels to their post', () => {
    expect(resolvePostName('Gate A', isPost)).toBe('Gate A');
    expect(resolvePostName('Near Gate A', isPost)).toBe('Gate A');
    expect(resolvePostName('250 m from Gate A', isPost)).toBe('Gate A');
    expect(resolvePostName('1.2 km from Gate A', isPost)).toBe('Gate A');
  });

  it('keeps a post whose own name looks like a label, and rejects unknown places', () => {
    expect(resolvePostName('Near the stage', isPost)).toBe('Near the stage');
    expect(resolvePostName('Near Gate Z', isPost)).toBeNull();
    expect(resolvePostName('Roaming', isPost)).toBeNull();
    expect(resolvePostName(undefined, isPost)).toBeNull();
  });
});
