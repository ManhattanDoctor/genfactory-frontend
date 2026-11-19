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

for (const type of ['DOCUMENT', 'AUDIO']) {
  test(`${type} uses its generated thumbnail and preserves original playback`, async ({ page }) => {
    const originalRequests: string[] = [];
    await page.route('**/fixture-document-original', (route) => {
      originalRequests.push(route.request().url());
      return route.fulfill({
        contentType: 'audio/wav',
        body: readFileSync(new URL('../fixtures/audio.wav', import.meta.url)),
      });
    });
    await page.route('**/fixture-document-poster', (route) =>
      route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
          'base64',
        ),
      }),
    );
    await page.goto('/tests/fixtures/media-refresh.html');
    await page.waitForFunction(() => typeof (window as any).renderMedia === 'function');
    const render = (controls: boolean, status = 'READY') =>
      page.evaluate(
        ({ type, controls, status }) => {
          (window as any).renderMedia(
            {
              name: 'Document preview',
              type,
              mime: type === 'AUDIO' ? 'audio/mpeg' : 'application/pdf',
              path: '/fixture-document-original',
              preview: {
                image: {
                  status,
                  url: '/fixture-document-poster',
                  width: 768,
                  height: 256,
                  size: 68,
                  mime: 'image/png',
                },
              },
            },
            controls,
          );
        },
        { type, controls, status },
      );
    await render(false);
    await expect(page.locator('.media-loading-frame')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('img')).toHaveAttribute('src', /fixture-document-poster$/);
    expect(originalRequests).toHaveLength(0);
    await render(true);
    if (type === 'AUDIO') {
      await expect(page.locator('audio')).toHaveAttribute('src', /fixture-document-original$/);
      await expect(page.locator('audio')).toHaveAttribute('controls', '');
    } else {
      await expect(page.locator('img')).toHaveAttribute('src', /fixture-document-poster$/);
      expect(originalRequests).toHaveLength(0);
    }
    await render(false, 'FAILED');
    await expect(page.locator('img')).toHaveCount(0);
    await expect(page.locator('audio')).toHaveCount(0);
    await expect(page.locator('.media-loading-frame')).toHaveCount(0);
  });
}

