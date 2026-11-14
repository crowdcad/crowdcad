#!/usr/bin/env node
// Checks that TAK live tracking (optional, in development) adds nothing to
// standard pages. Run after `next build`:
//
//   node scripts/check-tak-footprint.mjs off   # built without NEXT_PUBLIC_TAK=on
//   node scripts/check-tak-footprint.mjs on    # built with NEXT_PUBLIC_TAK=on
//
// "off": the TAK module marker appears nowhere in the build output, so TAK is
//        compiled out entirely.
// "on":  no route's initial JavaScript contains the marker; TAK code is only
//        reachable through lazily loaded chunks.
//
// The marker is TAK_MODULE_MARKER in src/features/tak/marker.ts, rendered by
// every TAK component.
import fs from 'node:fs';
import path from 'node:path';

const MARKER = 'crowdcad-tak-module';
const mode = process.argv[2];
if (mode !== 'on' && mode !== 'off') {
  console.error('Usage: node scripts/check-tak-footprint.mjs on|off');
  process.exit(2);
}

const nextDir = path.resolve('.next');
if (!fs.existsSync(nextDir)) {
  console.error('No .next directory: run `next build` first.');
  process.exit(2);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'cache') continue;
      walk(p, out);
    } else if (/\.(js|mjs|cjs|html|json|rsc)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

const containsMarker = (file) => fs.readFileSync(file, 'utf8').includes(MARKER);

if (mode === 'off') {
  const hits = walk(nextDir).filter(containsMarker);
  if (hits.length) {
    console.error(`TAK code found in a build without NEXT_PUBLIC_TAK=on:\n  ${hits.map((h) => path.relative(nextDir, h)).join('\n  ')}`);
    process.exit(1);
  }
  console.log('OK: no TAK code in the build (NEXT_PUBLIC_TAK not "on").');
  process.exit(0);
}

// mode === 'on': every route's initial chunks must be free of the marker.
const manifestPath = path.join(nextDir, 'app-build-manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('No .next/app-build-manifest.json; is this an App Router build?');
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const offenders = [];
for (const [route, files] of Object.entries(manifest.pages ?? {})) {
  for (const file of files) {
    const p = path.join(nextDir, file);
    if (fs.existsSync(p) && file.endsWith('.js') && containsMarker(p)) offenders.push(`${route}: ${file}`);
  }
}
if (offenders.length) {
  console.error(`TAK code is in the initial JavaScript of these routes:\n  ${offenders.join('\n  ')}`);
  process.exit(1);
}
const lazy = walk(path.join(nextDir, 'static')).filter(containsMarker).length;
console.log(
  `OK: no route loads TAK code up front (${Object.keys(manifest.pages ?? {}).length} routes checked; ` +
    `${lazy} lazy chunk(s) contain TAK code).`,
);
