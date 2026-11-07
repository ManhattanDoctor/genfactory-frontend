import { catalogProvider, catalogResponse } from './modelCatalog';
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const catalog = JSON.parse(readFileSync(new URL('../fixtures/banana-catalog.json', import.meta.url), 'utf8'));
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
async function setup(
  page: Page,
  answer = JSON.stringify({
    status: 'ready',
    title: 'Синяя чашка',
    prompt: 'A blue cup on white',
    observations: [{ fileId: 12, text: 'Чашка на белом фоне' }],
    clarifications: [],
    limitations: [],
  }),
) {
  await page.addInitScript(() => localStorage.setItem('genfactory.session', 'video-test'));
  await page.routeWebSocket('**/socket.io/**', () => {});
  const state = {
    creates: [] as any[],
    sends: [] as any[],
    conversation: undefined as any,
    messages: [] as any[],
    uploads: 0,
  };
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    let body: any = {};
    if (path === '/api/init') body = { user: { id: 7 }, balances: { RUB: '10000' } };
    else if (path === '/api/aimodels')
      body =
        catalogProvider(url) === 'OPEN_AI_CONVERSATION'
          ? [agent]
          : catalog.filter((m: any) => m.reference.provider === catalogProvider(url));
    else if (path === '/api/conversation' && req.method() === 'POST') {
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
      state.messages.push(
        { ...body, id: state.sends.length * 2 - 1 },
        { id: state.sends.length * 2, role: 'ASSISTANT', text: answer, files: [] },
      );
    } else if (path === '/api/conversation/101/message') body = pagination(state.messages);
    else if (path === '/api/file/12') body = source;
    else if (path === '/api/file/13') body = result;
    else if (path === '/api/file' && req.method() === 'POST') {
      state.uploads++;
      body = source;
    } else if (path === '/api/file')
      body = pagination(
        JSON.parse(url.searchParams.get('conditions') || '{}').type === 'VIDEO'
          ? state.sends.length
            ? [result]
            : []
          : [source],
      );
    else if (path === '/api/fileTag') body = pagination([]);
    await route.fulfill({ json: catalogResponse(route.request().url(), body) });
  });
  return state;
}

test('agent sends an image, continues the same dialogue and restores messages', async ({ page }) => {
  const state = await setup(page, 'Красная чашка');
  await page.goto('/agent');
  await expect(page.locator('.agent-brand')).toBeVisible();
  await page.getByRole('button', { name: 'Добавить изображение', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Чашка.png Чашка.png 05.11.2026', exact: true })
    .click();
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.locator('.agent-msg.is-assistant')).toHaveCount(1);
  expect(state.sends[0].files).toEqual([12]);
  expect(state.creates[0].options.tools).toEqual([]);
  expect(state.sends[0].settings.tools).toEqual([]);
  expect(state.sends[0].settings.isToolsDisabled).toBe(true);
  await page.locator('#agent-draft').fill('Какого она цвета?');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.locator('.agent-msg.is-assistant')).toHaveCount(2);
  expect(state.creates).toHaveLength(1);
  expect(state.sends).toHaveLength(2);
  await page.reload();
  await expect(page.locator('.agent-msg.is-assistant')).toHaveCount(2);
  await expect(page.locator('.agent-thread')).not.toContainText('[Genfactory:');
  await expect(page.locator('.agent-who').first()).toHaveText('GPT 5.6 Terra');
});
for (const width of [390, 1440])
  test(`agent layout fits ${width}`, async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/agent');
    await expect(page.locator('.agent-brand')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отправить', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Модель', exact: true }).click();
    const box = await page.getByRole('listbox').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `/tmp/agent-new-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

test('agent preserves connected tools and requires advanced mode for old tool-enabled dialogues', async ({
  page,
}) => {
  const state = await setup(page);
  state.conversation = {
    id: 101,
    userId: 7,
    name: 'С инструментами',
    status: 'LOADED',
    model: agent.reference.provider,
    options: { model: agent.reference.model, tools: [{ uid: 'IMAGE' }] },
    tags: ['chat'],
  };
  await page.goto('/agent?conversation=101');
  await expect(page.getByRole('link', { name: 'Расширенный режим', exact: true })).toHaveAttribute(
    'href',
    '/agent?conversation=101&studio=advanced',
  );
  await page.locator('#agent-draft').fill('Обсудим идею');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('подключены инструменты');
  expect(state.sends).toHaveLength(0);
  expect(state.conversation.options.tools).toEqual([{ uid: 'IMAGE' }]);
});

test('agent navigation filters conversations on the server before pagination', async ({ page }) => {
  await setup(page);
  const requested: any[] = [];
  await page.route('**/api/conversation?*', (route) => {
    const url = new URL(route.request().url());
    const conditions = JSON.parse(url.searchParams.get('conditions')!);
    requested.push(conditions);
    if (conditions.tags?.condition !== 'INCLUDES_ALL' || conditions.tags?.value?.[0] !== 'chat')
      return route.fulfill({
        json: pagination([{ id: 90, userId: 7, name: 'Генерация картинки', tags: ['image'] }]),
      });
    const index = Number(url.searchParams.get('pageIndex'));
    return route.fulfill({
      json: {
        ...pagination([
          { id: 101 + index, userId: 7, name: index ? 'Вторая беседа' : 'Первая беседа', tags: ['chat'] },
        ]),
        pages: 2,
        total: 25,
        pageIndex: index,
      },
    });
  });
  await page.goto('/agent');
  const nav = page.getByRole('navigation', { name: 'Основное меню' });
  await expect(nav.getByRole('link', { name: 'Первая беседа' })).toBeVisible();
  await expect(nav.getByText('Генерация картинки')).toHaveCount(0);
  await nav.getByRole('button', { name: 'Ещё диалоги' }).click();
  await expect(nav.getByRole('link', { name: 'Вторая беседа' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Ещё диалоги' })).toHaveCount(0);
  expect(requested.filter((c) => c.tags).every((c) => c.userId === 7)).toBe(true);
});
