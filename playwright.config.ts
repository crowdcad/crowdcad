import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import path from 'node:path';
import dotenv from 'dotenv';

// Load test environment variables from .env.test.local
dotenv.config({ path: path.join(__dirname, '.env.test.local') });

const NEXT_DEV_URL = 'http://localhost:3000';

// Path to the saved auth state — written by auth.setup.ts, read by authenticated projects
export const STORAGE_STATE = path.join(__dirname, 'tests/e2e/.auth/user.json');

// Generate Playwright spec files from Gherkin feature files.
// Run `npx bddgen` before `npx playwright test` (or use test:e2e script).
const testDir = defineBddConfig({
  features: 'tests/e2e/features/**/*.feature',
  steps: 'tests/e2e/steps/**/*.ts',
  importTestFrom: 'tests/e2e/fixtures/index.ts',
});

export default defineConfig({
  testDir,

  // Per-test timeout
  timeout: 30_000,

  // Assertion timeout
  expect: {
    timeout: 10_000,
  },

  // Run test files in parallel
  fullyParallel: true,

  // Fail the build if test.only() is accidentally left in source
  forbidOnly: !!process.env.CI,

  // Retry once in CI for flaky network calls; no retries locally
  retries: process.env.CI ? 1 : 0,

  // Limit workers in CI
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: NEXT_DEV_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  webServer: [
    {
      command: 'npx firebase emulators:start --only auth,firestore,storage --project demo-crowdcad',
      // The emulator hub's port — lets Playwright detect an already-running
      // instance and skip re-spawning it. Without this, Playwright always
      // launches a fresh `firebase emulators:start`, which either races the
      // `next build` step below (proceeding before the emulator is actually
      // ready) or, if one is already running, fails to bind its ports and
      // can take the healthy instance down with it.
      port: 4400,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'next build && next start',
      env: {
        NEXT_PUBLIC_BACKEND: 'firebase',
        NEXT_PUBLIC_USE_FIREBASE_EMULATOR: 'true',
        NEXT_PUBLIC_USE_FIRESTORE_EMULATOR: 'true',
        NEXT_PUBLIC_FIREBASE_API_KEY: 'fake-api-key',
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: '127.0.0.1',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-crowdcad',
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-crowdcad.appspot.com',
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
        NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:fake',
        // The server routes (role logins, MCI role actions) use the Admin SDK; point it at the emulators too.
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      },
      url: NEXT_DEV_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],

  projects: [
    // ── SETUP: logs in once and saves auth state to disk ──────────────────────
    {
      name: 'setup',
      testDir: './tests/e2e',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // ── AUTHENTICATED: BDD scenarios tagged @authenticated ────────────────────
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
      grep: /@authenticated/,
    },

    // ── PUBLIC: BDD scenarios tagged @public (no auth state) ──────────────────
    {
      name: 'chromium-public',
      use: { ...devices['Desktop Chrome'] },
      grep: /@public/,
    },
  ],

  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
});
