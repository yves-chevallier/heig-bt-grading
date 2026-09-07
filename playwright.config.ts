import { defineConfig } from '@playwright/test';
import { passwordHash } from './tests/fixtures';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3100',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3100/healthz',
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'test',
      PORT: '3100',
      HOST: '127.0.0.1',
      PUBLIC_URL: 'http://localhost:3100',
      DATABASE_PATH: ':memory:',
      ADMIN_EMAIL: 'admin@example.test',
      ADMIN_PASSWORD_HASH: passwordHash,
      OIDC_ISSUER: '',
      OIDC_CLIENT_ID: '',
      OIDC_CLIENT_SECRET: '',
    },
    timeout: 30000,
  },
});
