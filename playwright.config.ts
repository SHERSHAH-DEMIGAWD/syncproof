import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.local/browsers');
export default defineConfig({ testDir: './tests/browser', workers: 1, retries: 0, timeout: 40000,
  outputDir: '.local/browser-results', reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5174', headless: true },
  webServer: { command: 'npm run dev:client', url: 'http://127.0.0.1:5174', reuseExistingServer: false, timeout: 30000 } });
