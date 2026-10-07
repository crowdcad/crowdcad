import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services', () => ({ isPocketbaseBackend: false, dbService: {} }));

const { randomString } = await import('./bridgeAccount');

describe('randomString', () => {
  it('has the requested length and alphabet', () => {
    const s = randomString(32);
    expect(s).toHaveLength(32);
    expect(s).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/); // no 0/O/1/l/I lookalikes
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomString(32)));
    expect(seen.size).toBe(200);
  });
});
