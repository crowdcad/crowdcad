// Unit tests (vitest). The Playwright e2e suites live in tests/e2e and run separately.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Installs the build's extension packs, as ExtensionsBoot does in the app.
    setupFiles: ['src/extensions/installed.ts'],
    environment: 'node',
  },
});