test('shows video controls after metadata without waiting for the first decoded frame', async ({ page }) => {
  // Some browsers load only metadata until the user starts playback.
  await page.addInitScript(() => {
    const addEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (this instanceof HTMLVideoElement && type === 'loadeddata') return;
      return addEventListener.call(this, type, listener, options);
    };
  });
  await page.clock.install();
  await page.route('**/fixture-video*', (route) =>
    route.fulfill({
      contentType: 'video/mp4',
      body: readFileSync(new URL('../fixtures/preview.mp4', import.meta.url)),
    }),
  );
  await page.goto('/tests/fixtures/media-refresh.html');
  await page.waitForFunction(() => typeof (window as any).renderMedia === 'function');
  await page.evaluate(() => {
    (window as any).renderMedia(
      { name: 'Studio video', type: 'VIDEO', mime: 'video/mp4', path: '/fixture-video' },
      true,
      { showLoadingState: true, autoPlay: false },
    );
  });
  const video = page.locator('video');
  await expect
    .poll(() => video.evaluate((node) => (node as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(1);
  await expect(page.locator('.media-loading-frame')).toHaveAttribute('aria-busy', 'false');
  await expect(video).toHaveJSProperty('paused', true);
  await page.clock.fastForward(31_000);
  await expect(page.locator('.media-loading-error')).toHaveCount(0);
  // A subsequent playback error must still be visible after metadata succeeded.
  await video.dispatchEvent('error');
  await expect(page.locator('.media-loading-error')).toContainText('Не удалось загрузить');
});

test('disabled video thumbnails use a placeholder until the poster is ready without fetching the original', async ({
  page,
}) => {
  const originals: string[] = [];
  await page.clock.install();
  await page.route('**/fixture-video*', (route) => {
    originals.push(route.request().url());
    return route.abort();
  });
  await page.route('**/fixture-poster', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.goto('/tests/fixtures/media-refresh.html');
  await page.waitForFunction(() => typeof (window as any).renderMedia === 'function');
  const render = (status: string) =>
    page.evaluate((status) => {
      (window as any).renderMedia(
        {
          name: 'Attachment',
          type: 'VIDEO',
          mime: 'video/mp4',
          path: '/fixture-video',
          preview: {
            image: {
              status,
              url: status === 'READY' ? '/fixture-poster' : undefined,
              width: 1,
              height: 1,
              mime: 'image/png',
              size: 68,
            },
          },
        },
        false,
        { isPlaybackDisabled: true },
      );
    }, status);
  for (const status of ['PENDING', 'FAILED']) {
    await render(status);
    await expect(page.locator('video')).toHaveCount(0);
    await expect(page.locator('.file-placeholder')).toBeVisible();
    await page.clock.fastForward(31000);
    await expect(page.locator('.media-loading-error')).toHaveCount(0);
  }
  await render('READY');
  await expect(page.locator('img')).toBeVisible();
  await expect(page.locator('.media-loading-frame')).toHaveAttribute('aria-busy', 'false');
  await page.locator('img').dispatchEvent('error');
  await expect(page.locator('.file-placeholder')).toBeVisible();
  await expect(page.locator('.media-loading-error')).toHaveCount(0);
  expect(originals).toHaveLength(0);
});

test('a new preview preserves the original video node, position and playback state', async ({ page }) => {
  await page.route('**/fixture-poster*', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.goto('/tests/fixtures/media-refresh.html');
  await page.waitForFunction(() => typeof (window as any).renderMedia === 'function');
  const render = (ready: boolean, path = '/tests/fixtures/preview.mp4') =>
    page.evaluate(
      ({ ready, path }) => {
        (window as any).renderMedia(
          {
            name: 'Result',
            type: 'VIDEO',
            mime: 'video/mp4',
            path,
            preview: {
              image: ready
                ? {
                    status: 'READY',
                    url: '/fixture-poster',
                    width: 1,
                    height: 1,
                    mime: 'image/png',
                    size: 68,
                  }
                : { status: 'PENDING' },
            },
          },
          true,
          { showLoadingState: true, autoPlay: false },
        );
      },
      { ready, path },
    );
  await render(false);
  const video = page.locator('video');
  await expect(page.locator('.media-loading-frame')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).readyState)).toBe(4);
  await video.evaluate(async (node) => {
    const v = node as HTMLVideoElement;
    (window as any).originalVideo = v;
    v.pause();
    await new Promise<void>((resolve) => {
      v.addEventListener('seeked', () => resolve(), { once: true });
      v.currentTime = 0.2;
    });
  });
  expect(await video.evaluate((node) => (node as HTMLVideoElement).currentTime)).toBeCloseTo(0.2, 2);
  await render(true);
  await expect(video).toHaveAttribute('poster', /fixture-poster$/);
  const afterPoster = await video.evaluate((node) => {
    const v = node as HTMLVideoElement;
    return { sameNode: v === (window as any).originalVideo, time: v.currentTime, paused: v.paused };
  });
  expect(afterPoster).toMatchObject({ sameNode: true, paused: true });
  expect(afterPoster.time).toBeCloseTo(0.2, 2);
  await video.evaluate(async (node) => {
    const v = node as HTMLVideoElement;
    v.muted = true;
    v.loop = true;
    await v.play();
  });
  await render(false);
  expect(
    await video.evaluate((v) => v === (window as any).originalVideo && !(v as HTMLVideoElement).paused),
  ).toBe(true);
  await render(true, '/tests/fixtures/preview.mp4?version=other');
  await expect.poll(() => video.evaluate((v) => v === (window as any).originalVideo)).toBe(false);
});

test('markdown links preserve focus and DOM identity while using current file metadata', async ({ page }) => {
  await page.goto('/tests/fixtures/media-refresh.html');
  await page.waitForFunction(() => typeof (window as any).renderMessage === 'function');
  await page.evaluate(() => (window as any).renderMessage('First'));
  const link = page.getByRole('link', { name: 'Файл', exact: true });
  await link.focus();
  await link.evaluate((node) => {
    (window as any).originalLink = node;
  });
  await page.evaluate(() => (window as any).renderMessage('Updated'));
  await expect(link).toBeFocused();
  expect(await link.evaluate((node) => node === (window as any).originalLink)).toBe(true);
  await link.click();
  await expect.poll(() => page.evaluate(() => (window as any).openedName)).toBe('Updated');
});
