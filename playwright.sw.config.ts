import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/sw',
  workers: 1,
  use: {
    baseURL: 'https://genfactory.test:5443',
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: [
        '--ignore-certificate-errors',
        '--no-proxy-server',
        '--host-resolver-rules=MAP genfactory.test 127.0.0.1',
      ],
    },
  },
  reporter: 'list',
});
