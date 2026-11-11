import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { catalogProvider, catalogResponse } from './modelCatalog';
const catalog = JSON.parse(readFileSync(new URL('../fixtures/catalog.json', import.meta.url), 'utf8'));
const pageOf = (items: unknown[]) => ({ items, total: items.length, pages: 1, pageSize: 24, pageIndex: 0 });

async function setup(page: Page, delayed = false, fail = false) {
  await page.addInitScript(() => localStorage.setItem('genfactory.session', 'direct-task-test'));
  await page.routeWebSocket('**/socket.io/**', () => {});
  const state = {
    tasks: [] as any[],
    conversationWrites: [] as string[],
    files: [] as any[],
    release: () => {},
    assistantCatalog: 0,
  };
  const wait = delayed
    ? new Promise<void>((resolve) => {
        state.release = resolve;
      })
    : Promise.resolve();
  await page.route('**/test-video.mp4', (route) =>
    route.fulfill({
      contentType: 'video/mp4',
      body: readFileSync(new URL('../fixtures/preview.mp4', import.meta.url)),
    }),
  );
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/api/task' && route.request().method() === 'GET')
      return route.fulfill({ json: [] });
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    if (request.method() !== 'GET' && path.includes('/conversation')) state.conversationWrites.push(path);
    let body: any = {};
    if (path === '/api/init') body = { user: { id: 7 }, balances: { RUB: '100000' } };
    else if (path === '/api/aimodels') {
      const provider = catalogProvider(url);
      if (provider === 'OPEN_AI_CONVERSATION') state.assistantCatalog++;
      body = catalog.filter((model: any) => model.reference.provider === provider);
    } else if (path === '/api/task' && request.method() === 'POST') {
      const input = request.postDataJSON();
      state.tasks.push(input);
      const index = state.tasks.length;
      await wait;
      if (fail) return route.fulfill({ status: 502, json: { message: 'Provider unavailable' } });
      const video = input.model === 'OPEN_ROUTER_VIDEO';
      const file = {
        id: 100 + index,
        userId: 7,
        uid: 'direct-result',
        name: video ? 'Результат.mp4' : 'Результат.png',
        type: video ? 'VIDEO' : 'IMAGE',
        mime: video ? 'video/mp4' : 'image/png',
        path: video ? '/test-video.mp4' : '/media/gallery-1.jpg',
        createdDate: new Date().toISOString(),
        origin: {
          kind: 'GENERATION',
          operationId: 'task:direct-test',
          sourceFileIds: input.task.fileIds,
          generation: {
            model: { provider: input.model, model: input.options.model },
            prompt: input.task.prompt,
            options: input.options,
          },
        },
      };
      state.files.unshift(file);
      body = {
        result: video
          ? { externalId: 'provider-id', fileId: file.id }
          : [{ source: 'data:image/png;base64,aW1hZ2U=', mime: 'image/png' }],
        cost: { status: 'FINAL', amounts: [{ amount: '1', coinId: 'RUB' }] },
        files: [file],
      };
    } else if (path === '/api/file') {
      const type = JSON.parse(url.searchParams.get('conditions') || '{}').type;
      body = pageOf(state.files.filter((file) => !type || file.type === type));
    } else if (/^\/api\/file\/\d+$/.test(path))
      body = state.files.find((file) => file.id === Number(path.split('/').pop()));
    else if (path === '/api/conversation' || path === '/api/fileTag' || path === '/api/paymentTransaction')
      body = pageOf([]);
    await route.fulfill({ json: catalogResponse(request.url(), body) });
  });
  return state;
}

