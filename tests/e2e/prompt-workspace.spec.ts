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
        url.searchParams.get('provider') === 'OPEN_AI_CONVERSATION'
          ? [agent]
          : catalog.filter((m: any) => m.reference.provider === url.searchParams.get('provider'));
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
      state.messages = [{ id: 2, role: 'ASSISTANT', text: answer, files: [] }, body];
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
    await route.fulfill({ json: body });
  });
  return state;
}

async function prepare(page: Page) {
  await page.goto('/prompt');
  await page.getByRole('button', { name: 'Добавить изображение', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Чашка.png Чашка.png 05.11.2026', exact: true })
    .click();
}
test('prompt analyzes image without tools and restores result before handoff', async ({ page }) => {
  const state = await setup(page);
  await prepare(page);
  await expect(page.locator('.prompt-brand')).toBeVisible();
  await page.getByRole('button', { name: 'Куда пойдёт промпт', exact: true }).click();
  await page.getByRole('option', { name: 'Для Nano Banana', exact: true }).click();
  await page.getByRole('button', { name: 'Собрать промпт', exact: true }).click();
  await expect(page).toHaveURL(/prompt\?conversation=101/);
  await expect(page.locator('.prompt-card h3')).toHaveText('Синяя чашка');
  expect(state.sends).toHaveLength(1);
  expect(state.sends[0].settings.tools).toEqual([]);
  expect(state.sends[0].files).toEqual([12]);
  await page.reload();
  await expect(page.locator('.prompt-card h3')).toHaveText('Синяя чашка');
  await page.locator('.prompt-card').hover();
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).__copied = text;
        },
      },
    }),
  );
  await page.getByRole('button', { name: 'Скопировать промпт', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__copied)).toBe('A blue cup on white');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать TXT', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('prompt.txt');
  await page.getByRole('button', { name: 'Открыть промпт', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Чашка на белом фоне');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.locator('.prompt-card').hover();
  await page.getByRole('button', { name: 'В генератор', exact: true }).click();
  await expect(page).toHaveURL(/image\?studio=banana/);
  await expect(page.locator('#nb-draft')).toHaveValue('A blue cup on white');
  await expect(page.getByRole('button', { name: 'Убрать Чашка.png', exact: true })).toHaveCount(1);
  expect(state.sends).toHaveLength(1);
});
for (const answer of [
  'broken',
  JSON.stringify({
    status: 'needs_clarification',
    title: 'Уточнение',
    prompt: null,
    observations: [],
    clarifications: ['Какой фон?'],
    limitations: [],
  }),
])
  test(`prompt blocks handoff for ${answer.slice(0, 10)}`, async ({ page }) => {
    const state = await setup(page, answer);
    await prepare(page);
    await page.getByRole('button', { name: 'Собрать промпт', exact: true }).click();
    await expect(page.locator('.prompt-card h3')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'В генератор', exact: true })).toHaveCount(0);
    expect(state.sends).toHaveLength(1);
  });
for (const width of [390, 1440])
  test(`prompt empty canvas and controls fit ${width}`, async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/prompt');
    await expect(page.locator('.prompt-brand')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Собрать промпт', exact: true })).toBeDisabled();
    for (const name of ['Задача', 'Куда пойдёт промпт', 'Язык']) {
      await page.getByRole('button', { name, exact: true }).click();
      const box = await page.getByRole('listbox', { name, exact: true }).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/prompt-new-${width}.png` });
  });

test('prompt restores draft inputs and permits return to Auto without sending', async ({ page }) => {
  const state = await setup(page);
  await prepare(page);
  await page.locator('#gp-note').fill('Сохрани чашку');
  await page.getByRole('button', { name: 'Модель', exact: true }).click();
  await page.getByRole('option', { name: 'GPT 5.6 Terra', exact: true }).click();
  await page.getByRole('button', { name: 'Модель', exact: true }).click();
  await page.getByRole('option', { name: 'Авто', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toHaveText('Авто');
  await page.waitForTimeout(300);
  await page.reload();
  await page.getByRole('button', { name: /Восстановить/ }).click();
  await expect(page.locator('#gp-note')).toHaveValue('Сохрани чашку');
  await expect(page.getByRole('button', { name: 'Убрать Чашка.png', exact: true })).toHaveCount(1);
  expect(state.sends).toHaveLength(0);
});
