import { mediaTaskResponse } from './mediaTaskMock';
import { catalogProvider, catalogPage, catalogResponse } from './modelCatalog';
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { IModelDescription } from '../../src/lib/types';
const catalog: IModelDescription[] = JSON.parse(
  readFileSync(new URL('../fixtures/catalog.json', import.meta.url), 'utf8'),
);
const agent = JSON.parse(readFileSync(new URL('../fixtures/agent.json', import.meta.url), 'utf8'));
const file = {
  id: 12,
  uid: 'image-result',
  userId: 7,
  name: 'Закат.png',
  path: '/media/gallery-1.jpg',
  type: 'IMAGE',
  mime: 'image/png',
  createdDate: '2026-11-04T12:00:00Z',
  origin: {
    kind: 'GENERATION',
    generation: {
      model: catalog[0].reference,
      prompt: 'Закат над лесом',
      options: { size: '1536x1024', quality: 'high' },
    },
    sourceFileIds: [],
  },
};
const pagination = (items: unknown[]) => ({
  items,
  total: items.length,
  pages: 1,
  pageSize: 20,
  pageIndex: 0,
});
async function setup(page: Page, guest = false) {
  if (!guest) await page.addInitScript(() => localStorage.setItem('genfactory.session', 'image-test'));
  await page.routeWebSocket('**/socket.io/**', () => {});
  const state = {
    creates: [] as any[],
    sends: [] as any[],
    tasks: [] as any[],
    completed: undefined as any,
    messages: [] as any[],
    conversation: undefined as any,
    uploads: 0,
  };
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/api/task' && route.request().method() === 'GET')
      return route.fulfill({ json: [] });
    const request = route.request(),
      url = new URL(request.url()),
      p = url.pathname;
    let body: unknown = {};
    if (p === '/api/init') body = { user: { id: 7 }, balances: { RUB: '10000' } };
    else if (p === '/api/aimodels')
      body =
        catalogProvider(url) === 'OPEN_ROUTER_CONVERSATION'
          ? [agent]
          : catalog.filter((m) => m.reference.provider === catalogProvider(url));
    else if (p === '/api/task' && request.method() === 'POST') {
      const input = request.postDataJSON();
      state.tasks.push(input);
      const response = mediaTaskResponse(file, input);
      state.completed = response.files[0];
      body = response;
    } else if (p === '/api/conversation' && request.method() === 'POST') {
      state.creates.push(request.postDataJSON());
      state.conversation = {
        id: 101,
        userId: 7,
        status: 'LOADED',
        createdDate: file.createdDate,
        ...request.postDataJSON(),
      };
      body = state.conversation;
    } else if (p === '/api/conversation') body = pagination(state.conversation ? [state.conversation] : []);
    else if (p === '/api/conversation/101/message' && request.method() === 'POST') {
      state.sends.push(request.postDataJSON());
      const nextMessageId = Math.max(0, ...state.messages.map((message) => message.id)) + 1;
      body = {
        ...request.postDataJSON(),
        id: nextMessageId,
        files: [],
        createdDate: file.createdDate,
      };
      state.messages = [
        {
          id: nextMessageId + 1,
          role: 'ASSISTANT',
          text: 'Готово',
          files: [file],
          createdDate: file.createdDate,
        },
        body,
      ];
    } else if (p === '/api/conversation/101/message') body = pagination(state.messages);
    else if (p === '/api/conversation/101') body = state.conversation;
    else if (p === '/api/file/12') body = state.completed || file;
    else if (p === '/api/file' && request.method() === 'POST') {
      state.uploads++;
      body = file;
    } else if (p === '/api/file')
      body = pagination(
        JSON.parse(url.searchParams.get('conditions') || '{}').type === 'IMAGE'
          ? state.tasks.length || state.sends.length
            ? [state.completed || file]
            : []
          : [file],
      );
    else if (p === '/api/fileTag') body = pagination([]);
    await route.fulfill({ json: catalogResponse(route.request().url(), body) });
  });
  return state;
}
test('image canvas matches designer geometry and guest starts direct login from the composer', async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: { keycloak: { url: 'https://sso.example.test', realm: 'gnosis', clientId: 'gnosis' } },
    }),
  );
  await page.route('https://sso.example.test/**', (route) => route.fulfill({ body: 'Mock sign-in' }));
  await page.goto('/image');
  await expect(page.locator('.ds-template-card')).toHaveCount(130);
  expect(await page.locator('.img-dock').boundingBox()).toEqual({ x: 484, y: 782, width: 720, height: 146 });
  await expect(page.getByRole('button', { name: 'Собрать изображение', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Идея', exact: true }).fill('Закат над лесом');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect(page).toHaveURL(/sso\.example\.test.*openid-connect\/auth/);
  expect(state.creates).toHaveLength(0);
  expect(state.tasks).toHaveLength(0);
});
test('image model controls send actual settings, show result and recover it on reload', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/image');
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toContainText('GPT Image 2');
  await page.getByRole('button', { name: 'Стороны', exact: true }).click();
  await page.getByRole('option', { name: '3:2', exact: true }).click();
  await page.getByRole('button', { name: 'Качество', exact: true }).click();
  await page.getByRole('option', { name: 'high', exact: true }).click();
  await page.locator('#img-draft').fill('Закат над лесом');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect(page.locator('.image-result')).toHaveCount(1);
  expect(state.creates).toHaveLength(0);
  expect(state.tasks).toHaveLength(1);
  expect(state.tasks[0].options).toMatchObject({
    size: '1536x1024',
    quality: 'high',
  });
  expect(state.tasks[0].task.fileIds).toEqual([]);
  await page.reload();
  await expect(page.locator('.image-result')).toHaveCount(1);
  const restoredResult = page.locator('.image-result');
  await expect
    .poll(() =>
      restoredResult.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await restoredResult.hover();
  await expect(restoredResult.locator('.img-actions')).toHaveCSS('transform', 'none');
  await expect(restoredResult.locator('.img-actions')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Переделать Закат.png', exact: true }).click();
  await expect(page.locator('#img-draft')).toHaveValue(/Закат над лесом[\s\S]*Последний референс/);
  expect(state.tasks).toHaveLength(1);
  await expect(page.locator('.img-files .img-file')).toHaveCount(1);
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(2);
  expect(state.tasks[1].task.fileIds).toEqual([12]);
});
test('image library reuses a saved file without reupload or sending on selection', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/image');
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toContainText('GPT Image 2');
  await page.getByRole('button', { name: 'Добавить изображение', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Библиотека' })).toBeVisible();
  await page
    .getByRole('button', { name: /Закат.png/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: 'Убрать Закат.png', exact: true })).toBeVisible();
  expect(state.tasks).toHaveLength(0);
  expect(state.uploads).toBe(0);
  await page.locator('#img-draft').fill('Сделай свет теплее');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  expect(state.tasks[0].task.fileIds).toEqual([12]);
});
test('image draft and selected options survive reload without executing a request', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/image');
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toContainText('GPT Image 2');
  await page.getByRole('button', { name: 'Качество', exact: true }).click();
  await page.getByRole('option', { name: 'high', exact: true }).click();
  await page.locator('#img-draft').fill('Неотправленный черновик');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('genfactory.draft.v1.7.image:new:all')))
    .toContain('Неотправленный черновик');
  await page.reload();
  await expect(page.locator('#img-draft')).toHaveValue('Неотправленный черновик');
  await expect(page.getByRole('button', { name: 'Качество', exact: true })).toHaveText('high');
  expect(state.tasks).toHaveLength(0);
});
test('image model favorites change ordering without changing actual model selection', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/image');
  await page.getByRole('button', { name: 'Модель', exact: true }).click();
  const chosen = page.getByRole('option', { name: 'GPT Image 1 Mini', exact: true });
  await page.getByRole('button', { name: 'В избранные: GPT Image 1 Mini', exact: true }).click();
  await expect(page.getByRole('option').first()).toHaveAccessibleName('GPT Image 1 Mini');
  await expect(
    page.getByRole('button', { name: 'Убрать из избранных: GPT Image 1 Mini', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await chosen.click();
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toContainText('GPT Image 1 Mini');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toContainText('GPT Image 1 Mini');
  await page.locator('#img-draft').fill('Чашка');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  expect(state.tasks[0].options.model).toBe('gpt-image-1-mini');
  expect(state.creates).toHaveLength(0);
});

for (const width of [390, 768, 1440, 1920])
  test(`image canvas and menus fit viewport ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await setup(page);
    await page.goto('/image');
    await expect(page.locator('.ds-template-card')).toHaveCount(130);
    const box = await page.locator('.img-dock').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: 'Модель', exact: true }).click();
    const menu = await page.getByRole('listbox', { name: 'Модель', exact: true }).boundingBox();
    expect(menu!.x).toBeGreaterThanOrEqual(0);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
test.describe('complete image template catalog', () => {
  test.describe.configure({ mode: 'parallel' });
  const items: { id: string; kind: string; title: string }[] = JSON.parse(
    readFileSync(new URL('../../src/features/content-studio/templates.json', import.meta.url), 'utf8'),
  );
  const images = items.filter((item) => item.kind === 'image');
  for (let offset = 0; offset < images.length; offset += 20) {
    test(`all image cards apply complete editable prompts without generation or uploading: ${offset + 1}-${Math.min(offset + 20, images.length)}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const state = await setup(page);
      await page.goto('/image');
      await expect(page.getByRole('button', { name: 'Модель', exact: true })).toContainText('GPT Image 2');
      for (const item of images.slice(offset, offset + 20)) {
        await page.getByRole('button', { name: item.title, exact: true }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.getByRole('button', { name: 'Редактировать шаблон', exact: true }).click();
        const input = page.getByRole('textbox', { name: 'Текст шаблона', exact: true });
        const prepared = (await input.inputValue()).replace(
          /\[([A-Za-z][A-Za-z_0-9 ]*)\]/g,
          'Тестовые данные',
        );
        await input.fill(prepared);
        await expect(input).toHaveValue(prepared);
        await page.getByRole('button', { name: 'Готово', exact: true }).click();
        await expect(page.locator('#img-draft')).toHaveValue('');
        expect(prepared).not.toMatch(/\[[A-Za-z][A-Za-z_0-9 ]*\]/);
      }
      await page.getByRole('button', { name: 'Убрать шаблон', exact: true }).click();
      await expect(page.locator('.ds-template-card[aria-pressed=true]')).toHaveCount(0);
      expect(state.tasks).toHaveLength(0);
      expect(state.creates).toHaveLength(0);
      expect(state.uploads).toBe(0);
    });
  }
});

