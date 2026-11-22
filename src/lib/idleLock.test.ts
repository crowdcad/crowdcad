import { describe, expect, it } from 'vitest';
import { shouldLock } from './idleLock';

describe('idle lock', () => {
  it('locks only once the limit has passed since the last input, and never when off', () => {
    const t0 = 1_000_000;
    expect(shouldLock(t0, t0 + 14 * 60_000, 15)).toBe(false);
    expect(shouldLock(t0, t0 + 15 * 60_000, 15)).toBe(true);
    expect(shouldLock(null, t0, 15)).toBe(false);
    expect(shouldLock(t0, t0 + 999 * 60_000, 0)).toBe(false);
  });
});
