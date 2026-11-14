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
  await expect(page.locator('.ds-template-card')).toHaveCount(
    JSON.parse(
      readFileSync(new URL('../../src/features/content-studio/templates.json', import.meta.url), 'utf8'),
    ).filter((item: { kind: string }) => item.kind === 'image').length,
  );
  await expect
    .poll(() => page.locator('.img-dock').boundingBox())
    .toEqual({ x: 484, y: 782, width: 720, height: 146 });
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
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toContainText('Riverflow V2.6 Pro');
  await page.getByRole('button', { name: 'Стороны', exact: true }).click();
  await page.getByRole('option', { name: '3:2', exact: true }).click();
  await page.getByRole('button', { name: 'Качество', exact: true }).click();
  await page.getByRole('option', { name: '2K', exact: true }).click();
  await page.locator('#img-draft').fill('Закат над лесом');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect(page.locator('.image-result')).toHaveCount(1);
  expect(state.creates).toHaveLength(0);
  expect(state.tasks).toHaveLength(1);
  expect(state.tasks[0].options).toMatchObject({
    aspectRatio: '3:2',
    resolution: '2K',
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
  await expect(page.locator('.img-files .composer-attachment')).toHaveCount(1);
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
    await expect(page.locator('.ds-template-card')).toHaveCount(
      JSON.parse(
        readFileSync(new URL('../../src/features/content-studio/templates.json', import.meta.url), 'utf8'),
      ).filter((item: { kind: string }) => item.kind === 'image').length,
    );
    const box = await page.locator('.img-dock').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: 'Модель', exact: true }).click();
    const menu = await page.getByRole('listbox', { name: 'Модель', exact: true }).boundingBox();
    expect(menu!.x).toBeGreaterThanOrEqual(0);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
