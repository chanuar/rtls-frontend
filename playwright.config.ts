import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  outputDir: './tmp/playwright',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5177', channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5177 --strictPort',
    url: 'http://127.0.0.1:5177',
    env: { VITE_DEMO: 'false', VITE_TEST_LAYOUT: process.env.TEST_LAYOUT ?? 'false', VITE_API_URL: 'http://127.0.0.1:8000' },
  },
})
