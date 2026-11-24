#!/usr/bin/env node
/**
 * Starts PocketBase for E2E testing.
 *
 * 1. Creates/updates a superadmin account (idempotent) using the pocketbase CLI.
 * 2. Starts PocketBase serve on 127.0.0.1:8090 (or E2E_PB_PORT).
 *
 * Data directory: tests/e2e/.pb-data  (gitignored)
 * Playwright's global-setup.pocketbase.ts creates collections and the test
 * user once the server is ready.
 *
 * Usage: node scripts/start-pocketbase-e2e.js
 */

const { execFileSync, spawn } = require('child_process');
const path = require('path');

const PB_EXE = path.join(
  __dirname,
  '..',
  process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase',
);
const PB_DATA_DIR = path.join(__dirname, '..', 'tests', 'e2e', '.pb-data');
const ADMIN_EMAIL = process.env.PB_E2E_ADMIN_EMAIL || 'admin@pbtest.local';
const ADMIN_PASSWORD = process.env.PB_E2E_ADMIN_PASSWORD || 'Admin1234567890!';

// Upsert superadmin before starting the server (the command only touches the data dir)
console.log('[pocketbase-e2e] Upserting superadmin...');
try {
  execFileSync(
    PB_EXE,
    ['superuser', 'upsert', ADMIN_EMAIL, ADMIN_PASSWORD, '--dir', PB_DATA_DIR],
    { stdio: 'inherit' },
  );
} catch (err) {
  console.error('[pocketbase-e2e] Failed to upsert superadmin:', err.message);
  process.exit(1);
}

// Start PocketBase — keep this process alive so Playwright can manage it
const PB_PORT = process.env.E2E_PB_PORT || '8090';
console.log(`[pocketbase-e2e] Starting PocketBase serve on 127.0.0.1:${PB_PORT}...`);
// --automigrate=false: the global setup changes collections through the API, which would otherwise write
// a migration file into tests/e2e/pb_migrations on every schema change.
const serve = spawn(PB_EXE, ['serve', `--http=127.0.0.1:${PB_PORT}`, '--dir', PB_DATA_DIR, '--automigrate=false'], {
  stdio: 'inherit',
});

serve.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGTERM', () => serve.kill('SIGTERM'));
process.on('SIGINT', () => serve.kill('SIGINT'));
