const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3010',
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome',
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {},
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
});
