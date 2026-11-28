import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '.env.test.local') });
// Steps that write to the backend directly (tests/e2e/helpers/settings.ts) check this.
process.env.E2E_BACKEND = 'pocketbase';

// E2E_PORT and E2E_PB_PORT move the app and PocketBase off 3000 and 8090 (when something else serves there locally).
const PORT = process.env.E2E_PORT || '3000';
const PB_PORT = process.env.E2E_PB_PORT || '8090';
const NEXT_DEV_URL = `http://localhost:${PORT}`;
const PB_URL = `http://127.0.0.1:${PB_PORT}`;

export const STORAGE_STATE = path.join(__dirname, 'tests/e2e/.auth/user.json');

const testDir = defineBddConfig({
  features: 'tests/e2e/features/**/*.feature',
  steps: 'tests/e2e/steps/**/*.ts',
  importTestFrom: 'tests/e2e/fixtures/index.ts',
  outputDir: '.features-gen-pocketbase',
});

export default defineConfig({
  testDir,

  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Cap local workers at 4 to reduce SQLite write contention under parallel load.
  workers: process.env.CI ? 2 : 4,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-pocketbase', open: 'never' }],
  ],

  use: {
    baseURL: NEXT_DEV_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  webServer: [
    {
      // Upsert superadmin then serve PocketBase on 127.0.0.1:<E2E_PB_PORT>
      command: 'node scripts/start-pocketbase-e2e.js',
      url: `${PB_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `next build && next start -p ${PORT}`,
      env: {
        NEXT_PUBLIC_BACKEND: 'pocketbase',
        // Training's preview modules are walked too (tests/e2e/features/training.feature).
        NEXT_PUBLIC_TRAINING_PREVIEW: 'on',
        NEXT_PUBLIC_POCKETBASE_URL: PB_URL,
        // The server's own superuser (scripts/start-pocketbase-e2e.js makes it), for routes that need one.
        PB_URL,
        PB_ADMIN_EMAIL: process.env.PB_E2E_ADMIN_EMAIL ?? 'admin@pbtest.local',
        PB_ADMIN_PASSWORD: process.env.PB_E2E_ADMIN_PASSWORD ?? 'Admin1234567890!',
        // Firebase env vars must be present (factory.ts checks NEXT_PUBLIC_BACKEND,
        // but Next.js still validates that these are defined strings)
        NEXT_PUBLIC_FIREBASE_API_KEY: 'unused-in-pocketbase-mode',
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'unused',
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'unused.appspot.com',
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
        NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:unused',
      },
      url: NEXT_DEV_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],

  projects: [
    {
      name: 'setup',
      testDir: './tests/e2e',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
      grep: /@authenticated/,
      // Field logins are Firebase-only for now.
      grepInvert: /@firebase-only/,
    },
    {
      name: 'chromium-public',
      use: { ...devices['Desktop Chrome'] },
      grep: /@public/,
    },
  ],

  globalSetup: './tests/e2e/global-setup.pocketbase.ts',
});
