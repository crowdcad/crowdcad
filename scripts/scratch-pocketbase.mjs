#!/usr/bin/env node
/**
 * Runs a command against a throwaway PocketBase set up by scripts/setup-pocketbase.js:
 *
 *   node scripts/scratch-pocketbase.mjs "<command>"
 *
 * Starts the `pocketbase` binary in the repo root (or POCKETBASE_BIN) on 127.0.0.1:8092 with an empty data
 * folder, makes a superuser, runs the setup script, then runs the command with PB_URL, PB_TEST_URL,
 * PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD set. Stops PocketBase and deletes the folder afterwards. Used by
 * `npm run test:pocketbase` (the API-rule tests and the PocketBase integration tests).
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const command = process.argv.slice(2).join(' ');
if (!command) {
  console.error('Usage: node scripts/scratch-pocketbase.mjs "<command>"');
  process.exit(2);
}
const BIN = process.env.POCKETBASE_BIN || join(process.cwd(), process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
if (!existsSync(BIN)) {
  console.error(`No PocketBase binary at ${BIN}. Put one in the repo root or set POCKETBASE_BIN.`);
  process.exit(2);
}
const URL = 'http://127.0.0.1:8092';
const ADMIN = { email: 'su@scratch.test', password: 'Superuser123456!' };

const dir = mkdtempSync(join(tmpdir(), 'pb-scratch-'));
execFileSync(BIN, ['superuser', 'upsert', ADMIN.email, ADMIN.password, '--dir', dir], { stdio: 'ignore' });
// Migrations inside the scratch folder, and none written: by default PocketBase keeps them next to the
// data folder, which here is the shared temp folder.
const server = spawn(BIN, ['serve', '--http=127.0.0.1:8092', '--dir', dir, '--migrationsDir', join(dir, 'migrations'), '--automigrate=false'], { stdio: 'ignore' });

let status = 1;
try {
  let up = false;
  for (let i = 0; i < 150 && !up; i++) {
    up = await fetch(`${URL}/api/health`).then((r) => r.ok, () => false);
    if (!up) await new Promise((r) => setTimeout(r, 100));
  }
  if (!up) throw new Error('PocketBase did not start.');
  const env = { ...process.env, PB_URL: URL, PB_TEST_URL: URL, PB_ADMIN_EMAIL: ADMIN.email, PB_ADMIN_PASSWORD: ADMIN.password };
  const setup = spawnSync(process.execPath, ['scripts/setup-pocketbase.js'], { env, encoding: 'utf8' });
  if (setup.status !== 0) throw new Error(`setup-pocketbase.js failed:\n${setup.stdout}\n${setup.stderr}`);
  status = spawnSync(command, { env, stdio: 'inherit', shell: true }).status ?? 1;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
} finally {
  server.kill();
  await new Promise((r) => setTimeout(r, 300));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may hold the files a moment longer; it's a temp folder.
  }
}
process.exit(status);
