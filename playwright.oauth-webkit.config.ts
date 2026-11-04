import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  grep: /OAuth|logout|login persists/,
  projects: [{ name: 'webkit', use: { browserName: 'webkit', viewport: { width: 1440, height: 1000 } } }],
});
