import { test, expect, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:https';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
let server: Server;
let directory: string;
let updated = false;
const worker = readFileSync(resolve('dist/genfactory-sw.js'), 'utf8');
const buildId = worker.match(/const VERSION = "([^"]+)"/)![1];
const agent = JSON.parse(readFileSync(resolve('tests/fixtures/agent.json'), 'utf8'));
test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'genfactory-sw-test-'));
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(directory, 'key.pem'),
      '-out',
      join(directory, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=genfactory.test',
    ],
    { stdio: 'ignore' },
  );
  server = createServer(
    { key: readFileSync(join(directory, 'key.pem')), cert: readFileSync(join(directory, 'cert.pem')) },
    (req, res) => {
      const path = new URL(req.url!, 'https://genfactory.test').pathname;
      const target =
        path === '/genfactory-sw.js' || path.startsWith('/assets/') || path.startsWith('/media/')
          ? path.slice(1)
          : 'index.html';
      try {
        let data = readFileSync(resolve('dist', target));
        if (updated && target.endsWith('.js'))
          data = Buffer.from(data.toString().replaceAll(buildId, 'release-two'));
        res.writeHead(200, {
          'Content-Type':
            (
              {
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.html': 'text/html',
                '.woff2': 'font/woff2',
                '.svg': 'image/svg+xml',
              } as Record<string, string>
            )[extname(target)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end();
      }
    },
  );
  await new Promise<void>((r) => server.listen(5443, '0.0.0.0', r));
});
test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(directory, { recursive: true, force: true });
});
test.beforeEach(() => {
  updated = false;
});
async function setup(page: Page, running = false, path = '/agent') {
  let writes = 0;
  await page.addInitScript(() => localStorage.setItem('genfactory.session', 'test-session'));
  await page.route('**/api/**', (route) => {
    if (route.request().method() !== 'GET') writes++;
    const url = new URL(route.request().url());
    let body: unknown = {};
    if (url.pathname === '/api/init') body = { user: { id: 7 }, balances: { RUB: '100' } };
    else if (url.pathname === '/api/aimodels') body = [agent];
    else if (url.pathname.startsWith('/api/aimodel/')) body = { tools: [] };
    else if (url.pathname === '/api/conversation')
      body = {
        items: running ? [{ id: 1, userId: 7, name: 'Running work', status: 'LOADING' }] : [],
        pages: 1,
        total: running ? 1 : 0,
      };
    return route.fulfill({ json: body });
  });
  await page.goto(path);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(page.getByRole('button', { name: 'Обновить приложение' })).toHaveCount(0);
  return () => writes;
}
async function release(page: Page) {
  updated = true;
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  await expect(page.getByRole('button', { name: 'Обновить приложение' })).toBeVisible();
}
test('production worker updates on demand, preserves draft and never resends a request', async ({ page }) => {
  const writes = await setup(page);
  await page.getByLabel('Ваш запрос', { exact: true }).fill('Сохранить этот черновик после обновления');
  await release(page);
  await expect(page.getByLabel('Ваш запрос', { exact: true })).toHaveValue(
    'Сохранить этот черновик после обновления',
  );
  await page.getByRole('button', { name: 'Обновить приложение' }).click();
  await page.waitForLoadState('load');
  await page.getByRole('button', { name: /Восстановить/ }).click();
  await expect(page.getByLabel('Ваш запрос', { exact: true })).toHaveValue(
    'Сохранить этот черновик после обновления',
  );
  await expect(page.getByRole('button', { name: 'Обновить приложение' })).toHaveCount(0);
  expect(writes()).toBe(0);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
});
test('update is disabled while a server generation is running', async ({ page }) => {
  await setup(page, true);
  await release(page);
  await expect(page.getByRole('button', { name: 'Обновить приложение' })).toBeDisabled();
});
test('storage failure prevents reload and preserves the typed draft', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('genfactory.draft.')) throw new Error('Quota exceeded');
      original.call(this, key, value);
    };
  });
  await page.getByLabel('Ваш запрос', { exact: true }).fill('Черновик нельзя потерять');
  await release(page);
  await page.getByRole('button', { name: 'Обновить приложение' }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось сохранить черновик');
  await expect(page.getByLabel('Ваш запрос', { exact: true })).toHaveValue('Черновик нельзя потерять');
});
test('a production bundle on localhost does not register the worker', async ({ page }) => {
  await page.goto('https://localhost:5443/');
  await expect(page.getByRole('heading').first()).toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length))).toBe(0);
});

test('updating one tab does not reload another tab with an unfinished draft', async ({ page, context }) => {
  await setup(page);
  const other = await context.newPage();
  await setup(other);
  await other.getByLabel('Ваш запрос', { exact: true }).fill('Не перезагружать другую вкладку');
  await release(page);
  await page.getByRole('button', { name: 'Обновить приложение' }).click();
  await expect(other.getByRole('button', { name: 'Обновить приложение' })).toBeVisible();
  await expect(other.getByLabel('Ваш запрос', { exact: true })).toHaveValue(
    'Не перезагружать другую вкладку',
  );
});

test('a pending POST blocks reload even before the server reports a running job', async ({ page }) => {
  await setup(page);
  let entered = false;
  let finish!: () => void;
  const wait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/api/conversation', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    entered = true;
    await wait;
    await route.fulfill({ status: 503, json: { message: 'Test rejection; no generation submitted' } });
  });
  await page.getByLabel('Ваш запрос', { exact: true }).fill('Запрос ещё отправляется');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => entered).toBeTruthy();
  try {
    await release(page);
    await expect(page.getByRole('button', { name: 'Обновить приложение' })).toBeDisabled();
  } finally {
    finish();
  }
  await expect(page.getByRole('button', { name: 'Обновить приложение' })).toBeEnabled();
});

test('content studio preserves its draft and controls across a worker update without sending', async ({
  page,
}) => {
  const writes = await setup(page, false, '/chat');
  await page.getByLabel('Запрос', { exact: true }).fill('Сохранить идею студии при обновлении');
  await page.getByRole('button', { name: 'Изображение', exact: true }).click();
  await release(page);
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Обновить приложение' }).click(),
  ]);
  await expect(page.getByLabel('Запрос', { exact: true })).toHaveValue(
    'Сохранить идею студии при обновлении',
  );
  await expect(page.getByRole('button', { name: 'Изображение', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Обновить приложение' })).toHaveCount(0);
  expect(writes()).toBe(0);
});

test('content studio refuses a worker update when its draft cannot be saved', async ({ page }) => {
  const writes = await setup(page, false, '/chat');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('genfactory.draft.')) throw new Error('Quota exceeded');
      original.call(this, key, value);
    };
  });
  await page.getByLabel('Запрос', { exact: true }).fill('Не потерять черновик студии');
  await release(page);
  await page.getByRole('button', { name: 'Обновить приложение' }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось сохранить черновик');
  await expect(page.getByLabel('Запрос', { exact: true })).toHaveValue('Не потерять черновик студии');
  expect(writes()).toBe(0);
});
