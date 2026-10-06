import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services', () => ({ isPocketbaseBackend: false, dbService: {} }));

const { envBlock, randomString } = await import('./bridgeAccount');

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

describe('envBlock', () => {
  it('contains the backend settings and the generated credentials exactly once', () => {
    const block = envBlock(
      { CROWDCAD_BACKEND: 'firebase', FIREBASE_PROJECT_ID: 'demo-x' },
      { bridgeUid: 'u1', email: 'abc@bridge.crowdcad.org', password: 'p@ss-123' },
    );
    expect(block).toContain('CROWDCAD_BACKEND=firebase\n');
    expect(block).toContain('FIREBASE_PROJECT_ID=demo-x\n');
    expect(block).toContain('BRIDGE_EMAIL=abc@bridge.crowdcad.org\n');
    expect(block.match(/p@ss-123/g)).toHaveLength(1);
    expect(block).toContain('TAK_HOST=\n'); // left for the operator
  });
});