test('canceling a template preserves the prompt and removing an applied template clears selection', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/image');
  await page.locator('#img-draft').fill('Моя задача');
  await page.locator('.ds-template-card').first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Убрать шаблон', exact: true }).click();
  await expect(page.locator('#img-draft')).toHaveValue('Моя задача');
  await expect(page.locator('.ds-template-card[aria-pressed=true]')).toHaveCount(0);
});
test('image wall paginates across folders and excludes uploads and foreign files', async ({ page }) => {
  await setup(page);
  const pages: number[] = [];
  await page.route('**/api/file?**', async (route) => {
    const url = new URL(route.request().url());
    const conditions = JSON.parse(url.searchParams.get('conditions') || '{}');
    expect(conditions).toEqual({ type: 'IMAGE' });
    const pageIndex = Number(url.searchParams.get('pageIndex'));
    pages.push(pageIndex);
    await route.fulfill({
      json: {
        items:
          pageIndex === 0
            ? [
                { ...file, id: 20, origin: { kind: 'UPLOAD' } },
                { ...file, id: 21, userId: 99 },
              ]
            : [{ ...file, directory: 'saved/folder' }],
        total: 3,
        pages: 2,
        pageIndex,
        pageSize: 2,
      },
    });
  });
  await page.goto('/image');
  await expect(page.locator('.image-result')).toHaveCount(1);
  await expect(page.locator('.image-result img')).toHaveAttribute('alt', 'Закат.png');
  expect(pages).toContain(0);
  expect(pages).toContain(1);
});

