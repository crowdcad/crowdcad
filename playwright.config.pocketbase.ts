import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '.env.test.local') });

const NEXT_DEV_URL = 'http://localhost:3000';
const PB_URL = 'http://127.0.0.1:8090';

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
      // Upsert superadmin then serve PocketBase on 127.0.0.1:8090
      command: 'node scripts/start-pocketbase-e2e.js',
      url: `${PB_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'next build && next start',
      env: {
        NEXT_PUBLIC_BACKEND: 'pocketbase',
        NEXT_PUBLIC_POCKETBASE_URL: PB_URL,
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
      // Role logins (#142) are Firebase-only for now.
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
