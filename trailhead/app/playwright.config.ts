import { defineConfig, devices } from '@playwright/test';

// Run through the emulators from the trailhead folder:
//   firebase emulators:exec --only auth,firestore,functions --project demo-trailhead "npm --prefix app run e2e"
export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5180', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  // Uses your installed Google Chrome. Set PW_CHANNEL=chromium to use Playwright's own browser instead.
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL ?? 'chrome' } }],
  webServer: {
    command: 'npm run dev -- --port 5180 --strictPort',
    url: 'http://localhost:5180',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
