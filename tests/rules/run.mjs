// Runs every Firestore rules test in this folder against the emulator (npm run test:rules).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
let failed = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs') && f !== 'run.mjs').sort()) {
  console.log(`\n== ${file}`);
  const { status } = spawnSync(process.execPath, [join(dir, file)], { stdio: 'inherit' });
  if (status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
