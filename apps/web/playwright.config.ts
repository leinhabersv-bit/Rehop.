import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const externalServers = process.env.REHOP_TEST_WEB || process.env.REHOP_TEST_API;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: externalServers ? undefined : [
    {
      command: 'python -m uvicorn --app-dir tests browser_server:app --port 8000',
      env: { SIM_DEV_ENDPOINTS: '1' },
      cwd: resolve(__dirname, '../../services/api'),
      url: 'http://127.0.0.1:8000/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run start -- --port 3000',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
