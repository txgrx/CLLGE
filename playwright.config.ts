import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:5174/CLLGE/' },
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174/CLLGE/',
    reuseExistingServer: true,
  },
});
