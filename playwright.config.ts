import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const viewport = { width: 1200, height: 780 };

/**
 * End-to-end tests against the production build of the frontend (React Compiler on,
 * minified), in the two engines the app ships on:
 * Chromium ≈ WebView2 on Windows, WebKit ≈ WKWebView (macOS) and WebKitGTK (Linux).
 */
export default defineConfig({
  testDir: 'e2e/web',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm build:web && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport,
        launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport } },
  ],
});
