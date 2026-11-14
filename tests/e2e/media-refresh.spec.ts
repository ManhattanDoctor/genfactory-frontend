import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function render(page: Page, signature: string, object = 'image') {
  await page.evaluate(
    ({ signature, object }) => {
      (window as any).renderMedia({
        name: 'Preview',
        type: 'IMAGE',
        mime: 'image/png',
        path: `/fixture-original?X-Amz-Signature=${signature}`,
        preview: {
          image: {
            status: 'READY',
            url: `/fixture-${object}?X-Amz-Signature=${signature}`,
            width: 1,
            height: 1,
            size: 68,
            mime: 'image/png',
          },
        },
      });
    },
    { signature, object },
  );
}

test('keeps loaded media through list refreshes and uses renewed URLs after failure', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/fixture-*', (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    });
  });
  await page.goto('/tests/fixtures/media-refresh.html');
  await page.waitForFunction(() => typeof (window as any).renderMedia === 'function');
  await render(page, 'first');
  const frame = page.locator('.media-loading-frame');
  await expect(frame).toHaveAttribute('aria-busy', 'false');
  await page.locator('img').evaluate((node) => {
    (window as any).originalMediaNode = node;
  });
  const count = requests.length;
  for (const signature of ['second', 'third', 'fourth']) await render(page, signature);
  await expect(page.locator('img')).toHaveAttribute(
    'src',
    new URL('/fixture-image?X-Amz-Signature=first', page.url()).href,
  );
  expect(await page.locator('img').evaluate((node) => node === (window as any).originalMediaNode)).toBe(true);
  expect(requests).toHaveLength(count);
  await expect(frame).toHaveAttribute('aria-busy', 'false');
  await page.locator('img').dispatchEvent('error');
  await expect(page.locator('img')).toHaveAttribute(
    'src',
    new URL('/fixture-image?X-Amz-Signature=fourth', page.url()).href,
  );
  await expect.poll(() => requests.length).toBe(count + 1);
  await render(page, 'fifth', 'new-image');
  await expect(page.locator('img')).toHaveAttribute(
    'src',
    new URL('/fixture-new-image?X-Amz-Signature=fifth', page.url()).href,
  );
  expect(await page.locator('img').evaluate((node) => node === (window as any).originalMediaNode)).toBe(
    false,
  );
  await expect(frame).toHaveAttribute('aria-busy', 'false');
});

test('keeps the video node and playback position when signatures rotate', async ({ page }) => {
  await page.route('**/fixture-video*', (route) =>
    route.fulfill({
      contentType: 'video/mp4',
      body: readFileSync(new URL('../fixtures/preview.mp4', import.meta.url)),
    }),
  );
  await page.goto('/tests/fixtures/media-refresh.html');
  await page.waitForFunction(() => typeof (window as any).renderMedia === 'function');
  const renderVideo = (signature: string) =>
    page.evaluate((signature) => {
      (window as any).renderMedia({
        name: 'Video',
        type: 'VIDEO',
        mime: 'video/mp4',
        path: `/fixture-video?X-Amz-Signature=${signature}`,
      });
    }, signature);
  await renderVideo('first');
  await expect(page.locator('.media-loading-frame')).toHaveAttribute('aria-busy', 'false');
  await page.locator('video').evaluate(async (element) => {
    const node = element as HTMLVideoElement;
    node.pause();
    (window as any).originalMediaNode = node;
    await new Promise<void>((resolve) => {
      node.addEventListener('seeked', () => resolve(), { once: true });
      node.currentTime = 0.2;
    });
    (window as any).originalMediaTime = node.currentTime;
  });
  await renderVideo('second');
  await expect(page.locator('video')).toHaveAttribute(
    'src',
    new URL('/fixture-video?X-Amz-Signature=first', page.url()).href,
  );
  expect(
    await page
      .locator('video')
      .evaluate(
        (node) =>
          node === (window as any).originalMediaNode &&
          (node as HTMLVideoElement).currentTime === (window as any).originalMediaTime,
      ),
  ).toBe(true);
});
