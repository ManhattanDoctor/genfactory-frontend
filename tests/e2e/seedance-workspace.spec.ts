import { mediaTaskResponse } from './mediaTaskMock';
import { catalogProvider, catalogResponse } from './modelCatalog';
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const catalog = JSON.parse(
  readFileSync(new URL('../fixtures/seedance-catalog.json', import.meta.url), 'utf8'),
);
const agent = JSON.parse(readFileSync(new URL('../fixtures/agent.json', import.meta.url), 'utf8'));
const source = {
  id: 12,
  uid: 'source',
  userId: 7,
  name: 'Чашка.png',
  path: '/media/gallery-1.jpg',
  type: 'IMAGE',
  mime: 'image/png',
  createdDate: '2026-11-05T12:00:00Z',
};
const result = {
  ...source,
  id: 13,
  uid: 'video-result',
  name: 'Чашка.png',
  path: '/media/gallery-1.jpg',
  type: 'VIDEO',
  mime: 'video/mp4',
  preview: { image: { status: 'READY', url: '/media/gallery-1.jpg' } },
  origin: {
    kind: 'GENERATION',
    sourceFileIds: [12],
    generation: {
      model: catalog[0].reference,
      prompt: 'Медленный поворот чашки',
      options: { duration: 4, aspectRatio: '1:1' },
    },
  },
};
const pagination = (items: unknown[]) => ({
  items,
  total: items.length,
  pages: 1,
  pageSize: 24,
  pageIndex: 0,
});
async function setup(page: Page, guest = false) {
  if (!guest) await page.addInitScript(() => localStorage.setItem('genfactory.session', 'video-test'));
  await page.routeWebSocket('**/socket.io/**', () => {});
  const state = {
    creates: [] as any[],
    sends: [] as any[],
    tasks: [] as any[],
    completed: undefined as any,
    conversation: undefined as any,
    messages: [] as any[],
    uploads: 0,
  };
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/api/task' && route.request().method() === 'GET')
      return route.fulfill({ json: [] });
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    let body: any = {};
    if (path === '/api/init') body = { user: { id: 7 }, balances: { RUB: '10000' } };
    else if (path === '/api/aimodels')
      body =
        catalogProvider(url) === 'OPEN_ROUTER_CONVERSATION'
          ? [agent]
          : catalog.filter((m: any) => m.reference.provider === catalogProvider(url));
    else if (path === '/api/task' && req.method() === 'POST') {
      const input = req.postDataJSON();
      state.tasks.push(input);
      body = mediaTaskResponse(result, input);
      state.completed = body.files[0];
    } else if (path === '/api/conversation' && req.method() === 'POST') {
      state.creates.push(req.postDataJSON());
      body = state.conversation = {
        ...req.postDataJSON(),
        id: 101,
        userId: 7,
        status: 'LOADED',
        createdDate: source.createdDate,
      };
    } else if (path === '/api/conversation') body = pagination([]);
    else if (path === '/api/conversation/101') body = state.conversation;
    else if (path === '/api/conversation/101/message' && req.method() === 'POST') {
      state.sends.push(req.postDataJSON());
      body = { ...req.postDataJSON(), id: 1, files: [source] };
      state.messages = [{ id: 2, role: 'ASSISTANT', text: 'Готово', files: [result] }, body];
    } else if (path === '/api/conversation/101/message') body = pagination(state.messages);
    else if (path === '/api/file/12') body = source;
    else if (path === '/api/file/13') body = state.completed || result;
    else if (path === '/api/file' && req.method() === 'POST') {
      state.uploads++;
      body = source;
    } else if (path === '/api/file')
      body = pagination(
        JSON.parse(url.searchParams.get('conditions') || '{}').type === 'VIDEO'
          ? state.tasks.length || state.sends.length
            ? [state.completed || result]
            : []
          : [source],
      );
    else if (path === '/api/fileTag') body = pagination([]);
    await route.fulfill({ json: catalogResponse(route.request().url(), body) });
  });
  return state;
}

test('seedance preserves selected settings, start frame and route through send and redo', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/video?studio=seedance');
  await expect(page.locator('.seedance-brand')).toBeVisible();
  await expect(page.locator('.ds-template-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toHaveText('Seedance 2.5');
  await expect(page.getByRole('button', { name: 'Длительность', exact: true })).toHaveText('8 с');
  await page.getByRole('button', { name: 'Добавить стартовый кадр' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Чашка.png Чашка.png 05.11.2026', exact: true })
    .click();
  await page.locator('#sd-draft').fill('Медленный поворот чашки');
  await page.getByRole('button', { name: 'Длительность', exact: true }).click();
  await page.getByRole('option', { name: '4 с', exact: true }).click();
  await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
  await expect(page).toHaveURL(/\/video\?studio=seedance$/);
  await expect(page.locator('.image-result')).toHaveCount(1);
  expect(state.tasks[0].task.fileIds).toEqual([12]);
  expect(state.tasks[0]).toMatchObject({
    isSaveResult: true,
    model: catalog[0].reference.provider,
    options: { model: catalog[0].reference.model, duration: 4, resolution: '480p' },
  });
  expect(state.creates).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
  await page.locator('.image-result').hover();
  await page.getByRole('button', { name: 'Переделать Чашка.png', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Убрать Чашка.png', exact: true })).toHaveCount(1);
  expect(state.tasks).toHaveLength(1);
  expect(state.uploads).toBe(0);
});
for (const width of [390, 1440])
  test(`seedance canvas and menus fit ${width}`, async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/video?studio=seedance');
    await expect(page.locator('.seedance-brand')).toBeVisible();
    for (const name of ['Модель', 'Стороны', 'Длительность', 'Звук', 'Структура ролика']) {
      await page.getByRole('button', { name, exact: true }).click();
      const list = page.getByRole('listbox', { name, exact: true });
      await expect(list).toBeVisible();
      const box = await list.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/seedance-${width}.png` });
  });
