import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT || 4173);

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.CI ? './test-results' : join(tmpdir(), 'testCode-playwright-results'),
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: `python3 scripts/serve-local.py ${port}`,
    url: `http://127.0.0.1:${port}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