for (const kind of ['image', 'video'] as const) {
  test(`${kind} uses one direct task with isSaveResult and restores saved results after reload`, async ({
    page,
  }) => {
    const state = await setup(page);
    await page.goto(`/${kind}`);
    await page.getByRole('textbox', { name: /^(Идея|Идея ролика)$/ }).fill('Красная чашка на столе');
    const send = page.getByRole('button', {
      name: kind === 'image' ? 'Собрать изображение' : 'Собрать видео',
      exact: true,
    });
    await expect(send).toBeEnabled();
    await send.click();
    await expect.poll(() => state.tasks.length).toBe(1);
    await expect(page.locator(kind === 'image' ? '.image-result' : '.video-result')).toHaveCount(1);
    expect(state.tasks[0].isSaveResult).toBe(true);
    expect(state.tasks[0].task.prompt).toContain('Красная чашка на столе');
    expect(state.tasks[0].task.prompt).not.toMatch(/Genfactory:|вызови IMAGE|вызови VIDEO|Подготовь задачу/);
    expect(state.tasks[0].task.session).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.tasks[0].task.fileIds).toEqual([]);
    expect(state.tasks[0]).not.toHaveProperty('conversationId');
    expect(state.assistantCatalog).toBe(0);
    expect(state.conversationWrites).toEqual([]);
    await expect(page).not.toHaveURL(/conversation=/);
    await page.reload();
    await expect(
      page
        .getByRole('button', {
          name: kind === 'image' ? 'Открыть Результат.png' : 'Открыть Результат.mp4',
          exact: true,
        })
        .first(),
    ).toBeVisible();
    await expect(page.locator(kind === 'image' ? '.image-result' : '.video-result')).toHaveCount(1);
    expect(state.tasks).toHaveLength(1);
  });
}

test('a direct task remains visible when navigating away and returning, without a second POST', async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto('/image');
  await page.locator('#img-draft').fill('Чашка');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  await expect(page.getByRole('button', { name: 'Активные работы: 1', exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Библиотека', exact: true }).first().click();
  await page.getByRole('link', { name: 'Изображения', exact: true }).first().click();
  await expect(page.locator('.image-result-pending')).toBeVisible();
  state.release();
  await expect(page.locator('.image-result')).toHaveCount(1);
  expect(state.tasks).toHaveLength(1);
  expect(state.conversationWrites).toEqual([]);
});

test('a failed direct task keeps the draft and does not retry or fall back to a conversation', async ({
  page,
}) => {
  const state = await setup(page, false, true);
  await page.goto('/image');
  await page.locator('#img-draft').fill('Чашка');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect(page.getByText(/Сервис временно недоступен/).first()).toBeVisible();
  await expect(page.locator('#img-draft')).toHaveValue('Чашка');
  await expect(page.getByRole('button', { name: 'Собрать изображение', exact: true })).toBeEnabled();
  expect(state.tasks).toHaveLength(1);
  expect(state.conversationWrites).toEqual([]);
});

test('several direct image tasks run concurrently without blocking the editor or overwriting the next draft', async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto('/image');
  const draft = page.locator('#img-draft');
  const send = page.getByRole('button', { name: 'Собрать изображение', exact: true });
  await draft.fill('Первая генерация');
  await send.click();
  await expect.poll(() => state.tasks.length).toBe(1);
  await expect(send).toBeEnabled();
  await draft.fill('Вторая генерация');
  await send.click();
  await expect.poll(() => state.tasks.length).toBe(2);
  await expect(page.getByRole('button', { name: 'Активные работы: 2', exact: true }).first()).toBeVisible();
  await expect(page.locator('.image-result-pending')).toHaveCount(2);
  await draft.fill('Следующий черновик');
  state.release();
  await expect(page.locator('.image-result')).toHaveCount(2);
  await expect(page.locator('.image-result-pending')).toHaveCount(0);
  await expect(draft).toHaveValue('Следующий черновик');
  expect(state.tasks[0].task.session).not.toBe(state.tasks[1].task.session);
  expect(state.conversationWrites).toEqual([]);
});

test('video templates stay mounted while a request starts and fails', async ({ page }) => {
  const state = await setup(page, true, true);
  await page.goto('/video');
  const template = page.locator('.ds-template-card video').first();
  await expect(template).toBeVisible();
  const original = await template.elementHandle();
  await page.locator('#vd-draft').fill('Проверка стабильности галереи');
  await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  await expect(page.locator('.image-result-pending')).toHaveCount(1);
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
  state.release();
  const error = page.getByRole('alert').filter({ hasText: 'Сервис временно недоступен' }).first();
  await expect(error).toBeVisible();
  expect(await error.textContent()).not.toContain('..');
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
  expect(state.tasks).toHaveLength(1);
});

test('the newest generated video appears first while existing media stay mounted', async ({ page }) => {
  const state = await setup(page, true);
  for (const [id, name, date] of [
    [20, 'Позавчера.mp4', '2026-01-01T12:00:00Z'],
    [21, 'Вчера.mp4', '2026-01-02T12:00:00Z'],
  ] as const)
    state.files.push({
      id,
      userId: 7,
      uid: String(id),
      name,
      type: 'VIDEO',
      mime: 'video/mp4',
      path: '/test-video.mp4',
      createdDate: date,
      origin: {
        kind: 'GENERATION',
        generation: {
          model: { provider: 'OPEN_ROUTER_VIDEO', model: 'x-ai/grok-imagine-video-1.5-lite' },
          prompt: name,
          options: {},
        },
      },
    });
  await page.goto('/video');
  const results = page.locator('.video-result');
  await expect(results).toHaveCount(2);
  const existingVideo = await results.first().locator('video').elementHandle();
  const template = page.locator('.ds-template-card video').first();
  await expect(template).toBeVisible();
  const existingTemplate = await template.elementHandle();
  await page.locator('#vd-draft').fill('Новый ролик');
  await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  state.release();
  await expect(results).toHaveCount(3);
  await expect(results.first().locator('.image-result-open')).toHaveAttribute(
    'aria-label',
    'Открыть Результат.mp4',
  );
  const first = await results.first().boundingBox();
  const grid = await page.locator('.masonry-cards').boundingBox();
  expect(Math.abs(first!.x - grid!.x)).toBeLessThan(1);
  expect(Math.abs(first!.y - grid!.y)).toBeLessThan(1);
  expect(await existingVideo!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await existingTemplate!.evaluate((element) => element.isConnected)).toBe(true);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator('.masonry-cards')).toHaveAttribute('data-columns', width === 390 ? '2' : '4');
    const newest = await results.first().boundingBox();
    const wall = await page.locator('.masonry-cards').boundingBox();
    expect(Math.abs(newest!.x - wall!.x)).toBeLessThan(1);
    expect(Math.abs(newest!.y - wall!.y)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`newest-video-${width}.png`) });
  }
  expect(state.tasks).toHaveLength(1);
});

