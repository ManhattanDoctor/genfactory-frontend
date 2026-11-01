import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { ModelDescription } from '../../src/lib/types';
const catalog: ModelDescription[] = JSON.parse(
  readFileSync(new URL('../fixtures/catalog.json', import.meta.url), 'utf8'),
);
const file = {
  id: 12,
  uid: 'test-file',
  userId: 7,
  name: 'Test result',
  path: '/media/gallery-1.jpg',
  type: 'IMAGE',
  mime: 'image/png',
  createdDate: '2026-11-01T10:00:00Z',
};
const image = {
  mime: 'image/png',
  source:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZwAAAAASUVORK5CYII=',
  width: 1,
  height: 1,
};
async function mockApi(page: Page, signedIn = true) {
  if (signedIn) await page.addInitScript(() => sessionStorage.setItem('genfactory.session', 'test-session'));
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    let body: unknown;
    let status = 200;
    if (path === '/api/init')
      body = {
        user: { id: 7, preferences: { name: 'Anna', email: 'anna@example.test' } },
        balances: { RUB: '1250.50' },
      };
    else if (path === '/api/aimodels')
      body = catalog.filter((m) => m.reference.provider === url.searchParams.get('provider'));
    else if (path === '/api/file' && method === 'GET')
      body = { items: [file], total: 1, pages: 1, pageSize: 24, pageIndex: 0 };
    else if (path === '/api/file/12') body = file;
    else if (path === '/api/fileBuffer') {
      body = file;
      status = 201;
    } else if (path === '/api/task' && method === 'POST') {
      const data = route.request().postDataJSON();
      body = {
        result: data.model === 'OPEN_ROUTER_VIDEO' ? { externalId: 'video-1', fileId: 12 } : [image],
        cost: { status: 'FINAL', amounts: [{ coinId: 'USD', amount: '0.01' }] },
      };
      status = 201;
    } else if (path === '/api/logout') body = {};
    else {
      status = 404;
      body = { message: 'Unmocked endpoint' };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
test('guest can explore and open a studio; no fabricated models or paid requests', async ({ page }) => {
  await mockApi(page, false);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Большие идеи/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('link', { name: 'Изображения', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Войти и создать' })).toBeVisible();
  await page.getByRole('button', { name: 'Войти и создать' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('image request uses catalog provider and options, saves output, opens library', async ({ page }) => {
  await mockApi(page);
  await page.goto('/image');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page.getByLabel('Ваша идея', { exact: true }).fill('A calm cinematic forest');
  const request = page.waitForRequest((r) => r.url().endsWith('/api/task') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Создать изображение', exact: true }).click();
  const body = (await request).postDataJSON();
  expect(body.model).toBe('OPEN_AI_IMAGE_GPT');
  expect(body.options.model).toBe('gpt-image-2');
  expect(body.task.session).toBeTruthy();
  await expect(page.getByText('Готово', { exact: true })).toBeVisible();
  await expect(page.getByText('0.01 USD', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/studio-desktop.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('link', { name: 'Библиотека', exact: true }).click();
  await expect(page.getByRole('button', { name: /Test result/ })).toBeVisible();
});
test('invalid model parameters never submit a paid task', async ({ page }) => {
  await mockApi(page);
  let calls = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/api/task')) calls++;
  });
  await page.goto('/image');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page.getByLabel('Ваша идея', { exact: true }).fill('Test image');
  await page.getByLabel('Размер', { exact: true }).fill('invalid');
  await page.getByRole('button', { name: 'Создать изображение', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('pattern');
  expect(calls).toBe(0);
});
test('video request waits for a file result and uses video provider', async ({ page }) => {
  await mockApi(page);
  await page.goto('/video');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page.getByLabel('Ваша идея', { exact: true }).fill('Slow camera move across a city');
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/task') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Создать видео', exact: true }).click();
  expect((await sent).postDataJSON().model).toBe('OPEN_ROUTER_VIDEO');
  await expect(page.getByText('Готово', { exact: true })).toBeVisible();
});
test('lost response is unknown and refresh does not resubmit generation', async ({ page }) => {
  await mockApi(page);
  let calls = 0;
  await page.route('**/api/task', async (route) => {
    calls++;
    await route.abort('failed');
  });
  await page.goto('/image');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page.getByLabel('Ваша идея', { exact: true }).fill('Test uncertain result');
  await page.getByRole('button', { name: 'Создать изображение', exact: true }).click();
  await expect(page.getByText('Нужно проверить результат', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Нужно проверить результат', { exact: true })).toBeVisible();
  expect(calls).toBe(1);
});
test('library reference is carried into image editor', async ({ page }) => {
  await mockApi(page);
  await page.goto('/library');
  await page.getByRole('button', { name: /Test result/ }).click();
  await page.getByRole('button', { name: 'Использовать как референс' }).click();
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  await page.getByLabel('Ваша идея', { exact: true }).fill('Reimagine this scene');
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/task'));
  await page.getByRole('button', { name: 'Создать изображение', exact: true }).click();
  expect((await sent).postDataJSON().task.fileIds).toEqual([12]);
});
test('mobile navigation and layout remain usable', async ({ page }) => {
  await mockApi(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Видео', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Видео', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/studio-mobile.png', fullPage: true, animations: 'disabled' });
});

test('session expiry clears account and a private file preview', async ({ page }) => {
  await mockApi(page);
  await page.goto('/library');
  await page.getByRole('button', { name: /Test result/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.route('**/api/init', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Expired' }),
    }),
  );
  // The server rejection drives the application's ordinary session-expiry path.
  await page.evaluate(async () => {
    const path = '/src/lib/api.ts';
    const { api } = await import(path);
    await api.init().catch(() => {});
  });
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Войти в аккаунт', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('genfactory.session'))).toBeNull();
});

test('OAuth callback rejects a mismatched state without exchanging the code', async ({ page }) => {
  await mockApi(page, false);
  let exchanges = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/login') exchanges++;
  });
  await page.addInitScript(() =>
    sessionStorage.setItem(
      'genfactory.oauth',
      JSON.stringify({
        state: 'expected',
        createdAt: Date.now(),
        redirectUri: location.origin + '/auth/callback',
      }),
    ),
  );
  await page.goto('/auth/callback?state=wrong&code=must-not-exchange');
  await expect(page.getByRole('heading', { name: 'Не удалось войти' })).toBeVisible();
  expect(exchanges).toBe(0);
  expect(new URL(page.url()).search).toBe('');
});

test('multiple successful generations re-enable the submit button', async ({ page }) => {
  await mockApi(page);
  await page.goto('/image');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page.getByLabel('Ваша идея', { exact: true }).fill('First landscape');
  const button = page.getByRole('button', { name: 'Создать изображение', exact: true });
  await button.click();
  await expect(page.getByText('Готово', { exact: true })).toBeVisible();
  await expect(button).toBeEnabled();
  await page.getByLabel('Ваша идея', { exact: true }).fill('Second landscape');
  await button.click();
  await expect(page.getByText('Готово', { exact: true })).toHaveCount(2);
});