test('template placeholders survive reload and are sent separately from the idea without a reference gate', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/image');
  await page.locator('#img-draft').fill('Красная чашка, мягкий вечерний свет');
  await page.locator('.ds-template-card').first().click();
  await page.getByRole('button', { name: 'Редактировать шаблон', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Текст шаблона', exact: true });
  const template = await input.inputValue();
  expect(template).toContain('[PRODUCT]');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('genfactory.draft.v1.7.image:new:all')))
    .toContain('[PRODUCT]');
  await page.reload();
  await expect(page.locator('.ds-template-card[aria-pressed=true]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  expect(state.tasks[0].task.prompt).toContain('Основной запрос:\nКрасная чашка, мягкий вечерний свет');
  expect(state.tasks[0].task.prompt).toContain('Шаблон:\n' + template);
  expect(state.tasks[0].task.prompt).not.toMatch(/вызови IMAGE|Genfactory:/);
  expect(state.tasks[0].task.fileIds).toEqual([]);
});

test('image blocks a nonpositive balance without creating or submitting a conversation', async ({ page }) => {
  const state = await setup(page);
  await page.route('**/api/init', (route) =>
    route.fulfill({ json: { user: { id: 7 }, balances: { RUB: '-3647.754500' } } }),
  );
  await page.goto('/image');
  await page.locator('#img-draft').fill('Моё задание');
  await expect(page.getByRole('alert')).toContainText('Недостаточно средств на балансе');
  await expect(page.getByRole('button', { name: 'Собрать изображение', exact: true })).toBeDisabled();
  expect(state.creates).toHaveLength(0);
  expect(state.tasks).toHaveLength(0);
  await expect(page.locator('#img-draft')).toHaveValue('Моё задание');
});

test('image lets the user explicitly continue a failed conversation without an automatic retry', async ({
  page,
}) => {
  const state = await setup(page);
  state.conversation = {
    id: 101,
    userId: 7,
    status: 'ERROR',
    model: agent.reference.provider,
    options: {
      model: agent.reference.model,
      tools: [{ uid: 'IMAGE', settings: { model: catalog[0].reference } }],
    },
  };
  await page.goto('/image?conversation=101');
  await page.locator('#img-draft').fill('Сохранить моё задание');
  await expect(page.getByRole('alert')).toContainText('Предыдущий запрос завершился с ошибкой');
  await expect(page.getByRole('button', { name: 'Собрать изображение', exact: true })).toBeEnabled();
  expect(state.tasks).toHaveLength(0);
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  expect(state.creates).toHaveLength(0);
  expect(state.tasks[0].task.prompt).toContain('Сохранить моё задание');
});

test('image translates an insufficient funds response and keeps the draft without retry', async ({
  page,
}) => {
  const state = await setup(page);
  let sends = 0;
  await page.route('**/api/task', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    sends++;
    await route.fulfill({
      status: 402,
      json: { code: 'INSUFFICIENT_FUNDS', message: 'InsufficientFundsError' },
    });
  });
  await page.goto('/image');
  await page.locator('#img-draft').fill('Сохранить мой промпт');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Недостаточно средств на балансе');
  await expect(page.getByRole('alert')).not.toContainText('InsufficientFundsError');
  await expect(page.locator('#img-draft')).toHaveValue('Сохранить мой промпт');
  expect(sends).toBe(1);
  expect(state.creates).toHaveLength(0);
});

