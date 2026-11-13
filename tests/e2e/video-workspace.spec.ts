import { mediaTaskResponse } from './mediaTaskMock';
import { catalogProvider, catalogPage, catalogResponse } from './modelCatalog';
import { modelTitle } from '../../src/features/catalog/presentation';
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const catalog = JSON.parse(readFileSync(new URL('../fixtures/catalog.json', import.meta.url), 'utf8')).filter(
  (m: any) => m.reference.provider === 'OPEN_ROUTER_VIDEO',
);
for (const [index, model] of catalog.entries()) {
  Object.assign(model.schema.properties.options.properties, {
    duration: {
      type: 'integer',
      enum:
        model.reference.model === 'alibaba/wan-3.0'
          ? Array.from({ length: 29 }, (_, i) => i + 2)
          : [4, 6, 8, 10],
    },
    aspectRatio: { type: 'string', enum: ['9:16', '16:9', '1:1'] },
    generateAudio: ['x-ai/grok-imagine-video-1.5-lite', 'alibaba/wan-3.0'].includes(model.reference.model)
      ? { type: 'boolean', const: true, default: true }
      : { type: 'boolean' },
    resolution: { type: 'string', enum: index === 2 ? ['480p', '720p'] : ['480p', '720p', '1080p'] },
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
      options: { duration: 4, aspectRatio: '1:1', resolution: '720p', generateAudio: true },
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
      body = catalogProvider(url) === 'OPEN_ROUTER_CONVERSATION' ? [agent] : catalog;
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

async function pickSource(page: Page, name = 'Чашка.png'): Promise<void> {
  const picker = page.getByRole('dialog', { name: 'Библиотека' });
  await picker.getByRole('button', { name: new RegExp(name) }).click();
  const confirm = picker.getByRole('button', { name: /^Добавить \(\d+\)$/ });
  if (await confirm.isVisible()) await confirm.click();
}
async function applyVideoTemplate(page: Page, index: number): Promise<void> {
  await page.locator('.ds-template-card').nth(index).click();
  const dialog = page.getByRole('dialog');
  for (const field of await dialog.locator('[data-template-variable]').all()) await field.fill('Синяя чашка');
  await dialog.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
  const adapt = dialog.getByRole('button', { name: /Адаптировать под/ });
  if (await adapt.isVisible()) {
    await adapt.click();
    await dialog.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
  }
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Добавить кадр', exact: true }).click();
  await pickSource(page);
}

test('Wan keeps audio enabled when restoring a saved draft that requested silence', async ({ page }) => {
  const state = await setup(page);
  const wan = catalog.find((model: any) => model.reference.model === 'alibaba/wan-3.0');
  expect(wan).toBeDefined();
  await page.goto('/video');
  await page.getByRole('button', { name: 'Модель', exact: true }).click();
  await page.getByRole('option', { name: modelTitle(wan), exact: true }).click();
  await expect(page.getByRole('button', { name: 'Звук', exact: true })).toHaveText('Со звуком');
  await expect(page.getByRole('button', { name: 'Звук', exact: true })).toBeDisabled();
  await page.locator('#vd-draft').fill('Чашка медленно поворачивается');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('genfactory.draft.v1.7.video:new:all')))
    .toContain('Чашка');
  await page.evaluate(() => {
    const key = 'genfactory.draft.v1.7.video:new:all';
    const draft = JSON.parse(localStorage.getItem(key)!);
    draft.value.options.generateAudio = false;
    localStorage.setItem(key, JSON.stringify(draft));
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Звук', exact: true })).toHaveText('Со звуком');
  await expect(page.getByRole('button', { name: 'Звук', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  expect(state.tasks[0].options.generateAudio).toBe(true);
});

test('video canvas shows designer templates, guest composer and responsive geometry', async ({ page }) => {
  const state = await setup(page, true);
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: { keycloak: { url: 'https://sso.example.test', realm: 'gnosis', clientId: 'gnosis' } },
    }),
  );
  await page.route('https://sso.example.test/**', (route) => route.fulfill({ body: 'Mock sign-in' }));
  await page.goto('/video');
  await expect(page.locator('.video-workspace')).toBeVisible();
  await expect(page.locator('.ds-template-card')).toHaveCount(30);
  await page.locator('.ds-template-card').first().click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Использовать шаблон', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#vd-draft').fill('Создай видео');
  await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
  await expect(page).toHaveURL(/sso\.example\.test.*openid-connect\/auth/);
  expect(state.creates).toHaveLength(0);
  expect(state.tasks).toHaveLength(0);
});

test('video sends template, first frame and real settings through VIDEO and restores redo without attaching the output', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/video');
  await expect(page.getByRole('button', { name: 'Звук', exact: true })).toHaveText('Со звуком');
  await expect(page.getByRole('button', { name: 'Звук', exact: true })).toBeDisabled();
  await applyVideoTemplate(page, 0);
  const templateText = await page.locator('#vd-draft').inputValue();
  await expect(page.getByRole('button', { name: 'Стороны', exact: true })).toHaveText('По исходному кадру');
  await expect(page.getByRole('button', { name: 'Стороны', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Разрешение', exact: true }).click();
  await page.getByRole('option', { name: '720p', exact: true }).click();
  await page.getByRole('button', { name: 'Длительность', exact: true }).click();
  await page.getByRole('option', { name: '4 с', exact: true }).click();
  await page.getByRole('button', { name: 'Структура ролика', exact: true }).click();
  await page.getByRole('option', { name: 'Набор сцен', exact: true }).click();
  await page.locator('#vd-draft').fill(templateText + '\nПокажи чашку с разных сторон');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('genfactory.draft.v1.7.video:new:all')))
    .toContain('Покажи чашку');
  await page.reload();
  await expect(page.locator('#vd-draft')).toHaveValue(templateText + '\nПокажи чашку с разных сторон');
  await expect(page.getByRole('button', { name: 'Длительность', exact: true })).toHaveText('4 с');
  await expect(page.getByRole('button', { name: 'Разрешение', exact: true })).toHaveText('720p');
  await expect(page.getByRole('button', { name: 'Структура ролика', exact: true })).toHaveText('Набор сцен');
  await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
  await expect(page.locator('.video-result')).toHaveCount(1);
  expect(state.tasks).toHaveLength(1);
  expect(state.uploads).toBe(0);
  expect(state.tasks[0].task.fileIds).toEqual([12]);
  expect(state.tasks[0]).toMatchObject({
    isSaveResult: true,
    model: 'OPEN_ROUTER_VIDEO',
    options: { duration: 4, resolution: '720p', generateAudio: true },
  });
  expect(state.creates).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
  expect(state.tasks[0].options).not.toHaveProperty('aspectRatio');
  expect(state.tasks[0].task.prompt).toContain(templateText);
  expect(state.tasks[0].task.prompt).toContain('несколько сцен');
  await page.locator('.video-result').hover();
  await expect(page.locator('.video-result .img-actions')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Переделать Чашка.mp4', exact: true }).click();
  await expect(page.locator('#vd-draft')).toHaveValue(/Покажи чашку с разных сторон[\s\S]*Ролик не подошёл/);
  await expect(page.getByRole('button', { name: 'Убрать Чашка.png', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Убрать Чашка.mp4', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Разрешение', exact: true })).toHaveText('720p');
  expect(state.tasks).toHaveLength(1);
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
    for (const name of ['Стороны', 'Разрешение', 'Длительность', 'Структура ролика']) {
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

test('all 30 video templates open the shared editor without sending and model information closes cleanly', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/video');
  const cards = page.locator('.ds-template-card');
  await expect(cards).toHaveCount(30);
  for (let index = 0; index < 30; index++) {
    await cards.nth(index).click();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Использовать шаблон', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
  }
  expect(state.tasks).toHaveLength(0);
  await page.getByRole('button', { name: 'Модель', exact: true }).click();
  await page
    .getByRole('button', { name: /^О модели / })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('existing video conversations show running, clarification and failure states without retrying', async ({
  page,
}) => {
  const state = await setup(page);
  state.conversation = {
    id: 101,
    userId: 7,
    status: 'LOADED',
    model: agent.reference.provider,
    options: {
      model: agent.reference.model,
      tools: [{ uid: 'VIDEO', settings: { model: catalog[0].reference } }],
    },
  };
  state.messages = [{ id: 2, role: 'ASSISTANT', text: 'Готово', files: [result] }];
  await page.goto('/video?conversation=101');
  await expect(page.locator('.video-result')).toHaveCount(1);
  state.messages = [{ id: 3, role: 'ASSISTANT', text: 'Как должна двигаться камера?', files: [] }];
  state.conversation.status = 'LOADING';
  await page.reload();
  await expect(page.locator('.image-result-pending')).toHaveCount(0);
  await page.locator('#vd-draft').fill('Новый видеозапрос');
  await expect(page.getByRole('button', { name: 'Собрать видео', exact: true })).toBeEnabled();
  await expect(page.locator('.media-answer-card')).toContainText('Как должна двигаться камера?');
  state.conversation.status = 'LOADED';
  await page.reload();
  await expect(page.locator('.media-answer-card')).toContainText('Как должна двигаться камера?');
  await expect(page.locator('.image-result-pending')).toHaveCount(0);
  state.conversation.status = 'ERROR';
  state.messages = [];
  await page.reload();
  await expect(page.locator('.video-result-failed')).toContainText('Ролик не собрался.');
  await expect(page.locator('.image-result-pending')).toHaveCount(0);
  expect(state.tasks).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
  expect(state.creates).toHaveLength(0);
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
  // The loaded thumbnail determines the card height and overlay button positions.
  await expect(page.locator('.video-result .image-result-open img')).toHaveJSProperty('complete', true);
  await expect(page.locator('.video-result .image-result-open img')).not.toHaveJSProperty('naturalWidth', 0);
  await page.locator('.video-result .image-result-open').focus();
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
  await open.focus();
  await open.press('Enter');
  await expect(page.getByRole('dialog').locator('.file-placeholder')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('status', { name: 'Загрузка файла' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
  expect(state.tasks).toHaveLength(1);
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
  expect(state.tasks).toHaveLength(0);
});

test('Wan uses both catalog-supported frames in order and restores them for a revision', async ({ page }) => {
  const state = await setup(page);
  const wan = catalog.find((model: any) => model.reference.model === 'alibaba/wan-3.0');
  const endFrame = { ...source, id: 14, uid: 'end-frame', name: 'Конечный кадр.png' };
  const video = {
    ...result,
    origin: {
      ...result.origin,
      sourceFileIds: [12, 14],
      generation: { ...result.origin.generation, model: wan.reference },
    },
  };
  await page.route('**/api/file?*', (route) =>
    route.fulfill({
      json: pagination(state.completed ? [state.completed, source, endFrame] : [source, endFrame]),
    }),
  );
  await page.route('**/api/file/14', (route) => route.fulfill({ json: endFrame }));
  await page.route('**/api/file/13', (route) => route.fulfill({ json: video }));
  await page.route('**/api/task', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const input = route.request().postDataJSON();
    state.tasks.push(input);
    const body = mediaTaskResponse(video, input);
    state.completed = body.files[0];
    return route.fulfill({ json: body });
  });
  await page.goto('/video');
  await page.getByRole('button', { name: 'Модель', exact: true }).click();
  await page.getByRole('option', { name: /Wan/i }).click();
  for (const name of ['Чашка.png', 'Конечный кадр.png']) {
    await page.getByRole('button', { name: 'Добавить кадр', exact: true }).click();
    await pickSource(page, name);
    await expect(page.getByRole('button', { name: `Убрать ${name}`, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Добавить кадр', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Библиотека' })).toHaveCount(0);
  await expect(
    page.getByText('Для выбранной модели можно добавить до 2 референсов.', { exact: true }),
  ).toBeVisible();
  await page.locator('#vd-draft').fill('Плавный переход от стартового кадра к конечному');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('genfactory.draft.v1.7.video:new:all')))
    .toContain('Конечный кадр.png');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Убрать Конечный кадр.png', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Стороны', exact: true })).toHaveText('По исходному кадру');
  await expect(page.getByRole('button', { name: 'Стороны', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
  await expect(page.locator('.video-result')).toHaveCount(1);
  expect(state.tasks).toHaveLength(1);
  expect(state.tasks[0].task.fileIds).toEqual([12, 14]);
  expect(state.tasks[0].options).not.toHaveProperty('aspectRatio');
  expect(state.tasks[0]).toMatchObject({
    isSaveResult: true,
    model: wan.reference.provider,
    options: { model: wan.reference.model },
  });
  await page.locator('.video-result .image-result-open').focus();
  await page.locator('.video-result').hover();
  await page.getByRole('button', { name: 'Переделать Чашка.mp4', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Убрать Чашка.png', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Убрать Конечный кадр.png', exact: true })).toBeVisible();
  expect(state.tasks).toHaveLength(1);
});

test('a video model limited to one frame still blocks the second attachment', async ({ page }) => {
  const state = await setup(page);
  const single = structuredClone(catalog[0]);
  single.schema.properties.options.properties.frameImages.maxItems = 1;
  await page.route('**/api/aimodels?*', (route) =>
    catalogProvider(route.request().url()) === 'OPEN_ROUTER_VIDEO'
      ? route.fulfill({ json: catalogPage([single]) })
      : route.fallback(),
  );
  await page.goto('/video');
  await page.getByRole('button', { name: 'Добавить кадр', exact: true }).click();
  await pickSource(page);
  await page.getByRole('button', { name: 'Добавить кадр', exact: true }).click();
  await expect(
    page.getByText('Для выбранной модели можно добавить до 1 референсов.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Библиотека' })).toHaveCount(0);
  expect(state.tasks).toHaveLength(0);
});

test('applying an updated video template selects Wan and sends its new prompt', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/video');
  await page.getByRole('button', { name: 'Послание в объектив', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#vd-draft')).toHaveValue(/Герой - тот, кто на загруженном фото/);
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toContainText('Wan');
  await expect(page.getByRole('button', { name: 'Длительность', exact: true })).toHaveText('18 с');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toContainText('Wan');
  await expect(page.getByRole('button', { name: 'Длительность', exact: true })).toHaveText('18 с');
  await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  expect(state.tasks[0].options.model).toBe('alibaba/wan-3.0');
  expect(state.tasks[0].options.duration).toBe(18);
  expect(state.tasks[0].task.prompt).toContain('The subject from the uploaded photo');
});

test('a template without duration preserves the selected seconds when switching to Wan', async ({ page }) => {
  await setup(page);
  await page.goto('/video');
  await page.getByRole('button', { name: 'Длительность', exact: true }).click();
  await page.getByRole('option', { name: '6 с', exact: true }).click();
  await page.getByRole('button', { name: 'Оживающая вышивка на кепке', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toContainText('Wan');
  await expect(page.getByRole('button', { name: 'Длительность', exact: true })).toHaveText('6 с');
});

test('generated video keeps its poster during slow hover playback and releases the player on leave', async ({
  page,
}, testInfo) => {
  await setup(page);
  const preview = {
    ...result,
    preview: {
      image: { status: 'READY', url: '/media/templates/2026-11-13/video/17.jpg', width: 480, height: 270 },
      video: { status: 'READY', url: '/hover-preview.mp4' },
    },
  };
  await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([preview]) }));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/hover-preview.mp4', async (route) => {
    await gate;
    await route.fulfill({
      contentType: 'video/mp4',
      body: readFileSync(
        new URL('../../public/media/templates/2026-11-13/video/previews/17.mp4', import.meta.url),
      ),
    });
  });
  await page.goto('/video');
  const card = page.locator('.video-result').first();
  const poster = card.locator('.media-video-poster');
  await expect(poster).toBeVisible();
  await expect(card.locator('video')).toHaveCount(0);
  const before = await card.boundingBox();
  await card.locator('.media-video-preview').hover();
  await expect(card.locator('video')).toHaveCount(1);
  await expect(poster).toBeVisible();
  await card.screenshot({ path: testInfo.outputPath('hover-waiting.png') });
  release();
  await expect
    .poll(() =>
      card
        .locator('video')
        .evaluate((v) => !(v as HTMLVideoElement).paused && (v as HTMLVideoElement).readyState >= 2),
    )
    .toBe(true);
  await expect(poster).toBeHidden();
  expect(Math.abs((await card.boundingBox())!.height - before!.height)).toBeLessThan(1);
  await card.locator('video').evaluate((v) => v.dispatchEvent(new Event('waiting')));
  await expect(poster).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(card.locator('video')).toHaveCount(0);
  await expect(poster).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(poster).toBeVisible();
  await expect(card.locator('video')).toHaveCount(0);
});
