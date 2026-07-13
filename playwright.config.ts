import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:1420', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 1420',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
