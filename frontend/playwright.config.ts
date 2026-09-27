import { defineConfig } from '@playwright/test';

// Live checks need the Django API on :8000 with the users seeded below
// (see e2e/auth.spec.ts). Vite is started automatically.
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome', // use the installed Chrome; no browser download needed
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
});