for (const width of [320, 390]) {
  test(`mobile image settings scroll in one row and keep menus usable at ${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: Array<string> = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const state = await setup(page);
    await page.goto('/image');
    await expect(page.locator('.ds-template-card')).toHaveCount(
      JSON.parse(
        readFileSync(new URL('../../src/features/content-studio/templates.json', import.meta.url), 'utf8'),
      ).filter((item: { kind: string }) => item.kind === 'image').length,
    );
    const settings = page.locator('.img-settings');
    const send = page.getByRole('button', { name: 'Собрать изображение', exact: true });
    await expect(settings).toHaveCSS('overflow-x', 'auto');
    expect(await settings.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    const buttons = await settings.locator(':scope > * > button, :scope > button').evaluateAll((items) =>
      items.map((el) => {
        const rect = el.getBoundingClientRect();
        return rect.y + rect.height / 2;
      }),
    );
    expect(Math.max(...buttons) - Math.min(...buttons)).toBeLessThan(1);
    await settings.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect(send).toBeInViewport();
    await page.getByRole('button', { name: 'Качество', exact: true }).click();
    const menu = page.getByRole('listbox', { name: 'Качество', exact: true });
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((el) => el.matches(':popover-open'))).toBe(true);
    const menuBox = await menu.boundingBox();
    const dock = await page.locator('.img-dock').boundingBox();
    expect(menuBox!.y + menuBox!.height).toBeLessThan(dock!.y);
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`image-settings-menu-${width}.png`) });
    await page.getByRole('option', { name: '2K', exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Качество', exact: true })).toContainText('2K');
    await page.screenshot({ path: testInfo.outputPath(`image-settings-${width}.png`) });
    expect(state.tasks).toHaveLength(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test('image gallery and composer follow the visual viewport through keyboard dismissal', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const viewport = window.visualViewport!;
    let height = 844,
      top = 0;
    Object.defineProperties(viewport, { height: { get: () => height }, offsetTop: { get: () => top } });
    (
      window as unknown as { resizeImageViewport: (height: number, top: number) => void }
    ).resizeImageViewport = (nextHeight, nextTop) => {
      height = nextHeight;
      top = nextTop;
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    };
  });
  const state = await setup(page);
  await page.goto('/image');
  await expect(page.locator('.ds-template-card')).toHaveCount(
    JSON.parse(
      readFileSync(new URL('../../src/features/content-studio/templates.json', import.meta.url), 'utf8'),
    ).filter((item: { kind: string }) => item.kind === 'image').length,
  );
  const draft = page.getByRole('textbox', { name: 'Идея', exact: true });
  await draft.fill('Сохранить черновик');
  for (const [height, top] of [
    [400, 60],
    [844, 0],
    [750, 0],
    [844, 0],
  ]) {
    await page.evaluate(
      ([height, top]) =>
        (
          window as unknown as { resizeImageViewport: (height: number, top: number) => void }
        ).resizeImageViewport(height, top),
      [height, top],
    );
    await expect
      .poll(() => page.locator('.img-wall').evaluate((el) => el.getBoundingClientRect().bottom))
      .toBe(height + top);
    const wall = await page.locator('.img-wall').boundingBox();
    const dock = await page.locator('.img-dock').boundingBox();
    expect(wall!.y + wall!.height - dock!.y - dock!.height).toBeCloseTo(12, 0);
    await expect(draft).toHaveValue('Сохранить черновик');
    await expect(draft).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`image-viewport-${height}-${top}.png`) });
  }
  expect(state.tasks).toHaveLength(0);
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
        const before = await page.locator('#img-draft').inputValue();
        await page.getByRole('button', { name: item.title, exact: true }).click();
        const dialog = page.getByRole('dialog');
        await expect
          .poll(
            async () =>
              (await dialog.isVisible()) || (await page.locator('#img-draft').inputValue()) !== before,
          )
          .toBe(true);
        if (await dialog.isVisible()) {
          for (const input of await dialog.locator('[data-template-variable]').all())
            await input.fill('Тестовые данные');
          await dialog.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
        }
        await expect(dialog).toHaveCount(0);
        await expect(page.locator('#img-draft')).not.toHaveValue('');
        expect(await page.locator('#img-draft').inputValue()).not.toMatch(/\{[A-Za-z][A-Za-z_0-9]*\}/);
      }
      await page.locator('#img-draft').fill('');
      await expect(page.locator('.ds-template-card[aria-pressed=true]')).toHaveCount(0);
      expect(state.tasks).toHaveLength(0);
      expect(state.creates).toHaveLength(0);
      expect(state.uploads).toBe(0);
    });
  }
});

test('canceling a parameterized template preserves the prompt and applying a plain template replaces it', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/image');
  await page.locator('#img-draft').fill('Моя задача');
  await page.getByRole('button', { name: 'Главное фото на белом фоне (маркетплейс)', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.locator('#img-draft')).toHaveValue('Моя задача');
  await page.getByRole('button', { name: 'Портрет в масштабе', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#img-draft')).toHaveValue(/Ultra-photorealistic/);
  await expect(page.locator('.composer-template')).toHaveCount(0);
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

test('filled template text survives reload and is submitted as the visible prompt', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/image');
  await page.getByRole('button', { name: 'Главное фото на белом фоне (маркетплейс)', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название вашего продукта', { exact: true }).fill('Красная чашка');
  await dialog.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
  const prompt = await page.locator('#img-draft').inputValue();
  expect(prompt).not.toContain('{PRODUCT}');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('genfactory.draft.v1.7.image:new:all')))
    .toContain('Красная чашка');
  await page.reload();
  await expect(page.locator('#img-draft')).toHaveValue(prompt);
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  expect(state.tasks[0].task.prompt).toBe(prompt);
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
  await page.getByRole('button', { name: 'Портрет в масштабе', exact: true }).click();
  const prompt = await page.locator('#img-draft').inputValue();
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('genfactory.file-recipes.v1.7') || '{}')['12']?.workspaceInput
            ?.idea,
      ),
    )
    .toBe(prompt);
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
  await expect(page.locator('#img-draft')).toHaveValue(/Ultra-photorealistic[\s\S]*Последний референс/);
  await expect(page.getByRole('button', { name: 'Убрать Закат.png', exact: true })).toHaveCount(1);
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

test('image explains provider funding errors without suggesting an application top-up or retrying', async ({
  page,
}) => {
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
  await expect(alert).toContainText('На стороне провайдера исчерпаны средства или лимит');
  await expect(alert).toContainText('HTTP 402');
  await expect(alert).toContainText('OpenRouter: insufficient credits');
  await expect(alert).not.toContainText('Пополните баланс');
  await expect(page.locator('#img-draft')).toHaveValue('Сохранить мой промпт');
  expect(sends).toBe(1);
});

test('new image selection excludes hidden models and K3 Edit requires an original before sending', async ({
  page,
}) => {
  const state = await setup(page);
  const edit = catalog.find((model) => model.reference.model === 'krea/k3-edit')!;
  const records = [
    { ...edit, status: 'ACTIVE' },
    {
      ...edit,
      reference: { ...edit.reference, model: 'hidden-image' },
      name: 'Hidden test model',
      status: 'HIDDEN',
    },
    {
      ...edit,
      reference: { ...edit.reference, model: 'disabled-image' },
      name: 'Disabled test model',
      status: 'DISABLED',
    },
  ];
  const queries: Array<Record<string, unknown>> = [];
  await page.route('**/api/aimodels?*', (route) => {
    const url = new URL(route.request().url());
    if (catalogProvider(url) !== 'OPEN_ROUTER_IMAGE') return route.fallback();
    const conditions = JSON.parse(url.searchParams.get('conditions') || '{}');
    queries.push(conditions);
    return route.fulfill({
      json: catalogPage(records.filter((model) => !conditions.status || model.status === conditions.status)),
    });
  });
  await page.goto('/image');
  await page.getByRole('button', { name: 'Модель', exact: true }).click();
  await expect(page.getByRole('option', { name: 'K3 Edit', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: /Hidden test model|Disabled test model/ })).toHaveCount(0);
  await page.getByRole('option', { name: 'K3 Edit', exact: true }).click();
  await page.locator('#img-draft').fill('Измени цвет лампы на исходном фото');
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Добавьте референсы для выбранной модели');
  expect(state.tasks).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
  expect(state.creates).toHaveLength(0);
  await page.getByRole('button', { name: 'Добавить изображение', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Библиотека', exact: true });
  await picker.locator('.library-card').filter({ hasText: file.name }).click();
  const confirm = picker.getByRole('button', { name: 'Добавить (1)', exact: true });
  if (await confirm.isVisible()) await confirm.click();
  await expect(picker).toHaveCount(0);
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  expect(state.tasks[0].task.fileIds).toEqual([12]);
  expect(state.tasks[0].options.model).toBe('krea/k3-edit');
  expect(queries.length).toBeGreaterThan(0);
  expect(queries.every((conditions) => conditions.status === 'ACTIVE')).toBe(true);
});
