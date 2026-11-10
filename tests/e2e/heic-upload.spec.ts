import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// libheif conformance image; both browser and backend decode the same real HEIC fixture.
const sample = readFileSync(new URL('../fixtures/rainbow.heic', import.meta.url)).toString('base64');

for (const width of [1440, 390]) {
  test(`real HEIC converts to a browser-readable JPEG at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
    await page.goto('/');
    const result = await page.evaluate(async (base64) => {
      const modulePath = '/src/lib/image-upload.ts';
      const { prepareImageUpload } = await import(modulePath);
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const source = new File([bytes], 'Фото.HEIC', { type: '' });
      const file = await prepareImageUpload(source);
      const bitmap = await createImageBitmap(file);
      try {
        return {
          name: file.name,
          mime: file.type,
          signature: [...new Uint8Array(await file.slice(0, 3).arrayBuffer())],
          width: bitmap.width,
          height: bitmap.height,
        };
      } finally {
        bitmap.close();
      }
    }, sample);
    expect(result).toEqual({
      name: 'Фото.jpg',
      mime: 'image/jpeg',
      signature: [255, 216, 255],
      width: 451,
      height: 461,
    });
  });
}

test('a corrupt HEIC is rejected by the real browser decoder', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
  await page.goto('/');
  const message = await page.evaluate(async () => {
    const modulePath = '/src/lib/image-upload.ts';
    const { prepareImageUpload } = await import(modulePath);
    try {
      await prepareImageUpload(new File(['broken'], 'broken.heic', { type: 'image/heic' }));
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : '';
    }
  });
  expect(message).toContain('Не удалось преобразовать HEIC/HEIF');
});
