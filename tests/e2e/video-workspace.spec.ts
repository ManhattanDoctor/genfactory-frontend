import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const catalog = JSON.parse(readFileSync(new URL('../fixtures/catalog.json', import.meta.url), 'utf8')).filter(
  (m: any) => m.reference.provider === 'OPEN_ROUTER_VIDEO',
);
for (const [index, model] of catalog.entries()) {
  Object.assign(model.schema.properties.options.properties, {
    duration: { type: 'integer', enum: [4, 6, 8, 10] },
    aspectRatio: { type: 'string', enum: ['9:16', '16:9', '1:1'] },
    generateAudio: index === 0 ? { type: 'boolean', const: true, default: true } : { type: 'boolean' },
  });
}
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
  name: 'Чашка.mp4',
  path: '/media/prototype/content/video/previews/01.mp4',
  type: 'VIDEO',
  mime: 'video/mp4',
  preview: { image: { status: 'READY', url: '/media/gallery-1.jpg' } },
  origin: {
    kind: 'GENERATION',
    sourceFileIds: [12],
    generation: {
      model: catalog[0].reference,
      prompt: 'Медленный поворот чашки',
      options: { duration: 4, aspectRatio: '1:1', generateAudio: true },
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
      body = url.searchParams.get('provider') === 'OPEN_AI_CONVERSATION' ? [agent] : catalog;
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
      state.messages = [{ id: 2, role: 'ASSISTANT', text: 'Готово', files: [result] }, body];
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

test('video canvas shows designer templates, guest composer and responsive geometry', async ({ page }) => {
  const state = await setup(page, true);
  await page.goto('/video');
  await expect(page.locator('.video-workspace')).toBeVisible();
  await expect(page.locator('.ds-template-card')).toHaveCount(30);
  await page.locator('.ds-template-card').first().click();
  await expect(page.getByRole('button', { name: 'Убрать шаблон', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Редактировать шаблон', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(state.sends).toHaveLength(0);
});

test('video sends template, first frame and real settings through VIDEO and restores redo without attaching the output', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/video');
  await expect(page.getByRole('button', { name: 'Звук', exact: true })).toHaveText('Со звуком');
  await expect(page.getByRole('button', { name: 'Звук', exact: true })).toBeDisabled();
  await page.locator('.ds-template-card').first().click();
  await page.getByRole('button', { name: 'Добавить кадр', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Выбрать референс' })
    .getByText('Чашка.png', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Длительность', exact: true }).click();
  await page.getByRole('option', { name: '4 с', exact: true }).click();
  await page.getByRole('button', { name: 'Структура ролика', exact: true }).click();
  await page.getByRole('option', { name: 'Набор сцен', exact: true }).click();
  await page.locator('#vd-draft').fill('Покажи чашку с разных сторон');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('genfactory.draft.v1.7.video:new:all')))
    .toContain('Покажи чашку');
  await page.reload();
  await expect(page.locator('#vd-draft')).toHaveValue('Покажи чашку с разных сторон');
  await expect(page.getByRole('button', { name: 'Длительность', exact: true })).toHaveText('4 с');
  await expect(page.getByRole('button', { name: 'Структура ролика', exact: true })).toHaveText('Набор сцен');
  await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
  await expect(page.locator('.video-result')).toHaveCount(1);
  expect(state.sends).toHaveLength(1);
  expect(state.uploads).toBe(0);
  expect(state.sends[0].files).toEqual([12]);
  expect(state.sends[0].settings.tools[0]).toMatchObject({
    uid: 'VIDEO',
    settings: { options: { duration: 4, generateAudio: true } },
  });
  expect(state.sends[0].text).toContain('Шаблон:');
  expect(state.sends[0].text).toContain('Несколько последовательных сцен');
  await page.locator('.video-result').hover();
  await expect(page.locator('.video-result .img-actions')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Переделать Чашка.mp4', exact: true }).click();
  await expect(page.locator('#vd-draft')).toHaveValue(/Покажи чашку с разных сторон[\s\S]*Ролик не подошёл/);
  await expect(page.getByRole('button', { name: 'Убрать Чашка.png', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Убрать Чашка.mp4', exact: true })).toHaveCount(0);
  expect(state.sends).toHaveLength(1);
  await page.locator('.video-result-open, .video-result .image-result-open').click();
  await expect(page.getByRole('dialog', { name: 'Чашка.mp4' }).locator('video')).toHaveAttribute(
    'controls',
    '',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const width of [390, 1440])
  test(`video composer and menus stay within viewport ${width}`, async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/video');
    await page.getByRole('button', { name: 'Модель', exact: true }).click();
    const menu = await page.getByRole('listbox', { name: 'Модель', exact: true }).boundingBox();
    expect(menu!.x).toBeGreaterThanOrEqual(0);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    for (const name of ['Стороны', 'Длительность', 'Структура ролика']) {
      await page.getByRole('button', { name, exact: true }).click();
      const list = page.getByRole('listbox', { name, exact: true });
      const box = await list.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await expect(list.locator('.image-menu-note')).toBeVisible();
      await list.getByRole('option').first().click();
      await expect(page.getByRole('button', { name, exact: true })).toBeFocused();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

test('all 30 video templates apply without sending and model information closes cleanly', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/video');
  const cards = page.locator('.ds-template-card');
  await expect(cards).toHaveCount(30);
  for (let index = 0; index < 30; index++) {
    await cards.nth(index).click();
    await expect(page.locator('.img-files .img-file')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Собрать видео', exact: true })).toBeEnabled();
  }
  expect(state.sends).toHaveLength(0);
  await page.getByRole('button', { name: 'Модель', exact: true }).click();
  await page
    .getByRole('button', { name: /^О модели / })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('video shows actual running, clarification and failure states without retrying generation', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/video');
  await page.locator('#vd-draft').fill('Чашка');
  await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
  await expect(page.locator('.video-result')).toHaveCount(1);
  state.messages = [{ id: 3, role: 'ASSISTANT', text: 'Как должна двигаться камера?', files: [] }];
  state.conversation.status = 'LOADING';
  await page.reload();
  await expect(page.locator('.image-result-pending')).toContainText('Создаём видео');
  await expect(page.getByRole('button', { name: 'Собрать видео', exact: true })).toBeDisabled();
  await page.locator('.video-result').hover();
  await expect(page.getByRole('button', { name: 'Переделать Чашка.mp4', exact: true })).toBeDisabled();
  await expect(page.locator('.image-conversation-note')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/video-running-app.png' });
  state.conversation.status = 'LOADED';
  await page.reload();
  await expect(page.locator('.image-conversation-note')).toContainText('Как должна двигаться камера?');
  await expect(page.locator('.image-result-pending')).toHaveCount(0);
  await page.locator('#vd-draft').fill('Плавное приближение');
  await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(2);
  await expect(page.locator('.image-conversation-note')).toHaveCount(0);
  state.conversation.status = 'ERROR';
  await page.reload();
  await expect(page.locator('.video-result-failed')).toContainText('Ролик не собрался.');
  await expect(page.locator('.image-result-pending')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/video-error-app.png' });
  expect(state.sends).toHaveLength(2);
});

test('video download failure allows manual download retry and viewer failure does not generate again', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/video');
  await page.locator('#vd-draft').fill('Чашка');
  await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
  await expect(page.locator('.video-result')).toHaveCount(1);
  await page.route('**/api/file/13/content', (route) =>
    route.fulfill({ status: 503, json: { message: 'Unavailable' } }),
  );
  const download = page.getByRole('button', { name: 'Скачать Чашка.mp4', exact: true });
  await page.locator('.video-result').hover();
  await download.click();
  await expect(page.getByText('Не удалось скачать файл. Попробуйте ещё раз.', { exact: true })).toBeVisible();
  await expect(download).toBeEnabled();
  await page.route('**/api/file/13/content', (route) =>
    route.fulfill({
      contentType: 'video/mp4',
      body: readFileSync(new URL('../fixtures/preview.mp4', import.meta.url)),
    }),
  );
  const saved = page.waitForEvent('download');
  await download.click();
  expect((await saved).suggestedFilename()).toBe('Чашка.mp4');
  await expect(page.getByText('Не удалось скачать файл. Попробуйте ещё раз.', { exact: true })).toHaveCount(
    0,
  );
  await page.route('**/media/prototype/content/video/previews/01.mp4', (route) => route.abort());
  const open = page.locator('.video-result .image-result-open');
  await open.click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Видео не открылось.');
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
  expect(state.sends).toHaveLength(1);
});

test('broken short video preview falls back to the poster without loading the original', async ({ page }) => {
  const state = await setup(page);
  let originals = 0;
  await page.route('**/broken-preview.mp4', (route) => route.abort());
  await page.route('**/original-video.mp4', (route) => {
    originals++;
    return route.abort();
  });
  await page.route('**/api/file?**', (route) =>
    route.fulfill({
      json: pagination([
        {
          ...result,
          path: '/original-video.mp4',
          preview: { ...result.preview, video: { status: 'READY', url: '/broken-preview.mp4' } },
        },
      ]),
    }),
  );
  await page.goto('/video');
  await expect(page.locator('.video-result .image-result-open img')).toHaveAttribute(
    'src',
    /\/media\/gallery-1\.jpg$/,
  );
  expect(originals).toBe(0);
  expect(state.sends).toHaveLength(0);
});
