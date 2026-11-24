import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:8787',
    channel: process.env.TEST_BROWSER_CHANNEL,
    launchOptions: { args: ['--no-proxy-server', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  },
  webServer: {
    command: `npm exec -- wrangler dev --local --ip 127.0.0.1 --port 8787 --var ANTHROPIC_API_KEY: --persist-to .local/e2e-${Date.now()}`,
    url: 'http://127.0.0.1:8787/',
    timeout: 40_000,
    reuseExistingServer: false
  }
});
