import { afterEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { securityHeaders, contentSecurityPolicy } = require('../../security-headers.js');

type Header = { key: string; value: string };
const byKey = (headers: Header[], key: string) => headers.find((h) => h.key === key)?.value;

describe('security headers', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('ships the CSP report-only unless CSP_ENFORCE=on', () => {
    expect(byKey(securityHeaders({ dev: false }), 'Content-Security-Policy-Report-Only')).toBeTruthy();
    vi.stubEnv('CSP_ENFORCE', 'on');
    const enforced = securityHeaders({ dev: false });
    expect(byKey(enforced, 'Content-Security-Policy')).toBeTruthy();
    expect(byKey(enforced, 'Content-Security-Policy-Report-Only')).toBeUndefined();
  });

  it('blocks framing and sends HSTS in production only', () => {
    const prod = securityHeaders({ dev: false });
    expect(byKey(prod, 'X-Frame-Options')).toBe('SAMEORIGIN');
    expect(byKey(prod, 'Strict-Transport-Security')).toContain('max-age=');
    expect(byKey(securityHeaders({ dev: true }), 'Strict-Transport-Security')).toBeUndefined();
  });

  it('limits connect-src to the backend and map services', () => {
    vi.stubEnv('NEXT_PUBLIC_POCKETBASE_URL', 'https://pb.agency.example:8090/');
    vi.stubEnv('NEXT_PUBLIC_TAK_BASEMAPS', JSON.stringify([{ id: 's', tiles: 'https://tiles.agency.example/{z}/{x}/{y}.jpg' }]));
    vi.stubEnv('NEXT_PUBLIC_TAK_GEOCODER_URL', 'off');
    const csp: string = contentSecurityPolicy({ dev: false });
    const connect = csp.split('; ').find((d) => d.startsWith('connect-src')) ?? '';
    expect(connect).toContain('https://pb.agency.example:8090');
    expect(connect).toContain('https://tiles.agency.example');
    expect(connect).not.toContain('photon.komoot.io');
    expect(connect).not.toContain('localhost');
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
  });
});
