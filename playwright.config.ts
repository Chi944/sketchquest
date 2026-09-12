import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const testHost = new URL(baseURL);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(testHost.hostname) ||
  testHost.protocol !== 'http:'
) {
  throw new Error('The E2E suite writes test shares and requires a local HTTP server.');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  // Start the existing local Vite/Cloudflare server and migrate local D1 before running.
  // No webServer here: tests must not create duplicate workers or accidentally use remote AI.
});