test('image keeps a library reference when the user changes model before sending', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/image');
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toContainText('GPT Image 2');
  await page.getByRole('button', { name: 'Добавить изображение', exact: true }).click();
  await page
    .getByRole('button', { name: /Закат.png/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: 'Убрать Закат.png', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Модель', exact: true }).click();
  await page.getByRole('option', { name: 'Qwen Image 2.1 Turbo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Убрать Закат.png', exact: true })).toBeVisible();
  await page.locator('#img-draft').fill('Пусть пьют вино, сохрани людей с исходного изображения');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  expect(state.tasks[0].task.fileIds).toEqual([12]);
  expect(state.tasks[0].options.model).toBe('qwen/qwen-image-2.1-turbo');
  expect(state.tasks[0].task.prompt).toBe('Пусть пьют вино, сохрани людей с исходного изображения');
  expect(state.tasks[0].task.prompt).not.toContain('Создай с нуля');
  expect(state.uploads).toBe(0);
});

test('image keeps incompatible references and blocks generation instead of switching to from scratch', async ({
  page,
}) => {
  const state = await setup(page);
  const noReferences = structuredClone(catalog[0]);
  noReferences.name = 'Без референсов';
  noReferences.reference.model = 'test-no-references';
  delete noReferences.schema.properties!.task.properties!.fileIds;
  await page.route('**/api/aimodels?*', (route) => {
    const provider = catalogProvider(route.request().url());
    return provider === catalog[0].reference.provider
      ? route.fulfill({ json: catalogPage([catalog[0], noReferences]) })
      : route.fallback();
  });
  await page.goto('/image');
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toContainText('GPT Image 2');
  await page.getByRole('button', { name: 'Добавить изображение', exact: true }).click();
  await page
    .getByRole('button', { name: /Закат.png/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Модель', exact: true }).click();
  await page.getByRole('option', { name: 'Без референсов', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Убрать Закат.png', exact: true })).toBeVisible();
  await page.locator('#img-draft').fill('Измени исходное изображение');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Выберите модель с поддержкой выбранных референсов');
  expect(state.creates).toHaveLength(0);
  expect(state.tasks).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Убрать Закат.png', exact: true })).toBeVisible();
});

test('image viewer reports a failed original and returns focus without retrying generation', async ({
  page,
}) => {
  const state = await setup(page);
  await page.route('**/api/task', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    state.tasks.push(route.request().postDataJSON());
    const result = {
      id: 1,
      role: 'ASSISTANT',
      text: 'Готово',
      createdDate: file.createdDate,
      files: [{ ...file, preview: { image: { status: 'READY', url: '/media/gallery-2.jpg' } } }],
    };
    state.messages = [result];
    await route.fulfill({ json: result });
  });
  await page.route('**/api/file?**', (route) =>
    route.fulfill({
      json: pagination([{ ...file, preview: { image: { status: 'READY', url: '/media/gallery-2.jpg' } } }]),
    }),
  );
  let failImage!: () => void;
  const imageResponse = new Promise<void>((resolve) => {
    failImage = resolve;
  });
  await page.route('**/media/gallery-1.jpg', async (route) => {
    await imageResponse;
    await route.abort();
  });
  await page.goto('/image');
  await page.locator('#img-draft').fill('Закат');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  const opener = page.locator('.image-result-open');
  await expect(opener).toBeVisible();
  await opener.click();
  const viewer = page.getByRole('dialog', { name: 'Закат.png' });
  await expect(viewer.locator('img[aria-hidden=true]')).toBeVisible();
  await expect(viewer.getByRole('status')).toHaveCount(0);
  failImage();
  await expect(viewer.getByRole('alert')).toHaveText('Оригинал не открылся.');
  await expect(viewer.locator('img[aria-hidden=true]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(state.tasks).toHaveLength(1);
});

test('image loading uses the selected frame and does not submit on reload', async ({ page }) => {
  const state = await setup(page);
  state.conversation = {
    id: 101,
    userId: 7,
    status: 'LOADING',
    model: agent.reference.provider,
    options: {
      model: agent.reference.model,
      tools: [
        {
          uid: 'IMAGE',
          settings: {
            model: catalog[0].reference,
            options: { size: '1536x1024', quality: 'high' },
          },
        },
      ],
    },
  };
  await page.goto('/image?conversation=101');
  const pending = page.locator('.image-result-pending');
  await expect(pending).toBeVisible({ timeout: 15_000 });
  await expect(pending).toHaveCSS('aspect-ratio', '3 / 2');
  await expect(pending.locator('.img-spin')).toBeVisible();
  await page.reload();
  await expect(pending).toBeVisible({ timeout: 15_000 });
  expect(state.tasks).toHaveLength(0);
});

test('image result reserves its frame while loading and keeps actions under the pointer', async ({
  page,
}) => {
  const state = await setup(page);
  let showImage!: () => void;
  const imageReady = new Promise<void>((resolve) => {
    showImage = resolve;
  });
  await page.route('**/media/gallery-1.jpg', async (route) => {
    await imageReady;
    await route.continue();
  });
  await page.goto('/image');
  await page.locator('#img-draft').fill('Закат');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  const result = page.locator('.image-result');
  await expect(result).toBeVisible();
  const before = await result.boundingBox();
  expect(before!.height).toBeGreaterThan(100);
  await result.hover();
  const repeat = result.getByRole('button', { name: 'Переделать Закат.png', exact: true });
  await expect(repeat).toBeVisible();
  showImage();
  await expect
    .poll(() =>
      result.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await expect(repeat).toBeVisible();
  expect(await result.boundingBox()).toEqual(before);
  await repeat.click();
  await expect(page.locator('#img-draft')).toHaveValue(/^Закат\n\nПоследний референс/);
  expect(state.tasks).toHaveLength(1);
});

test('redo restores the original idea and template of a new request and attaches the result', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/image');
  await page.locator('#img-draft').fill('Моя исходная идея');
  await page.locator('.ds-template-card').first().click();
  await page.getByRole('button', { name: 'Редактировать шаблон', exact: true }).click();
  const template = await page.getByRole('textbox', { name: 'Текст шаблона', exact: true }).inputValue();
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('genfactory.file-recipes.v1.7') || '{}')['12']?.workspaceInput
            ?.templateText,
      ),
    )
    .toBe(template);
  await page.reload();
  const result = page.locator('.image-result');
  await expect
    .poll(() =>
      result.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await result.hover();
  await expect(result.locator('.img-actions')).toHaveCSS('transform', 'none');
  await expect(result.locator('.img-actions')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Переделать Закат.png', exact: true }).click();
  await expect(page.locator('#img-draft')).toHaveValue(/Моя исходная идея[\s\S]*Последний референс/);
  await expect(page.getByRole('button', { name: 'Убрать Закат.png', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Редактировать шаблон', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Текст шаблона', exact: true })).toHaveValue(template);
  expect(state.tasks).toHaveLength(1);
});

test('image viewer shows the thumbnail while the original loads and replaces it when ready', async ({
  page,
}) => {
  const state = await setup(page);
  const previewFile = { ...file, preview: { image: { status: 'READY', url: '/media/gallery-2.jpg' } } };
  await page.route('**/api/file?**', (route) => route.fulfill({ json: pagination([previewFile]) }));
  let release!: () => void;
  const original = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/media/gallery-1.jpg', async (route) => {
    await original;
    await route.continue();
  });
  await page.clock.install();
  await page.goto('/image');
  const opener = page.locator('.image-result-open');
  await expect
    .poll(() =>
      opener.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await opener.click();
  const viewer = page.getByRole('dialog', { name: 'Закат.png' });
  await expect(viewer.locator('img[aria-hidden=true]')).toBeVisible();
  await expect(viewer.getByRole('status')).toHaveCount(0);
  await expect(viewer.locator('img:not([aria-hidden])')).toHaveCSS('opacity', '0');
  await page.clock.fastForward(30001);
  await expect(viewer.getByRole('alert')).toHaveText('Оригинал не открылся.');
  await expect(viewer.locator('img[aria-hidden=true]')).toBeVisible();
  release();
  await expect(viewer.locator('img:not([aria-hidden])')).toHaveCSS('opacity', '1');
  await expect(viewer.locator('img[aria-hidden=true]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await opener.click();
  await expect(viewer.locator('img:not([aria-hidden])')).toHaveCSS('opacity', '1');
  await expect(viewer.getByRole('status')).toHaveCount(0);
  expect(state.tasks).toHaveLength(0);
});

test('direct image results do not depend on conversation clarification messages', async ({ page }) => {
  const state = await setup(page);
  state.messages = [
    { id: 10, role: 'ASSISTANT', text: 'Как называется товар?', files: [], createdDate: file.createdDate },
  ];
  await page.goto('/image');
  await page.locator('#img-draft').fill('Карточка товара');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect(page.locator('.image-result')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.image-result')).toHaveCount(1);
  await expect(page.locator('.media-answer-card')).toHaveCount(0);
  await page.locator('#img-draft').fill('Синяя чашка');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(2);
  await page.reload();
  await expect(page.locator('.image-result')).toHaveCount(1);
  await expect(page.locator('.media-answer-card')).toHaveCount(0);
  expect(state.creates).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
  expect(state.messages[0].text).toBe('Как называется товар?');
});

test('image hides provider funding errors without suggesting a top-up or retrying', async ({ page }) => {
  await setup(page);
  let sends = 0;
  await page.route('**/api/task', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    sends++;
    await route.fulfill({
      status: 402,
      json: {
        code: 'AI_VENDOR_ERROR',
        message: 'OpenRouter: insufficient credits. Add funds to your provider account.',
      },
    });
  });
  await page.goto('/image');
  await page.locator('#img-draft').fill('Сохранить мой промпт');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Сервис временно недоступен');
  await expect(alert).not.toContainText(/OpenRouter|credits|Пополните|InsufficientFunds/i);
  await expect(page.locator('#img-draft')).toHaveValue('Сохранить мой промпт');
  expect(sends).toBe(1);
});