test('video gallery keeps existing cards in their columns on submit', async ({ page }) => {
  const state = await setup(page, true, true);
  await page.goto('/video');
  const card = page.locator('.ds-template-card').first();
  await expect(card).toBeVisible();
  const before = await card.boundingBox();
  await page.locator('#vd-draft').fill('Проверка положения карточек');
  await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  await expect(page.locator('.image-result-pending')).toHaveCount(1);
  const during = await card.boundingBox();
  state.release();
  expect(during!.x).toBe(before!.x);
});

test('clearing old notices keeps future completion visible', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/image');
  const input = page.locator('#img-draft');
  await input.fill('Первый результат');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect.poll(() => state.files.length).toBe(1);
  await expect(page.locator('.image-result-pending')).toHaveCount(0);
  let release!: () => void;
  const wait = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/task', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await wait;
    return route.fulfill({ json: { result: [], cost: {}, files: [{ ...state.files[0], id: 102 }] } });
  });
  await input.fill('Второй результат');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect(page.locator('.image-result-pending')).toHaveCount(1);
  await page.getByRole('button', { name: 'Активные работы: 1', exact: true }).first().click();
  const jobs = page.getByRole('dialog', { name: 'Активные работы' });
  await expect(jobs.locator('.completed-job')).toHaveCount(1);
  await jobs.getByRole('button', { name: 'Очистить уведомления', exact: true }).click();
  release();
  await expect(page.getByRole('button', { name: 'Активные работы: 0', exact: true }).first()).toBeVisible();
  await expect(jobs.locator('.completed-job')).toHaveCount(1);
});
