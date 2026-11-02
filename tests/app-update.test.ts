import { expect, it } from 'vitest';
import { canUseUpdateWorker } from '../src/lib/app-update';
it('only enables updates in production over HTTPS away from local development hosts', () => {
  expect(canUseUpdateWorker(true, { hostname: 'genfactory.gnosisai.ru', protocol: 'https:' })).toBe(true);
  expect(canUseUpdateWorker(false, { hostname: 'genfactory.gnosisai.ru', protocol: 'https:' })).toBe(false);
  expect(canUseUpdateWorker(true, { hostname: 'genfactory.gnosisai.ru', protocol: 'http:' })).toBe(false);
  for (const hostname of ['localhost', 'app.localhost', '127.0.0.1', '127.1.2.3', '[::1]', '0.0.0.0'])
    expect(canUseUpdateWorker(true, { hostname, protocol: 'https:' })).toBe(false);
});
