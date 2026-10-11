import { defineConfig } from '@playwright/test';
import fs from 'node:fs';

const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export default defineConfig({
  testDir: './e2e',
  outputDir: '/private/tmp/testCode-playwright-results',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 390, height: 844 },
    launchOptions: process.platform === 'darwin' && fs.existsSync(localChrome)
      ? { executablePath: localChrome }
      : {},
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
