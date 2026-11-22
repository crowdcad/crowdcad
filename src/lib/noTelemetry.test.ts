/**
 * The no-telemetry promise (SECURITY.md): CrowdCAD sends nothing to its
 * maintainers or to analytics or error-tracking services. Deployments may hold
 * patient information, and Lite keeps everything in the browser, so a tracking
 * package added by accident would quietly break that promise. This test fails
 * if one appears in package.json or is imported anywhere in src/.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');

/** Packages whose job is to send usage, analytics or error data somewhere. */
const BANNED_PACKAGES = [
  /^@sentry\//,
  /^@bugsnag\//,
  /^@datadog\/browser/,
  /^@vercel\/analytics$/,
  /^@vercel\/speed-insights$/,
  /^posthog-/,
  /^mixpanel/,
  /^@amplitude\//,
  /^@segment\//,
  /^analytics$/,
  /^react-ga/,
  /^logrocket/,
  /^@fullstory\//,
  /^hotjar/,
  /^newrelic$/,
  /^@newrelic\//,
];

/** Imports or snippets that turn tracking on. */
const BANNED_SOURCE = [
  /from ['"]firebase\/analytics['"]/,
  /from ['"]firebase\/performance['"]/,
  /googletagmanager\.com/,
  /google-analytics\.com/,
  /\bgtag\(/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(name) && !name.endsWith('noTelemetry.test.ts') ? [path] : [];
  });
}

describe('no telemetry', () => {
  it('package.json has no analytics or error-tracking packages', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies });
    expect(names.filter((n) => BANNED_PACKAGES.some((re) => re.test(n)))).toEqual([]);
  });

  it('nothing in src/ imports analytics or loads a tracking script', () => {
    const hits = sourceFiles(join(ROOT, 'src')).flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return BANNED_SOURCE.filter((re) => re.test(text)).map((re) => `${file.slice(ROOT.length + 1)}: ${re}`);
    });
    expect(hits).toEqual([]);
  });
});
