import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Docker build copies an explicit list of root files, so a root-level
 * file that a build config loads (e.g. next.config.js requiring
 * ./security-headers) must be on that list, or the image build fails while
 * every other check passes (CI builds without Docker).
 */
const root = path.resolve(__dirname, '../..');
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');

/** Every file or folder the Dockerfile's builder stage copies from the repo. */
function copiedPaths(dockerfile: string): Set<string> {
  const out = new Set<string>();
  for (const line of dockerfile.split(/\r?\n/)) {
    const m = /^COPY\s+(?!--from)(.+)$/.exec(line.trim());
    if (!m) continue;
    const parts = m[1].split(/\s+/).filter((p) => !p.startsWith('--'));
    parts.slice(0, -1).forEach((p) => out.add(p.replace(/^\.\//, '').replace(/\/$/, '')));
  }
  return out;
}

/** Local files a config requires or imports, relative to the repo root. */
function localDeps(source: string): string[] {
  const deps = [...source.matchAll(/(?:require\(|from\s+)\s*['"](\.\/[^'"]+)['"]/g)].map((m) => m[1].slice(2));
  return deps.map((d) => (path.extname(d) ? d : `${d}.js`));
}

describe('Dockerfile', () => {
  const dockerfiles = ['Dockerfile'];
  const configs = ['next.config.js', 'tailwind.config.js', 'postcss.config.mjs'];

  for (const df of dockerfiles) {
    it(`${df} copies every local file the build configs load`, () => {
      const copied = copiedPaths(read(df));
      for (const config of configs) {
        expect(copied, `${df} should copy ${config}`).toContain(config);
        for (const dep of localDeps(read(config))) {
          const topLevel = dep.split('/')[0];
          // A file inside a copied folder (src/, public/) is covered by that folder.
          expect(copied.has(dep) || copied.has(topLevel), `${df} should copy ${dep} (loaded by ${config})`).toBe(true);
        }
      }
    });
  }
});
