import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  grep: /@mobile-layout/,
  projects: [{ name: 'mobile-webkit', use: { ...devices['iPhone 13'], channel: undefined } }],
});
