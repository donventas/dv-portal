const { defineConfig } = require('@playwright/test');
const os = require('node:os');
const path = require('node:path');

module.exports = defineConfig({
  testDir: './tests/browser',
  outputDir: path.join(os.tmpdir(), 'dv-portal-playwright-results'),
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:8002',
    browserName: 'chromium',
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://127.0.0.1:8002',
    reuseExistingServer: false,
    timeout: 15000
  }
});
