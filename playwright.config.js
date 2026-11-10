import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  use: { baseURL: 'http://localhost:3100', channel: 'chrome', trace: 'retain-on-failure' },
  globalSetup: './tests/setup.mjs',
});
