import { withStudioContext, parseStudioContext } from '../../src/features/content-studio/studioAgent';
import { catalogProvider, catalogPage, catalogResponse } from './modelCatalog';
import { modelTitle } from '../../src/features/catalog/presentation';
import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { IConversation, IConversationMessage, IModelDescription } from '../../src/lib/types';
const templates: { id: string; kind: string; title: string }[] = JSON.parse(
  readFileSync(new URL('../../src/features/content-studio/templates.json', import.meta.url), 'utf8'),
);
const catalog: IModelDescription[] = JSON.parse(
  readFileSync(new URL('../fixtures/catalog.json', import.meta.url), 'utf8'),
);
const agent: IModelDescription = JSON.parse(
  readFileSync(new URL('../fixtures/agent.json', import.meta.url), 'utf8'),
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
const pagination = <T>(items: T[], pageSize = 24) => ({
  items,
  total: items.length,
  pages: 1,
  pageSize,
  pageIndex: 0,
});
function savedConversation(id = 101): IConversation {
  return {
    id,
    userId: 7,
    name: 'Saved creative work',
    status: 'LOADED',
    model: agent.reference.provider,
    options: {
      model: agent.reference.model,
      tools: [
        {
          uid: 'IMAGE',
          settings: {
            model: catalog.find((item) => item.reference.provider === 'OPEN_ROUTER_IMAGE')!.reference,
            options: {},
            isLockSelection: true,
          },
        },
        { uid: 'VIDEO' },
      ],
    },
    tags: ['genfactory'],
    createdDate: file.createdDate,
  };
}
// Старые редакторы остаются доступны по URL; их пункты убраны из меню прототипа.
async function navigateLegacyRoute(page: Page, path: string) {
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  if (!path.startsWith('/image') && !path.startsWith('/video'))
    await expect(page.locator('.image-workspace')).toHaveCount(0);
}
async function selectLibraryFile(page: Page, name: string): Promise<void> {
  const picker = page.getByRole('dialog', { name: 'Библиотека' });
  await picker.getByText(name, { exact: true }).click();
  const confirm = picker.getByRole('button', { name: /^Добавить \(\d+\)$/ });
  if (await confirm.isVisible()) await confirm.click();
}

async function openViewerActions(page: Page) {
  const trigger = page.locator('.preview-menu > summary');
  if ((await trigger.isVisible()) && (await trigger.locator('..').getAttribute('open')) === null)
    await trigger.click();
}
async function mockApi(page: Page, signedIn = true) {
  await page.route('**/test-video.mp4', (route) =>
    route.fulfill({
      contentType: 'video/mp4',
      body: readFileSync(new URL('../fixtures/preview.mp4', import.meta.url)),
    }),
  );
  const state = {
    conversations: [] as IConversation[],
    messages: new Map<number, IConversationMessage[]>(),
    creates: [] as any[],
    sends: [] as any[],
    tasks: [] as any[],
    generated: [] as any[],
    forbidden: [] as string[],
    abortAfterAccept: false,
    scriptReply: undefined as string | undefined,
    uploads: 0,
    edits: [] as any[],
    patches: [] as any[],
    progress: null as unknown,
    socket: undefined as WebSocketRoute | undefined,
    joinedRooms: [] as string[],
  };
  await page.routeWebSocket('**/socket.io/**', (socket) => {
    state.socket = socket;
    socket.send(
      '0' +
        JSON.stringify({
          sid: 'mock-engine',
          upgrades: [],
          pingInterval: 25000,
          pingTimeout: 20000,
          maxPayload: 1000000,
        }),
    );
    socket.onMessage((message) => {
      const text = String(message);
      if (text.startsWith('40/gnosisai,')) {
        socket.send('40/gnosisai,' + JSON.stringify({ sid: 'mock-namespace' }));
        socket.send('42/gnosisai,' + JSON.stringify(['transportSocketConnected']));
      } else if (text.startsWith('42/gnosisai,')) {
        const [name, command] = JSON.parse(text.slice(text.indexOf('[')));
        if (name === 'transportSocketCommandRequest') {
          if (command.request.action === 'ADD') state.joinedRooms.push(command.request.name);
          if (command.isNeedReply)
            socket.send(
              '42/gnosisai,' +
                JSON.stringify([
                  'transportSocketCommandResponse',
                  { id: command.id, response: command.request.name },
                ]),
            );
        }
      } else if (text === '3') {
        /* pong */
      }
    });
  });
  if (signedIn) await page.addInitScript(() => sessionStorage.setItem('genfactory.session', 'test-session'));
  await page.route('https://sso.example.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>SSO logout</h1>' }),
  );
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/api/task' && route.request().method() === 'GET')
      return route.fulfill({ json: [] });
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    let body: unknown;
    let status = 200;
    const messageMatch = path.match(/^\/api\/conversation\/(\d+)\/message$/);
    const conversationMatch = path.match(/^\/api\/conversation\/(\d+)$/);
    if (path === '/api/init')
      body = {
        user: { id: 7, preferences: { name: 'Anna', email: 'anna@example.test' } },
        balances: { RUB: '1250.50' },
      };
    else if (path === '/api/config')
      body = { keycloak: { url: 'https://sso.example.test', realm: 'gnosis', clientId: 'gnosis' } };
    else if (path === '/api/task' && method === 'POST') {
      const input = route.request().postDataJSON();
      state.tasks.push(input);
      const video = input.model === 'OPEN_ROUTER_VIDEO';
      const result = {
        ...file,
        ...(video ? { type: 'VIDEO', mime: 'video/mp4', path: '/test-video.mp4' } : {}),
        origin: {
          kind: 'GENERATION',
          sourceFileIds: input.task.fileIds || [],
          generation: {
            model: { provider: input.model, model: input.options.model },
            prompt: input.task.prompt,
            options: input.options,
          },
        },
      };
      state.generated = [result];
      body = {
        result: video ? { externalId: 'video-test', fileId: result.id } : [],
        cost: { status: 'FINAL', amounts: [{ amount: '1', coinId: 'RUB' }] },
        files: [result],
      };
      if (state.abortAfterAccept) {
        await route.abort('failed');
        return;
      }
    } else if (path.startsWith('/api/task/conversation')) body = state.progress;
    else if (['/api/aimodel/OPEN_AI_CONVERSATION', '/api/aimodel/OPEN_ROUTER_CONVERSATION'].includes(path))
      body = {
        tools: [
          { uid: 'YANDEX' },
          { uid: 'IMAGE' },
          { uid: 'VIDEO' },
          { uid: 'DOCUMENT_READ' },
          { uid: 'mcp:TEST', name: 'Test connector' },
        ],
      };
    else if (path === '/api/aimodels')
      body =
        catalogProvider(url) === 'OPEN_ROUTER_CONVERSATION'
          ? [agent]
          : catalog.filter((m) => m.reference.provider === catalogProvider(url));
    else if (path === '/api/conversation' && method === 'POST') {
      const data = route.request().postDataJSON();
      state.creates.push(data);
      const conversation = { ...savedConversation(101 + state.conversations.length), ...data };
      state.conversations.push(conversation);
      body = conversation;
      status = 201;
    } else if (path === '/api/conversation') {
      const conditions = JSON.parse(url.searchParams.get('conditions')!);
      expect(conditions.userId).toBe(
        route.request().headers().authorization === 'Bearer second-user' ? 8 : 7,
      );
      body = pagination(
        state.conversations.filter(
          (c) =>
            c.userId === conditions.userId &&
            (!conditions.status || c.status === conditions.status) &&
            (conditions.isArchived === undefined || !!c.isArchived === conditions.isArchived) &&
            (conditions.isFavorite === undefined || !!c.isFavorite === conditions.isFavorite),
        ),
      );
    } else if (messageMatch) {
      const id = Number(messageMatch[1]);
      if (method === 'GET') {
        expect(JSON.parse(url.searchParams.get('conditions')!).conversationId).toBe(id);
        body = pagination([...(state.messages.get(id) || [])].reverse(), 20);
      } else {
        const data = route.request().postDataJSON();
        state.sends.push({ id, ...data });
        const messages = state.messages.get(id) || [];
        messages.push({
          id: messages.length + 1,
          role: 'USER',
          text: data.text,
          files: data.files.length ? [file] : [],
          createdDate: file.createdDate,
        });
        const result = {
          ...file,
          ...(data.settings.tools[0]?.uid === 'VIDEO'
            ? { type: 'VIDEO', mime: 'video/mp4', path: '/test-video.mp4' }
            : {}),
        };
        body = {
          id: messages.length + 1,
          role: 'ASSISTANT',
          text: data.text.includes('[Genfactory:prompt-input] ')
            ? JSON.stringify({
                status: 'ready',
                title: 'Готовый промпт',
                prompt: 'Точный промпт для генерации.',
                observations: [],
                clarifications: [],
                limitations: [],
              })
            : data.text.startsWith('[Genfactory:')
              ? (data.text.startsWith('[Genfactory:script]') && state.scriptReply) ||
                'Точный промпт для генерации.'
              : 'Готово: результат сохранён.',
          files: data.text.startsWith('[Genfactory:') ? [] : [result],
          createdDate: file.createdDate,
        };
        messages.push(body as IConversationMessage);
        state.messages.set(id, messages);
        const conversation = state.conversations.find((c) => c.id === id);
        if (conversation) conversation.status = 'LOADED';
        if (state.abortAfterAccept) {
          await route.abort('failed');
          return;
        }
      }
    } else if (conversationMatch) {
      const found = state.conversations.find((c) => c.id === Number(conversationMatch[1]));
      if (method === 'PATCH' && found) {
        const changes = route.request().postDataJSON();
        state.patches.push(changes);
        Object.assign(found, changes);
      }
      if (method === 'PUT' && found) {
        const changes = route.request().postDataJSON();
        state.edits.push(changes);
        Object.assign(found, changes);
      }
      body = found;
      if (!body) {
        status = 404;
        body = { message: 'Conversation not found' };
      }
    } else if (path === '/api/file' && method === 'GET')
      body = pagination(state.generated.length ? state.generated : [file]);
    else if (path === '/api/file' && method === 'POST') body = { ...file, id: 12 + state.uploads++ };
    else if (path === '/api/file/12') body = file;
    else if (/^\/api\/file\/\d+$/.test(path) && Number(path.split('/').pop()) < 12 + state.uploads)
      body = { ...file, id: Number(path.split('/').pop()) };
    else if (/^\/api\/file\/\d+\/download$/.test(path)) body = {};
    else if (path === '/api/paymentTransaction') body = pagination([]);
    else if (path === '/api/logout') body = {};
    else {
      state.forbidden.push(path);
      status = 404;
      body = { message: 'Unexpected endpoint' };
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(catalogResponse(route.request().url(), body)),
    });
  });
  return state;
}
async function submit(page: Page, prompt = 'A calm cinematic forest', kind = 'image') {
  await page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ }).fill(prompt);
  await page
    .getByRole('button', {
      name:
        kind === 'image' ? /^(Создать изображение|Собрать изображение)$/ : /^(Создать видео|Собрать видео)$/,
      exact: true,
    })
    .click();
}
async function chooseModel(page: Page, key: string) {
  const control = page.getByLabel('Модель', { exact: true });
  await expect(control).toBeEnabled();
  if (await control.evaluate((el) => el.tagName === 'SELECT')) await control.selectOption(key);
  else {
    await control.click();
    const model = catalog.find((m) => `${m.reference.provider}:${m.reference.model}` === key)!;
    await page.getByRole('option', { name: modelTitle(model), exact: true }).click();
  }
}
async function expectCompleted(page: Page) {
  await expect(page.locator('.image-workspace, .video-workspace, .studio').first()).toBeVisible();
  if (await page.locator('.image-workspace, .video-workspace').count())
    await expect(page.locator('.image-result, .video-result')).toHaveCount(1);
  else await expect(page.getByText('Готово: результат сохранён.', { exact: true })).toBeVisible();
}
async function expectQuality(page: Page, quality: string) {
  const field = page.getByLabel('Качество', { exact: true });
  if (await field.evaluate((el) => el.tagName === 'SELECT'))
    await expect(field).toHaveValue(JSON.stringify(quality));
  else await expect(field).toHaveText(quality);
}
test('guest can explore and open a studio without fabricated models', { tag: '@smoke' }, async ({ page }) => {
  await mockApi(page, false);
  await page.goto('/');
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Изображения', exact: true }).click();
  await submit(page, 'Гостевая идея');
  await expect(page).toHaveURL(/sso\.example\.test.*openid-connect\/auth/);
  expect(new URL(page.url()).searchParams.get('theme')).toBe('genfactory');
});
test(
  'image studio sends a direct task with saved results and creates no conversation',
  { tag: '@smoke' },
  async ({ page }) => {
    const state = await mockApi(page);
    await page.goto('/image');
    await submit(page);
    await expectCompleted(page);
    expect(state.creates).toHaveLength(0);
    expect(state.sends).toHaveLength(0);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({
      model: catalog.find((model) => model.reference.provider === 'OPEN_ROUTER_IMAGE')!.reference.provider,
      isSaveResult: true,
      options: {
        model: catalog.find((model) => model.reference.provider === 'OPEN_ROUTER_IMAGE')!.reference.model,
      },
    });
    expect(state.tasks[0].task.prompt).toBe('A calm cinematic forest');
    expect(state.forbidden).toEqual([]);
    await expect(page).not.toHaveURL(/conversation=/);
    await page.screenshot({ path: 'test-results/studio-desktop.png', fullPage: true });
    await navigateLegacyRoute(page, '/library');
    await expect(page.getByRole('button', { name: /Test result/ })).toBeVisible();
  },
);
test('advanced editor: invalid parameters do not create or execute a conversation', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/image?studio=advanced');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page.getByLabel('Размер', { exact: true }).fill('invalid');
  await submit(page);
  await expect(page.getByRole('alert')).toContainText('pattern');
  expect(state.creates).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
});
test('video settings use a direct video task and server-saved files', { tag: '@smoke' }, async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/video');
  await submit(page, 'City camera movement', 'video');
  await expectCompleted(page);
  expect(state.tasks).toHaveLength(1);
  expect(state.tasks[0]).toMatchObject({ model: 'OPEN_ROUTER_VIDEO', isSaveResult: true });
  expect(state.creates).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
  await expect(page.locator('.result-grid video, .video-result video')).toHaveCount(1);
  expect(state.forbidden).toEqual([]);
});
test(
  'saved direct task result recovers from the library after a lost response without a second POST',
  { tag: '@smoke' },
  async ({ page }) => {
    const state = await mockApi(page);
    state.abortAfterAccept = true;
    await page.goto('/image');
    await submit(page);
    await expect(page.getByRole('alert')).toContainText('Автоматического повтора нет');
    await page.reload();
    await expectCompleted(page);
    expect(state.tasks).toHaveLength(1);
    expect(state.sends).toHaveLength(0);
    expect(state.creates).toHaveLength(0);
    expect(
      await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('genfactory.jobs'))),
    ).toBe(false);
  },
);
test('history opens existing conversation results and a new generation uses a direct task', async ({
  page,
}) => {
  const state = await mockApi(page);
  const saved = savedConversation();
  const selected = catalog.find((model) => model.reference.provider === 'OPEN_ROUTER_IMAGE')!;
  saved.options.tools = [
    { uid: 'IMAGE', settings: { model: selected.reference, options: { resolution: '2K' } } },
  ];
  state.conversations.push(saved);
  state.generated = [
    {
      ...file,
      origin: {
        kind: 'GENERATION',
        generation: {
          model: selected.reference,
          prompt: 'Existing server result',
          options: { resolution: '2K' },
        },
      },
    },
  ];
  state.messages.set(101, [
    {
      id: 1,
      role: 'ASSISTANT',
      text: 'Existing server result',
      files: [file],
      createdDate: file.createdDate,
    },
  ]);
  await page.goto('/history');
  await expect(page.locator('.history-card')).toHaveCount(1);
  await page.goto('/image?conversation=101');
  await expect(page.locator('.image-result')).toHaveCount(1);
  await expectQuality(page, '2K');
  await submit(page, 'Another landscape');
  await expect.poll(() => state.tasks.length).toBe(1);
  await expectCompleted(page);
  expect(state.creates).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
  expect(state.tasks).toHaveLength(1);
  expect(state.tasks[0].task.prompt).toBe('Another landscape');
});
test('advanced editor: image to video starts a direct video task with the chosen file ID', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/image?studio=advanced');
  await submit(page);
  await page.getByRole('button', { name: 'Оживить', exact: true }).click();
  await expect(page).toHaveURL(/video\?conversation=101/);
  await expect(page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  await submit(page, 'Animate this image', 'video');
  await expect.poll(() => state.tasks.length).toBe(1);
  expect(state.tasks[0]).toMatchObject({
    model: 'OPEN_ROUTER_VIDEO',
    isSaveResult: true,
    task: { fileIds: [12] },
  });
  expect(state.sends).toHaveLength(1);
  expect(state.creates).toHaveLength(1);
});
test('library reference is attached to a conversation message', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/library');
  await page.getByRole('button', { name: /Test result/ }).click();
  await openViewerActions(page);
  await page.getByRole('button', { name: 'Использовать как референс' }).click();
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  await submit(page, 'Change lighting');
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([12]);
});
test('library reference survives returning to a studio with a cached catalog', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/image');
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toBeVisible();
  await navigateLegacyRoute(page, '/library');
  await page.getByRole('button', { name: /Test result/ }).click();
  await openViewerActions(page);
  await page.getByRole('button', { name: 'Использовать как референс' }).click();
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  await submit(page, 'Use this reference');
  await expect.poll(() => state.tasks.length).toBe(1);
  expect(state.tasks[0].task.fileIds).toEqual([12]);
});
test('running conversation survives page load and blocks a second send until server completion', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push({ ...savedConversation(), status: 'LOADING' });
  await page.goto('/image?conversation=101');
  await expect(page.getByText('Создаём изображение…', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Собрать изображение' })).toBeDisabled();
  state.conversations[0].status = 'LOADED';
  state.messages.set(101, [
    { id: 1, role: 'ASSISTANT', text: 'Recovered result', files: [file], createdDate: file.createdDate },
  ]);
  await expect.poll(() => !!state.socket).toBeTruthy();
  state.socket!.send(
    '42/gnosisai,' +
      JSON.stringify([
        'transportSocketEvent',
        {
          uid: crypto.randomUUID(),
          name: 'ConversationChangedEvent',
          data: { id: 101, item: { status: 'LOADED' } },
        },
      ]),
  );
  await expect(page.locator('.image-result')).toHaveCount(1, { timeout: 10000 });
  expect(state.sends).toHaveLength(0);
});
test('advanced editor: new work creates a new conversation while subsequent prompts reuse the current one', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/image?studio=advanced');
  await submit(page, 'First landscape');
  await expect(page.getByText('Готово: результат сохранён.', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Создать с нуля', exact: true }).click();
  await submit(page, 'Second landscape');
  await expect(page.getByText('Готово: результат сохранён.', { exact: true })).toHaveCount(2);
  expect(state.creates).toHaveLength(1);
  await page.getByRole('button', { name: 'Новая работа', exact: true }).click();
  await submit(page, 'Separate work');
  await expect(page).toHaveURL(/conversation=102/);
  expect(state.creates).toHaveLength(2);
});
test('mobile navigation and layout remain usable', { tag: '@smoke' }, async ({ page }) => {
  await mockApi(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page
    .getByRole('navigation', { name: 'Основное меню' })
    .getByRole('link', { name: 'Видео', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Видео', exact: true })).toBeVisible();
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
  await expect(
    page.getByRole('main').getByRole('button', { name: 'Войти в аккаунт', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('genfactory.session'))).toBeNull();
});

test(
  'OAuth callback rejects a mismatched state without exchanging the code',
  { tag: '@smoke' },
  async ({ page }) => {
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
  },
);

for (const path of ['/chat', '/image']) {
  test(`conversation access follows backend permission on ${path}`, async ({ page }) => {
    const state = await mockApi(page);
    state.conversations.push({ ...savedConversation(), userId: 8, name: 'Shared work' });
    state.messages.set(101, [
      { id: 1, role: 'ASSISTANT', text: 'Result allowed by API', files: [], createdDate: file.createdDate },
    ]);
    await page.goto(`${path}?conversation=101`);
    await expect(page.getByText('Result allowed by API', { exact: true })).toBeVisible();
    expect(state.sends).toHaveLength(0);
    expect(state.edits).toHaveLength(0);
  });
  test(`conversation access preserves backend denial on ${path}`, async ({ page }) => {
    await mockApi(page);
    await page.route('**/api/conversation/101', (route) =>
      route.fulfill({ status: 403, json: { message: 'Access denied' } }),
    );
    let messages = 0;
    await page.route('**/api/conversation/101/message?*', (route) => {
      messages++;
      return route.fulfill({ json: pagination([]) });
    });
    await page.goto(`${path}?conversation=101`);
    await expect(page.getByRole('alert').first()).toBeVisible();
    expect(messages).toBe(0);
  });
}

test('conversation without a media tool remains read-only instead of changing its configuration', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push({ ...savedConversation(), options: { model: agent.reference.model, tools: [] } });
  await page.goto('/image?conversation=101');
  await expect(page.getByText(/В этой беседе не подключён инструмент изображений/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^(Создать изображение|Собрать изображение)$/, exact: true }),
  ).toBeDisabled();
  expect(state.creates).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
});

test('leaving during conversation creation never starts a paid message in the background', async ({
  page,
}) => {
  const state = await mockApi(page);
  let accept!: () => void;
  const waiting = new Promise<void>((resolve) => {
    accept = resolve;
  });
  await page.route('**/api/conversation', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await waiting;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(savedConversation()),
    });
  });
  await page.goto('/image?studio=advanced');
  const started = page.waitForRequest(
    (r) => new URL(r.url()).pathname === '/api/conversation' && r.method() === 'POST',
  );
  await submit(page);
  await started;
  await navigateLegacyRoute(page, '/library');
  const completed = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/conversation' && r.request().method() === 'POST',
  );
  accept();
  await completed;
  await expect(page.getByRole('heading', { name: 'Библиотека', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/library$/);
  expect(state.sends).toHaveLength(0);
});

test('login persists in a new tab and logout clears both tabs immediately', async ({ page, context }) => {
  await mockApi(page);
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Выйти из студии' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('genfactory.session'))).toBe('test-session');
  const second = await context.newPage();
  await mockApi(second, false);
  await second.goto('/account');
  await expect(second.getByRole('button', { name: 'Выйти из студии' })).toBeVisible();
  await second.getByRole('button', { name: 'Выйти из студии' }).click();
  await second
    .getByRole('dialog', { name: 'Выйти из аккаунта?' })
    .getByRole('button', { name: 'Выйти', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Выйти из студии' })).not.toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('genfactory.session'))).toBeNull();
  // The test context owns both tabs and closes them during fixture teardown.
});

test('socket tool progress is scoped to the conversation and errors remain visible', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push({ ...savedConversation(), status: 'LOADING' });
  await page.goto('/image?conversation=101');
  await expect.poll(() => state.joinedRooms.includes('conversation101')).toBe(true);
  const emit = (session: string, tools: unknown[]) =>
    state.socket!.send(
      '42/gnosisai,' +
        JSON.stringify([
          'transportSocketEvent',
          { uid: crypto.randomUUID(), name: 'TaskProgressedEvent', data: { session, data: { tools } } },
        ]),
    );
  emit('conversation999', [{ uid: 'VIDEO' }]);
  await expect(page.getByText('Ожидаем готовое видео', { exact: true })).not.toBeVisible();
  emit('conversation101', [{ uid: 'IMAGE', args: 'hidden internal arguments' }]);
  await expect(page.getByText('Создаём изображение', { exact: true })).toBeVisible();
  await expect(page.getByText('hidden internal arguments')).not.toBeVisible();
  emit('conversation101', [{ uid: 'IMAGE', status: 'ERRORED' }]);
  await expect(page.getByText('Генерация изображения: ошибка')).toBeVisible();
});

test('HTTP progress restores video activity after reload without resubmitting', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push({ ...savedConversation(), status: 'LOADING' });
  state.progress = { data: { tools: [{ uid: 'VIDEO' }] } };
  await page.goto('/video?conversation=101');
  await expect(page.getByText('Ожидаем готовое видео', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Ожидаем готовое видео', { exact: true })).toBeVisible();
  expect(state.sends).toHaveLength(0);
});

for (const route of ['/chat', '/image', '/video']) {
  test(`saved moderation reason survives a reload in ${route}`, async ({ page }) => {
    const state = await mockApi(page);
    const conversation: IConversation = {
      ...savedConversation(),
      status: 'ERROR',
      error: { code: 'AI_VENDOR_ERROR', message: 'Generated video rejected by content moderation.' },
    };
    state.conversations.push(conversation);
    state.messages.set(conversation.id, [
      { id: 1, role: 'USER', text: 'Создай видео', files: [file], createdDate: file.createdDate },
    ]);
    await page.goto(`${route}?conversation=101`);
    await expect(
      page.getByText('Видео отклонено модерацией провайдера', { exact: false }).first(),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText('Видео отклонено модерацией провайдера', { exact: false }).first(),
    ).toBeVisible();
    conversation.status = 'LOADING';
    delete conversation.error;
    await page.reload();
    await expect(page.getByRole('button', { name: 'Активные работы: 1' })).toBeVisible();
    await expect(page.getByText('Видео отклонено модерацией провайдера', { exact: false })).toHaveCount(0);
    expect(state.sends).toHaveLength(0);
  });
}

test('content studio explains moderation from the socket and clears it on the next run', async ({ page }) => {
  const state = await mockApi(page);
  const conversation = { ...savedConversation(), status: 'LOADING' as IConversation['status'] };
  state.conversations.push(conversation);
  state.messages.set(conversation.id, [
    { id: 1, role: 'USER', text: 'Создай видео', files: [file], createdDate: file.createdDate },
  ]);
  await page.goto('/chat?conversation=101');
  await expect.poll(() => state.joinedRooms.includes('conversation101')).toBe(true);
  const emit = (name: string, data: unknown) =>
    state.socket!.send(
      '42/gnosisai,' + JSON.stringify(['transportSocketEvent', { uid: crypto.randomUUID(), name, data }]),
    );
  conversation.status = 'ERROR';
  emit('ConversationErroredEvent', {
    id: 101,
    error: {
      code: 'AI_VENDOR_ERROR',
      message: 'AiVendorError',
      details: 'Generated video rejected by content moderation.',
      status: 400,
    },
  });
  await expect(page.getByRole('alert')).toContainText('Видео отклонено модерацией провайдера');
  conversation.status = 'LOADING';
  emit('ConversationChangedEvent', { id: 101, item: { status: 'LOADING' } });
  await expect(page.getByText('Видео отклонено модерацией провайдера', { exact: false })).toHaveCount(0);
  conversation.status = 'ERROR';
  emit('ConversationErroredEvent', {
    id: 101,
    error: { code: 'AI_VENDOR_ERROR', details: 'OpenRouter insufficient funds', status: 400 },
  });
  await expect(page.getByRole('alert')).toContainText('На стороне провайдера исчерпаны средства или лимит');
  await expect(page.getByRole('alert')).toContainText('OpenRouter insufficient funds');
  expect(state.sends).toHaveLength(0);
});

test('advanced editor: select arrows stay inside controls at desktop and mobile widths with long model names', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/image?studio=advanced');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Дополнительные настройки' }).click();
  await page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('#model')!;
    select.selectedOptions[0].text = 'Очень длинное название модели с дополнительным описанием возможностей';
  });
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const aligned = await page.locator('.select-control').evaluateAll((controls) =>
      controls.every((control) => {
        const box = control.getBoundingClientRect();
        const icon = control.querySelector('.select-chevron')!.getBoundingClientRect();
        return (
          icon.right <= box.right - 8 &&
          icon.left >= box.left &&
          Math.abs(icon.top + icon.height / 2 - (box.top + box.height / 2)) < 1
        );
      }),
    );
    expect(aligned).toBe(true);
    const overflow = await page.evaluate(() => ({
      width: innerWidth,
      document: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll('main *')]
        .filter((el) => el.getBoundingClientRect().right > innerWidth)
        .slice(0, 10)
        .map((el) => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right })),
    }));
    expect(overflow.document <= width, JSON.stringify(overflow)).toBe(true);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/studio-controls-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('home model reviews switch tabs, expand examples and open the viewer', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  const review = page.getByRole('region', { name: 'GPT Image 2.5 Sunburst' });
  await review.getByRole('tab', { name: 'Ограничение', exact: true }).click();
  await expect(review.getByRole('tabpanel')).toContainText('пространственная логика');
  await review.getByRole('button', { name: 'Развернуть', exact: true }).click();
  await expect(review.locator('.model-review-frame')).toHaveCount(27);
  await review.locator('.model-review-frame').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('heading')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.82)');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Закрыть' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(review.locator('.model-review-frame').first()).toBeFocused();
});

test('advanced editor: reference survives restoration of a different saved video model', async ({ page }) => {
  const state = await mockApi(page);
  const videoModels = catalog.filter((m) => m.reference.provider === 'OPEN_ROUTER_VIDEO');
  const conversation = savedConversation();
  conversation.options.tools = [
    { uid: 'IMAGE', settings: { model: catalog[0].reference } },
    { uid: 'VIDEO', settings: { model: videoModels[1].reference } },
  ];
  state.conversations.push(conversation);
  state.messages.set(101, [{ id: 1, role: 'ASSISTANT', files: [file], createdDate: file.createdDate }]);
  await page.goto('/image?conversation=101&studio=advanced');
  await page.getByRole('button', { name: 'Оживить', exact: true }).click();
  await expect(page.getByLabel('Модель', { exact: true })).toContainText('Wan');
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  await submit(page, 'Animate the reference', 'video');
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([12]);
});

test('advanced editor: upload attaches a file, removal excludes it from the message', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/image?studio=advanced');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from('test') });
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  await page.getByRole('button', { name: 'Убрать Test result' }).click();
  await submit(page);
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([]);
});

test('advanced editor: upload rejects unsupported format and too many references before any upload', async ({
  page,
}) => {
  await mockApi(page);
  let uploads = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/file' && r.method() === 'POST') uploads++;
  });
  await page.goto('/image?studio=advanced');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('test') });
  await expect(page.getByRole('alert')).toContainText('PNG, JPEG или WebP');
  await page.locator('input[type=file]').setInputFiles(
    Array.from({ length: 5 }, (_, i) => ({
      name: `image${i}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from('test'),
    })),
  );
  await expect(page.getByRole('alert')).toContainText('до 4 референсов');
  expect(uploads).toBe(0);
});

test('advanced editor: a late upload does not attach to a new work', async ({ page }) => {
  await mockApi(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route('**/api/file', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    started = true;
    await pending;
    await route.fulfill({ json: file });
  });
  await page.goto('/image?studio=advanced');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from('test') });
  await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'Новая работа' }).click();
  const finished = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/file' && r.request().method() === 'POST',
  );
  release();
  await finished;
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(page.getByRole('button', { name: /Добавить референс/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toHaveCount(0);
});

test('empty library search explains that no matching files were found', async ({ page }) => {
  await mockApi(page);
  await page.goto('/library');
  await expect(page.getByRole('button', { name: /Test result/ })).toBeVisible();
  await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([]) }));
  await page.getByLabel('Поиск по всем файлам').fill('no-such-file');
  await expect(page.getByText('По вашему запросу ничего не найдено.')).toBeVisible();
});

test('advanced editor: invalid and missing conversations do not show an endless loading indicator', async ({
  page,
}) => {
  await mockApi(page);
  for (const id of ['invalid', '999']) {
    await page.goto(`/image?conversation=${id}&studio=advanced`);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Загружаем рабочую беседу…')).toHaveCount(0);
    await page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ }).fill('Try generation');
    await expect(
      page.getByRole('button', { name: /^(Создать изображение|Собрать изображение)$/, exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Новая работа' }).click();
    await expect(page).toHaveURL(/\/image(?:\?studio=advanced)?$/);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
});

test('every catalog model can create a request with its default settings', async ({ page }) => {
  // This scenario loads and submits every fixture model sequentially.
  test.slow();
  const state = await mockApi(page);
  for (const [index, model] of catalog.entries()) {
    const kind = model.reference.provider === 'OPEN_ROUTER_VIDEO' ? 'video' : 'image';
    await page.goto(`/${kind}`);
    await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
    await chooseModel(page, `${model.reference.provider}:${model.reference.model}`);
    if (model.schema.properties?.task?.required?.includes('fileIds')) {
      await page.getByRole('button', { name: 'Добавить изображение', exact: true }).click();
      await selectLibraryFile(page, 'Test result');
      await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
    }
    await submit(page, `Catalog model ${index}`, kind);
    await expect.poll(() => state.sends.length).toBe(index + 1);
    expect(state.sends[index].settings.tools[0].settings.model).toEqual(model.reference);
  }
  expect(state.forbidden).toEqual([]);
});

test('library pagination, type filter, preview and original link work', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/file?*', async (route) => {
    const url = new URL(route.request().url());
    const index = Number(url.searchParams.get('pageIndex'));
    const conditions = JSON.parse(url.searchParams.get('conditions')!);
    const type = conditions.mime?.value?.startsWith('video/') ? 'VIDEO' : 'IMAGE';
    const item = {
      ...file,
      name: `${type} page ${index}`,
      type,
      ...(type === 'VIDEO' ? { mime: 'video/mp4', path: '/test-video.mp4' } : {}),
    };
    await route.fulfill({ json: { ...pagination([item]), pageIndex: index, pages: 2, total: 25 } });
  });
  await page.goto('/library');
  await page.getByRole('button', { name: /IMAGE page 0/ }).click();
  await openViewerActions(page);
  await expect(page.getByRole('link', { name: 'Открыть оригинал' })).toHaveAttribute(
    'href',
    /gallery-1.jpg$/,
  );
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Далее' }).click();
  await expect(page.getByRole('button', { name: /IMAGE page 1/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Далее' })).toBeDisabled();
  await page.getByRole('button', { name: 'Видео', exact: true }).click();
  await page.getByRole('button', { name: /VIDEO page 0/ }).click();
  await expect(page.getByRole('dialog').locator('video')).toHaveAttribute('controls', '');
  await expect(page.getByRole('button', { name: 'Использовать как референс' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('history and messages request the selected server page', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  await page.route('**/api/conversation?*', async (route) => {
    const index = Number(new URL(route.request().url()).searchParams.get('pageIndex'));
    await route.fulfill({
      json: {
        ...pagination([{ ...savedConversation(), name: `Work page ${index}` }]),
        pages: 2,
        pageIndex: index,
        total: 25,
      },
    });
  });
  await page.route('**/api/conversation/101/message?*', async (route) => {
    const index = Number(new URL(route.request().url()).searchParams.get('pageIndex'));
    await route.fulfill({
      json: {
        ...pagination([
          { id: 1, role: 'ASSISTANT', text: `Messages page ${index}`, createdDate: file.createdDate },
        ]),
        pages: 2,
        pageIndex: index,
        total: 21,
      },
    });
  });
  await page.goto('/history');
  await expect(page.getByText('Work page 0')).toBeVisible();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(page.getByText('Work page 1')).toBeVisible();
  await page.locator('.history-actions summary').click();
  await page.getByRole('link', { name: 'Открыть', exact: true }).click();
  await expect(page.getByText('Messages page 0')).toBeVisible();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(page.getByText('Messages page 1')).toBeVisible();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page.getByText('Messages page 0')).toBeVisible();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(page.getByText('Messages page 1')).toBeVisible();
  await submit(page, 'Continue this work');
  await expect.poll(() => state.sends.length).toBe(1);
  await expect(page.getByText('Messages page 0')).toBeVisible();
});

test('catalog failure is recoverable and prevents generation', async ({ page }) => {
  const state = await mockApi(page);
  let failing = true;
  await page.route('**/api/aimodels?*', (route) =>
    failing ? route.fulfill({ status: 503, json: { message: 'Unavailable' } }) : route.fallback(),
  );
  await page.goto('/image');
  await page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ }).fill('A new idea');
  await expect(
    page.getByRole('button', { name: /^(Создать изображение|Собрать изображение)$/, exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Загрузить снова' })).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Загрузить снова' }).click();
  await submit(page);
  await expect.poll(() => state.tasks.length).toBe(1);
});

test('server errors in library can be retried without losing the session', async ({ page }) => {
  await mockApi(page);
  let failing = true;
  await page.route('**/api/file?*', (route) =>
    failing
      ? route.fulfill({ status: 503, json: { message: 'Storage temporarily unavailable' } })
      : route.fallback(),
  );
  await page.goto('/library');
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось выполнить запрос. Сервис временно недоступен.',
  );
  failing = false;
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('button', { name: /Test result/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Открыть аккаунт' })).toBeVisible();
});

test('account balance refresh uses minor units and logout succeeds locally when server is unavailable', async ({
  page,
}) => {
  await mockApi(page);
  let amount = '1250.50';
  await page.route('**/api/init', (route) =>
    route.fulfill({ json: { user: { id: 7, preferences: { name: 'Anna' } }, balances: { RUB: amount } } }),
  );
  await page.goto('/account');
  await expect(page.locator('.balance-row strong')).toHaveText('12,51');
  amount = '9950';
  await page.getByRole('button', { name: 'Обновить баланс' }).click();
  await expect(page.locator('.balance-row strong')).toHaveText('99,50');
  await page.route('**/api/logout', (route) =>
    route.fulfill({ status: 503, json: { message: 'Unavailable' } }),
  );
  await page.getByRole('button', { name: 'Выйти из студии' }).click();
  await page
    .getByRole('dialog', { name: 'Выйти из аккаунта?' })
    .getByRole('button', { name: 'Выйти', exact: true })
    .click();
  await expect(page).toHaveURL(/sso\.example\.test.*openid-connect\/logout/);
  const state = await page.context().storageState();
  expect(
    state.origins
      .find((o) => o.origin === 'http://127.0.0.1:5173')
      ?.localStorage.some((item) => item.name === 'genfactory.session'),
  ).toBeFalsy();
});

test(
  'valid OAuth callback exchanges the code once and removes it from the URL',
  { tag: '@smoke' },
  async ({ page }) => {
    await mockApi(page, false);
    await page.addInitScript(() =>
      sessionStorage.setItem(
        'genfactory.oauth',
        JSON.stringify({
          state: 'valid-state',
          createdAt: Date.now(),
          redirectUri: `${location.origin}/auth/callback`,
        }),
      ),
    );
    let exchanges = 0;
    await page.route('**/api/login', async (route) => {
      exchanges++;
      expect(route.request().postDataJSON().data).toEqual({
        codeOrToken: 'test-code',
        redirectUri: 'http://127.0.0.1:5173/auth/callback',
      });
      await route.fulfill({ json: { sid: 'new-session' } });
    });
    await page.goto('/auth/callback?state=valid-state&code=test-code');
    await expect(page).toHaveURL(/\/image(?:\?studio=advanced)?$/);
    await expect(page.getByRole('link', { name: 'Открыть аккаунт' })).toBeVisible();
    expect(exchanges).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('genfactory.session'))).toBe('new-session');
  },
);

test('expired OAuth callback and provider denial never exchange a code', async ({ page }) => {
  const state = await mockApi(page, false);
  await page.addInitScript(() =>
    sessionStorage.setItem(
      'genfactory.oauth',
      JSON.stringify({
        state: 'valid-state',
        createdAt: Date.now() - 11 * 60_000,
        redirectUri: `${location.origin}/auth/callback`,
      }),
    ),
  );
  await page.goto('/auth/callback?state=valid-state&code=test-code');
  await expect(page.getByText('Сессия входа истекла. Начните вход заново.')).toBeVisible();
  await page.addInitScript(() =>
    sessionStorage.setItem(
      'genfactory.oauth',
      JSON.stringify({
        state: 'valid-state',
        createdAt: Date.now(),
        redirectUri: `${location.origin}/auth/callback`,
      }),
    ),
  );
  await page.goto('/auth/callback?state=valid-state&error=access_denied');
  await expect(page.getByText('Вход не завершён. Попробуйте ещё раз.')).toBeVisible();
  expect(state.forbidden).toEqual([]);
});

test('empty pages and unknown routes give a usable next action', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([]) }));
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Здесь начинается ваша коллекция' })).toBeVisible();
  await page
    .getByRole('button', { name: /^(Создать изображение|Собрать изображение)$/, exact: true })
    .click();
  await expect(page).toHaveURL(/\/image(?:\?studio=advanced)?$/);
  await navigateLegacyRoute(page, '/history');
  await expect(page.getByRole('heading', { name: 'Пока нет работ' })).toBeVisible();
  await page.goto('/does-not-exist');
  await page.getByRole('link', { name: 'Вернуться в студию' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
});

test('edit-only models explain the required reference and never submit without it', async ({ page }) => {
  const state = await mockApi(page);
  const model = catalog.find((m) => m.reference.model === 'krea/k3-edit')!;
  await page.goto('/image');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await chooseModel(page, `${model.reference.provider}:${model.reference.model}`);
  await expect(page.getByRole('button', { name: 'Модель', exact: true })).toHaveText(modelTitle(model));
  await submit(page, 'Change the image');
  await expect(page.getByRole('alert')).toContainText('Добавьте референсы');
  expect(state.creates).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
});

test('unavailable image and video previews show a readable fallback', async ({ page }) => {
  await mockApi(page);
  await page.route('**/media/gallery-1.jpg', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/library');
  await expect(page.getByRole('img', { name: /^(Изображение|Видео): Test result$/ })).toBeVisible();
  await page.getByRole('button', { name: /Test result/ }).click();
  await expect(
    page.getByRole('dialog').getByRole('img', { name: 'Изображение: Test result', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.route('**/api/file?*', (route) =>
    route.fulfill({
      json: pagination([{ ...file, type: 'VIDEO', mime: 'video/mp4', path: '/missing-audit-video.mp4' }]),
    }),
  );
  await page.route('**/missing-audit-video.mp4', (route) => route.fulfill({ status: 404, body: '' }));
  await page.getByRole('button', { name: 'Видео', exact: true }).click();
  await expect(page.getByRole('img', { name: /^(Изображение|Видео): Test result$/ })).toBeVisible();
});

test('workspace chat defaults to no tools, continues a server conversation and shows plain user text', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/agent?studio=advanced');
  await page.getByLabel('Ваш запрос', { exact: true }).fill('Помоги придумать рекламную идею');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByText('Точный промпт для генерации.', { exact: true })).toBeVisible();
  expect(state.creates[0].options.tools).toEqual([]);
  expect(state.sends[0].text).toContain('[Genfactory:chat]');
  await expect(page.locator('.conversation-text')).toHaveText('Помоги придумать рекламную идею');
  await page.getByLabel('Ваш запрос', { exact: true }).fill('Уточни второй вариант');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(2);
  expect(state.creates).toHaveLength(1);
  expect(state.sends[1].id).toBe(101);
  expect(state.forbidden).toEqual([]);
});

test('workspace Generate Prompt transfers its answer and reference into image generation', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/prompt');
  await page.getByRole('button', { name: 'Добавить изображение или видео', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Test result/ })
    .click();
  await page.locator('#gp-note').fill('Сохрани объект и замени фон');
  await page.getByRole('button', { name: 'Собрать промпт', exact: true }).click();
  await expect(page.getByText('Точный промпт для генерации.', { exact: true })).toBeVisible();
  await expect(page.locator('.img-dock .composer-attachment')).toHaveCount(0);
  expect(state.sends[0].files).toEqual([12]);
  expect(state.sends[0].text).toContain('English');
  await page.locator('.prompt-card').hover();
  await page.getByRole('button', { name: 'В генератор', exact: true }).last().click();
  await expect(page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ })).toHaveValue(
    'Точный промпт для генерации.',
  );
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  expect(state.sends).toHaveLength(1);
  await submit(page, 'Готовый промпт с референсом');
  await expect.poll(() => state.tasks.length).toBe(1);
  expect(state.tasks[0].task.fileIds).toEqual([12]);
});

test('workspace script stays in the same conversation when changing text modes', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/script');
  await page.getByLabel('Ваш запрос', { exact: true }).fill('Реклама кофе, 8 секунд, утро');
  await page.getByRole('button', { name: 'Подготовить сценарий', exact: true }).click();
  await expect(page).toHaveURL(/script\?conversation=101/);
  await expect(page.getByText('Точный промпт для генерации.', { exact: true })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Режим работы' })
    .getByRole('link', { name: 'Обсудить', exact: true })
    .click();
  await expect(page).toHaveURL(/agent\?conversation=101/);
  await expect(page.locator('#agent-draft')).toBeVisible();
  await page.locator('#agent-draft').fill('Измени концовку');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(2);
  expect(state.sends[0].text).toContain('Не запускай генерацию');
  expect(state.creates).toHaveLength(1);
});

test('workspace tools use the existing catalog and preserve conversation attachments on save', async ({
  page,
}) => {
  const state = await mockApi(page);
  const c = { ...savedConversation(), files: [file], options: { model: agent.reference.model, tools: [] } };
  state.conversations.push(c);
  await page.goto('/agent?conversation=101&studio=advanced');
  await page.getByText('Инструменты · 0', { exact: true }).click();
  await page.getByLabel('Поиск в Яндексе', { exact: true }).check();
  await page.getByRole('button', { name: 'Сохранить инструменты' }).click();
  await expect(page.getByText('Инструменты сохранены.')).toBeVisible();
  expect(state.edits[0].files).toEqual([12]);
  expect(state.edits[0].options.tools).toEqual([{ uid: 'YANDEX' }]);
  expect(state.sends).toHaveLength(0);
});

test('advanced editor: workspace brand versions are opt-in, survive reload and enter generation instructions', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/brand');
  await page.getByLabel('Правила оформления').fill('Только зелёный и белый. Никаких надписей.');
  await page.getByRole('button', { name: 'Сохранить версию' }).click();
  await expect(page.getByText('Правила сохранены.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Правила оформления')).toHaveValue(
    'Только зелёный и белый. Никаких надписей.',
  );
  await page.goto('/image?studio=advanced');
  await page.getByLabel('Использовать правила бренда').check();
  await page.getByText('Съёмка и стиль', { exact: true }).click();
  await page.getByLabel('Свет', { exact: true }).fill('Мягкий боковой');
  await submit(page, 'Предметный кадр');
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].text).toContain('Только зелёный и белый');
  expect(state.sends[0].text).toContain('Мягкий боковой');
});

test('advanced editor: workspace custom templates restore prompt model and options', async ({ page }) => {
  await mockApi(page);
  await page.goto('/image?studio=advanced');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ }).fill('Мой предметный кадр');
  await page.getByLabel('Качество', { exact: true }).selectOption('"high"');
  await page.getByText('Сохранить как шаблон', { exact: true }).click();
  await page.getByLabel('Название шаблона').fill('Мой сценарий');
  await page.getByRole('button', { name: 'Сохранить шаблон', exact: true }).click();
  await navigateLegacyRoute(page, '/templates');
  await page.getByRole('button', { name: 'Мои', exact: true }).click();
  await page.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ })).toHaveValue(
    'Мой предметный кадр',
  );
  await expectQuality(page, 'high');
});

test('workspace library picker attaches a reference without leaving the image editor', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/image');
  await page.getByRole('button', { name: 'Добавить изображение', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Test result/ })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await submit(page, 'Use the selected image');
  await expect.poll(() => state.tasks.length).toBe(1);
  expect(state.tasks[0].task.fileIds).toEqual([12]);
});

test('workspace history supports rename favorites server archive and a running filter', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push({ ...savedConversation(), files: [file] });
  await page.goto('/history');
  await page.locator('.history-actions summary').click();
  await page.getByRole('button', { name: 'Переименовать', exact: true }).click();
  await page.getByLabel('Новое название').fill('Новая кампания');
  await page.getByRole('button', { name: 'Сохранить название' }).click();
  await expect(page.getByRole('heading', { name: 'Новая кампания' })).toBeVisible();
  expect(state.edits[0].files).toEqual([12]);
  await page.locator('.history-actions summary').click();
  await page.getByRole('button', { name: 'В избранное', exact: true }).click();
  await page.getByRole('button', { name: 'Избранное', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Новая кампания' })).toBeVisible();
  await page.locator('.history-actions summary').click();
  await page.getByRole('button', { name: 'В архив', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Новая кампания' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Архив', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Новая кампания' })).toBeVisible();
  await page.locator('.history-actions summary').click();
  await page.getByRole('button', { name: 'Вернуть из архива', exact: true }).click();
  const request = page.waitForRequest(
    (r) =>
      new URL(r.url()).pathname === '/api/conversation' &&
      JSON.parse(new URL(r.url()).searchParams.get('conditions') || '{}').status === 'LOADING',
  );
  await page.getByRole('button', { name: 'В работе', exact: true }).click();
  await request;
});

test('workspace video analysis uploads the original and sends VIDEO_RECOGNITION', async ({ page }) => {
  const state = await mockApi(page);
  const video = { ...file, type: 'VIDEO', mime: 'video/mp4', size: 1000, name: 'Видео.mp4' };
  await page.route(
    (url) => url.pathname === '/api/aimodels' && catalogProvider(url) === 'OPEN_ROUTER_TEXT',
    (route) =>
      route.fulfill({
        json: catalogPage([
          {
            reference: { provider: 'OPEN_ROUTER_TEXT', model: 'google/gemini-2.5-pro' },
            capabilities: ['VIDEO_INPUT', 'TEXT_OUTPUT'],
            name: 'Gemini',
            schema: {},
          },
        ]),
      }),
  );
  await page.route('**/api/file', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    state.uploads++;
    return route.fulfill({ json: video });
  });
  await page.route('**/api/file/12', (route) => route.fulfill({ json: video }));
  await page.goto('/agent?studio=advanced');
  await expect(page.getByLabel('Ассистент', { exact: true })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .setInputFiles(new URL('../fixtures/preview.mp4', import.meta.url).pathname);
  await expect(page.getByText('Видео будет проанализировано инструментом «Анализ видео».')).toBeVisible();
  expect(state.uploads).toBe(1);
  await expect(page.locator('.reference')).toHaveCount(1);
  await page.getByLabel('Ваш запрос', { exact: true }).fill('Опиши визуальный стиль');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([12]);
  expect(state.sends[0].settings.tools[0]).toMatchObject({
    uid: 'VIDEO_RECOGNITION',
    settings: { isLockSelection: true, options: { maxTokens: 4096 } },
  });
});

test('workspace lost response reports the error after the new conversation navigation', async ({ page }) => {
  const state = await mockApi(page);
  state.abortAfterAccept = true;
  await page.goto('/agent?studio=advanced');
  await page.getByLabel('Ваш запрос', { exact: true }).fill('Помоги с идеей');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page).toHaveURL(/conversation=101/);
  await expect(page.getByRole('alert')).toContainText('Проверьте историю');
  await expect(page.getByText('Точный промпт для генерации.', { exact: true })).toBeVisible();
  expect(state.sends).toHaveLength(1);
});

test('workspace documents require an appropriate tool and remain file attachments', async ({ page }) => {
  const state = await mockApi(page);
  await page.route('**/api/file', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ json: { ...file, type: 'DOCUMENT', mime: 'application/pdf', name: 'brief.pdf' } })
      : route.fallback(),
  );
  await page.goto('/agent?studio=advanced');
  await expect(page.getByLabel('Ассистент', { exact: true })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'brief.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
  await expect(page.getByRole('button', { name: 'Убрать brief.pdf' })).toBeVisible();
  await page.getByLabel('Ваш запрос', { exact: true }).fill('Прочитай бриф');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Подключите инструмент');
  expect(state.sends).toHaveLength(0);
  await page.getByText('Инструменты · 0', { exact: true }).click();
  await page.getByLabel('Чтение документов', { exact: true }).check();
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.creates[0].options.tools).toEqual([{ uid: 'DOCUMENT_READ' }]);
  expect(state.sends[0].files).toEqual([12]);
});

test('workspace local brand and templates remain isolated between accounts', async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      'genfactory.preferences.v1.7',
      JSON.stringify({
        brand: 'PRIVATE BRAND',
        presets: [
          { id: 'mine', name: 'PRIVATE TEMPLATE', category: 'Мои', kind: 'image', prompt: 'Private prompt' },
        ],
      }),
    ),
  );
  await page.goto('/brand');
  await expect(page.getByLabel('Правила оформления')).toHaveValue('PRIVATE BRAND');
  await page.route('**/api/init', (route) => {
    // An in-flight refresh for the first session must still return its own account.
    if (route.request().headers().authorization !== 'Bearer second-user') return route.fallback();
    return route.fulfill({
      json: { user: { id: 8, preferences: { name: 'Other user' } }, balances: { RUB: '0' } },
    });
  });
  await page.evaluate(() => {
    localStorage.setItem('genfactory.session', 'second-user');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'genfactory.session',
        newValue: 'second-user',
        storageArea: localStorage,
      }),
    );
  });
  await expect(page.getByLabel('Правила оформления')).toHaveValue('');
  await navigateLegacyRoute(page, '/templates');
  await expect(page.getByText('PRIVATE TEMPLATE')).toHaveCount(0);
});

test('advanced editor: persists and restores media drafts with account-owned references', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/image?studio=advanced');
  const modelKey = `${catalog[1].reference.provider}:${catalog[1].reference.model}`;
  await chooseModel(page, modelKey);
  await page.getByLabel('Качество', { exact: true }).selectOption('high');
  await page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ }).fill('Сохранённая идея');
  await page.getByRole('button', { name: 'Из библиотеки', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Test result/ })
    .click();
  await expect(page.getByRole('button', { name: 'Убрать Test result', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('genfactory.draft.v1.7.image'))),
    )
    .toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Восстановить черновик' }).click();
  await expect(page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ })).toHaveValue(
    'Сохранённая идея',
  );
  await expect(page.getByLabel('Модель', { exact: true })).toHaveValue(modelKey);
  await expectQuality(page, 'high');
  await expect(page.getByRole('button', { name: 'Убрать Test result', exact: true })).toBeVisible();
  expect(state.sends).toHaveLength(0);
});

test('restores text draft after navigation without sending a message', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/prompt');
  await page.locator('#gp-note').fill('Черновик промпта');
  await navigateLegacyRoute(page, '/library');
  await page.goto('/prompt');
  await page.getByRole('button', { name: 'Восстановить черновик' }).click();
  await expect(page.locator('#gp-note')).toHaveValue('Черновик промпта');
  expect(state.sends).toHaveLength(0);
});

test('advanced editor: searches models and keeps favorite models after reload', async ({ page }) => {
  await mockApi(page);
  await page.goto('/image?studio=advanced');
  await page.getByRole('button', { name: 'Поиск и избранные модели' }).click();
  await page.getByLabel('Поиск моделей').fill(catalog[0].name);
  await page.getByRole('button', { name: `В избранные: ${catalog[0].name}`, exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Поиск и избранные модели' }).click();
  await page.getByRole('button', { name: 'Избранные', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: catalog[0].name, exact: true }),
  ).toBeVisible();
});

test('favorite models rise to the top across image and content studio without changing selection', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/image');
  const picker = page.getByRole('button', { name: 'Модель', exact: true });
  await expect(picker).toContainText('GPT Image 2');
  await picker.click();
  await page.getByRole('button', { name: 'В избранные: GPT Image 1 Mini', exact: true }).click();
  await expect(page.locator('.image-model-row').first()).toHaveAttribute('aria-label', 'GPT Image 1 Mini');
  await expect(picker).toContainText('GPT Image 2');
  await page.reload();
  await picker.click();
  await expect(page.locator('.image-model-row').first()).toHaveAttribute('aria-label', 'GPT Image 1 Mini');
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Изображение', exact: true }).click();
  await page.locator('.cw-model').click();
  await expect(page.getByRole('option').nth(0)).toHaveAttribute('aria-label', 'Auto');
  await expect(page.getByRole('option').nth(1)).toHaveAttribute('aria-label', 'GPT Image 1 Mini');
  await page.getByRole('button', { name: 'Убрать из избранных: GPT Image 1 Mini', exact: true }).click();
  await expect(page.getByRole('option').nth(1)).toHaveAttribute('aria-label', 'GPT Image 2');
  expect(state.sends).toHaveLength(0);
});

test('imports settings only after review and excludes session from export', async ({ page }) => {
  await mockApi(page);
  await page.goto('/brand');
  const data = {
    format: 'genfactory-settings',
    version: 1,
    brand: 'Новый стиль',
    presets: [],
    favoriteModels: [],
    favoriteTemplates: [],
  };
  await page.getByLabel('Импорт настроек JSON').setInputFiles({
    name: 'settings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.getByRole('button', { name: 'Применить импорт' })).toBeVisible();
  await expect(page.getByLabel('Правила оформления')).toHaveValue('');
  await page.getByRole('button', { name: 'Применить импорт' }).click();
  await page.reload();
  await expect(page.getByLabel('Правила оформления')).toHaveValue('Новый стиль');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт настроек' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('genfactory-settings.json');
  const exported = readFileSync((await download.path())!, 'utf8');
  expect(JSON.parse(exported).brand).toBe('Новый стиль');
  expect(exported).not.toContain('session');
});

test('tracks running jobs and confirms terminal state before notifying', async ({ page }) => {
  const state = await mockApi(page);
  const c = savedConversation();
  c.status = 'LOADING';
  state.conversations.push(c);
  state.messages.set(c.id, [
    { id: 1, role: 'ASSISTANT', files: [file], createdDate: file.createdDate },
    {
      id: 2,
      role: 'USER',
      text: 'Создай видео по исходному кадру',
      files: [{ ...file, id: 82, name: 'Исходный кадр' }],
      createdDate: file.createdDate,
    },
  ]);
  await page.goto('/library');
  await page.getByRole('button', { name: 'Активные работы: 1' }).click();
  await expect(page.getByRole('dialog').getByText('Saved creative work')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Исходный кадр' })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Test result' })).toHaveCount(0);
  c.status = 'ERROR';
  await page.getByRole('button', { name: 'Обновить статусы' }).click();
  await expect(page.getByRole('dialog').getByText('Нет выполняющихся работ.')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByText('Работа завершилась с ошибкой: Saved creative work')).toBeVisible();
});

test('advanced editor: pastes and reorders reference files and preserves order in the request', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/image?studio=advanced');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  for (const [index, name] of ['first.png', 'second.png'].entries()) {
    await page.locator('#prompt').evaluate((element, name) => {
      const data = new DataTransfer();
      data.items.add(new File(['image'], name, { type: 'image/png' }));
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, name);
    await expect(page.locator('.reference-item')).toHaveCount(index + 1);
    await expect(page.getByRole('button', { name: /Добавить референс/ })).toBeEnabled();
  }
  await expect.poll(() => state.uploads).toBe(2);
  await page
    .locator('.reference-item')
    .nth(1)
    .getByRole('button', { name: 'Переместить Test result раньше', exact: true })
    .click();
  await submit(page, 'Use ordered references');
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([13, 12]);
});

test('viewer navigates images and transfers the currently displayed file', async ({ page }) => {
  await mockApi(page);
  const second = { ...file, id: 13, name: 'Second image', path: '/media/gallery-2.jpg' };
  await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([file, second]) }));
  await page.goto('/library');
  await page.getByRole('button', { name: /Test result/ }).click();
  await expect(page.getByLabel('Сравнить с изображением')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Следующий файл' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Предыдущий файл' })).toHaveCount(0);
  await page.getByRole('dialog').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Second image' })).toBeVisible();
  await openViewerActions(page);
  await page.getByRole('button', { name: 'Использовать как референс', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Убрать Second image', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ })).toBeFocused();
});

test('advanced editor: mobile workspace and model browser stay within the viewport', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/image', '/video', '/prompt', '/brand', '/library']) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: 'Открыть аккаунт' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto('/image?studio=advanced');
  await page.getByRole('button', { name: 'Поиск и избранные модели' }).click();
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('advanced editor: repeat restores the exact local run settings and never sends until confirmed', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/image?studio=advanced');
  const key = `${catalog[1].reference.provider}:${catalog[1].reference.model}`;
  await chooseModel(page, key);
  await page.getByLabel('Качество', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Из библиотеки', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Test result/ })
    .click();
  await submit(page, 'Вариант для повторения');
  await expect.poll(() => state.sends.length).toBe(1);
  await page.reload();
  await page.getByText('История вариантов', { exact: true }).click();
  await page.getByRole('button', { name: 'Повторить с изменениями' }).click();
  await expect(page).toHaveURL(/\/image(?:\?studio=advanced)?$/);
  await expect(page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ })).toHaveValue(
    'Вариант для повторения',
  );
  await expect(page.getByLabel('Модель', { exact: true })).toHaveValue(key);
  await expectQuality(page, 'high');
  expect(state.sends).toHaveLength(1);
  expect(state.creates).toHaveLength(1);
  await submit(page, 'Изменённый вариант');
  await expect.poll(() => state.sends.length).toBe(2);
  expect(state.creates).toHaveLength(2);
  expect(state.sends[1].files).toEqual([12]);
});

test('advanced editor: old variants explain unknown settings instead of using conversation defaults as history', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  state.messages.set(101, [
    {
      id: 1,
      role: 'USER',
      text: 'Создай изображение с помощью IMAGE.\nСоздай с нуля, без референсов из предыдущих сообщений.\n\nСтарый запрос',
      files: [],
      createdDate: file.createdDate,
    },
    { id: 2, role: 'ASSISTANT', text: 'Готово', files: [file], createdDate: file.createdDate },
  ]);
  await page.goto('/image?conversation=101&studio=advanced');
  await page.getByText('История вариантов', { exact: true }).click();
  await expect(page.getByText('Исходные модель и настройки неизвестны.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Повторить с изменениями' }).click();
  await expect(page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ })).toHaveValue(
    'Старый запрос',
  );
  await expect(page.getByText(/Исходные параметры запуска неизвестны/)).toBeVisible();
  expect(state.sends).toHaveLength(0);
});

test('advanced editor: expanded editor sections have consistent spacing on desktop and mobile', async ({
  page,
}) => {
  await mockApi(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/image?studio=advanced');
    await page.getByText('Сохранить как шаблон', { exact: true }).click();
    const section = page
      .locator('details')
      .filter({ has: page.getByText('Сохранить как шаблон', { exact: true }) });
    const gap = await section.evaluate((el) => {
      const summary = el.querySelector('summary')!.getBoundingClientRect();
      const label = el.querySelector('label')!.getBoundingClientRect();
      const input = el.querySelector('input')!.getBoundingClientRect();
      const button = el.querySelector('button')!.getBoundingClientRect();
      return { top: label.top - summary.bottom, bottom: button.top - input.bottom };
    });
    expect(gap.top).toBeGreaterThanOrEqual(16);
    expect(gap.bottom).toBeGreaterThanOrEqual(16);
    await page.getByText('Съёмка и стиль', { exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `/tmp/genfactory-sections-${width}.png`, fullPage: true });
  }
});

test('advanced editor: leaving during repeat attachment checks does not navigate back into the editor', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  state.messages.set(101, [
    {
      id: 1,
      role: 'USER',
      text: 'Создай изображение с помощью IMAGE.\nРеференсы (fileIds, порядок важен): 12.\n\nПовтори кадр',
      files: [file],
      createdDate: file.createdDate,
    },
    { id: 2, role: 'ASSISTANT', text: 'Готово', files: [file], createdDate: file.createdDate },
  ]);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route('**/api/file/12', async (route) => {
    requested = true;
    await pending;
    await route.fulfill({ json: file });
  });
  await page.goto('/image?conversation=101&studio=advanced');
  await page.getByText('История вариантов', { exact: true }).click();
  await page.getByRole('button', { name: 'Повторить с изменениями' }).click();
  await expect.poll(() => requested).toBe(true);
  await navigateLegacyRoute(page, '/library');
  release();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole('heading', { name: 'Библиотека', exact: true })).toBeVisible();
  expect(state.sends).toHaveLength(0);
});

test('continuation requires a visible reference choice before any paid request and migrates legacy instructions', async ({
  page,
}) => {
  const state = await mockApi(page);
  const conversation = savedConversation();
  conversation.system =
    'Custom prefix. Если референсы не указаны, создавай с нуля: IMAGE isDrawNew=true, VIDEO fileIds=[]. Custom suffix.';
  state.conversations.push(conversation);
  state.messages.set(101, [{ id: 1, role: 'ASSISTANT', files: [file], createdDate: file.createdDate }]);
  await page.goto('/video?conversation=101&studio=advanced');
  await submit(page, 'Пусть над ней кружит пчела', 'video');
  const dialog = page.getByRole('dialog', { name: 'Использовать предыдущий результат?' });
  await expect(dialog).toBeVisible();
  expect(state.sends).toHaveLength(0);
  expect(state.edits).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Использовать', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  expect(state.sends).toHaveLength(0);
  await page.getByRole('button', { name: 'Создать видео', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([12]);
  expect(state.sends[0].text).not.toContain('Создай с нуля');
  expect(state.edits).toHaveLength(2);
  expect(state.edits.filter((edit) => edit.system)).toHaveLength(1);
  expect(state.edits.find((edit) => edit.options)?.options.tools).toContainEqual(
    expect.objectContaining({ uid: 'VIDEO', settings: expect.objectContaining({ isLockSelection: true }) }),
  );
  expect(state.edits.find((edit) => edit.system).system).toContain('Только при явном выборе');
  expect(state.edits.find((edit) => edit.system).system).toContain('Custom suffix.');
  await expect(page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ })).toHaveValue('');
  await submit(page, 'Теперь добавь свет', 'video');
  await expect.poll(() => state.sends.length).toBe(2);
  expect(state.sends[1].files).toEqual([12]);
  expect(state.edits).toHaveLength(3);
  expect(state.edits.filter((edit) => edit.system)).toHaveLength(1);
});

test('advanced editor: fresh choice and cancelling the chooser do not submit; choosing another uses the library', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  state.messages.set(101, [{ id: 1, role: 'ASSISTANT', files: [file], createdDate: file.createdDate }]);
  await page.goto('/image?conversation=101&studio=advanced');
  await submit(page, 'Другой сюжет');
  const dialog = page.getByRole('dialog', { name: 'Использовать предыдущий результат?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  expect(state.sends).toHaveLength(0);
  await page
    .getByRole('button', { name: /^(Создать изображение|Собрать изображение)$/, exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Выбрать другой' }).click();
  await page
    .getByRole('dialog', { name: 'Библиотека' })
    .getByRole('button', { name: /Test result/ })
    .click();
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  expect(state.sends).toHaveLength(0);
  await page.getByRole('button', { name: 'Создать с нуля', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).not.toBeVisible();
  await page
    .getByRole('button', { name: /^(Создать изображение|Собрать изображение)$/, exact: true })
    .click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([]);
  expect(state.sends[0].text).toContain('Создай с нуля');
});

test('advanced editor: missing reference blocks paid submission instead of silently generating from scratch', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  state.messages.set(101, [{ id: 1, role: 'ASSISTANT', files: [file], createdDate: file.createdDate }]);
  await page.route('**/api/file/12', (route) =>
    route.fulfill({ status: 404, json: { message: 'Reference unavailable' } }),
  );
  await page.goto('/image?conversation=101&studio=advanced');
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await submit(page, 'Добавь свет');
  await expect(page.getByText(/Reference unavailable/)).toBeVisible();
  expect(state.sends).toHaveLength(0);
});

test('reference chooser finds older images beyond the latest page and fits mobile with long names', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  const longFile = { ...file, name: 'birthday_mug_on_sunny_table_1793603048420.png' };
  await page.route('**/api/conversation/101/message?*', (route) => {
    const index = Number(new URL(route.request().url()).searchParams.get('pageIndex'));
    return route.fulfill({
      json: {
        ...pagination([
          {
            id: index + 1,
            role: 'ASSISTANT',
            text: 'Result',
            files: index ? [longFile] : [],
            createdDate: file.createdDate,
          },
        ]),
        pages: 2,
        pageIndex: index,
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/video?conversation=101&studio=advanced');
  await page.getByRole('button', { name: 'Выбрать из беседы', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Использовать предыдущий результат?' });
  await expect(dialog.getByText(longFile.name)).toBeVisible();
  await page.screenshot({ path: 'test-results/reference-choice-mobile.png' });
  await dialog.getByRole('button', { name: 'Использовать', exact: true }).click();
  await expect(page.getByRole('button', { name: `Убрать ${longFile.name}` })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.sends).toHaveLength(0);
});

test('advanced editor: failed legacy instruction update blocks generation and keeps the chosen reference', async ({
  page,
}) => {
  const state = await mockApi(page);
  const conversation = savedConversation();
  conversation.system =
    'Если референсы не указаны, создавай с нуля: IMAGE isDrawNew=true, VIDEO fileIds=[]. ';
  state.conversations.push(conversation);
  state.messages.set(101, [{ id: 1, role: 'ASSISTANT', files: [file], createdDate: file.createdDate }]);
  await page.route('**/api/conversation/101', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, json: { message: 'Instruction update failed' } })
      : route.fallback(),
  );
  await page.goto('/image?conversation=101&studio=advanced');
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await submit(page, 'Добавь свет');
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось выполнить запрос. Сервис временно недоступен.',
  );
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  expect(state.sends).toHaveLength(0);
});

test('a template can start a new work while another conversation request is still pending', async ({
  page,
}) => {
  const state = await mockApi(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let accepted = false;
  await page.route('**/api/conversation/101/message', async (route) => {
    if (route.request().method() === 'POST') {
      accepted = true;
      await pending;
    }
    await route.fallback();
  });
  try {
    await page.goto('/image');
    await submit(page, 'Долгая первая генерация');
    await expect.poll(() => accepted).toBe(true);
    await navigateLegacyRoute(page, '/templates');
    await page.getByRole('button', { name: 'Использовать шаблон', exact: true }).first().click();
    await expect(page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ })).not.toHaveValue('');
    const generate = page.getByRole('button', {
      name: /^(Создать изображение|Собрать изображение)$/,
      exact: true,
    });
    await expect(generate).toBeEnabled();
    expect(state.sends).toHaveLength(0);
    await generate.click();
    await expect.poll(() => state.sends.length).toBe(1);
    expect(state.sends[0].id).toBe(102);
  } finally {
    release();
  }
});

test(
  'balance history shows exact costs and sends numeric date filters with owner scope and pagination',
  { tag: '@smoke' },
  async ({ page }) => {
    await mockApi(page);
    const requests: { page: number; conditions: any }[] = [];
    await page.route('**/api/paymentTransaction?*', (route) => {
      const url = new URL(route.request().url());
      const conditions = JSON.parse(url.searchParams.get('conditions')!);
      const index = Number(url.searchParams.get('pageIndex'));
      requests.push({ page: index, conditions });
      return route.fulfill({
        json: {
          ...pagination([
            {
              id: 242 + index,
              userId: 7,
              type: 'TASK_PURCHASE',
              debet: 'CO-00',
              credit: 'PR-00',
              coinId: 'RUB',
              amount: '965.16',
              createdDate: file.createdDate,
              activatedDate: file.createdDate,
              details: {
                model: 'OPEN_AI_CONVERSATION',
                source: { type: 'CONVERSATION', id: 49 },
                amounts: [{ amount: '0.096516', coinId: 'USD' }],
                rates: [{ from: 'USD', to: 'RUB', value: '100' }],
                consumption: {
                  tools: [
                    {
                      type: 'IMAGE',
                      models: [{ provider: 'OPEN_AI_IMAGE_GPT', model: 'gpt-image-1-mini' }],
                      status: 'FINAL',
                      amounts: [{ amount: '0.08219', coinId: 'USD' }],
                    },
                  ],
                },
              },
            },
          ]),
          pages: 2,
          total: 21,
          pageIndex: index,
        },
      });
    });
    await page.goto('/account');
    const history = page.locator('#balance-history');
    await expect(history.getByText('−9,65 ₽', { exact: true })).toBeVisible();
    await history.getByRole('button', { name: 'Детали операции', exact: true }).click();
    await expect(history.getByText('9,6516 ₽', { exact: true })).toBeVisible();
    await expect(history.getByText('Модель вызова · Изображение', { exact: true })).toBeVisible();
    await expect(history.getByText('GPT Image 1 Mini', { exact: true })).toBeVisible();
    await expect(history.getByText('8,219 ₽', { exact: true })).toBeVisible();
    await expect(history.getByText('1,4326 ₽', { exact: true })).toBeVisible();
    await expect(history.getByRole('link', { name: 'Беседа №49' })).toHaveAttribute(
      'href',
      '/open?conversation=49',
    );
    await history.getByRole('button', { name: 'Следующая страница' }).click();
    await expect.poll(() => requests.at(-1)?.page).toBe(1);
    await history.getByLabel('Период', { exact: true }).selectOption('7');
    await expect.poll(() => requests.at(-1)?.page).toBe(0);
    await expect.poll(() => typeof requests.at(-1)?.conditions.createdDate?.value).toBe('number');
    expect(requests.at(-1)!.conditions.createdDate.value).toBeGreaterThan(Date.now() - 8 * 86400000);
    expect(requests.every((r) => r.conditions.userId === 7)).toBe(true);
    await history.getByLabel('Операции', { exact: true }).selectOption('expense');
    await expect.poll(() => requests.at(-1)?.conditions.credit).toBe('PR-00');
    await expect(history.getByLabel('Валюта', { exact: true })).toHaveCount(0);
    await expect.poll(() => requests.at(-1)?.conditions.coinId).toBe('RUB');
  },
);

test('balance history rejects foreign or non-personal transactions and recovers from errors', async ({
  page,
}) => {
  await mockApi(page);
  let foreign = true;
  await page.route('**/api/paymentTransaction?*', (route) =>
    route.fulfill({
      json: pagination(
        foreign
          ? [
              {
                id: 99,
                userId: 8,
                type: 'PURCHASE',
                debet: 'PR-00',
                credit: 'CO-00',
                coinId: 'RUB',
                amount: '100',
                createdDate: file.createdDate,
              },
            ]
          : [],
      ),
    }),
  );
  await page.goto('/account');
  await expect(page.getByText(/Сервер вернул операции другого счёта/)).toBeVisible();
  await expect(page.locator('.transaction-row')).toHaveCount(0);
  foreign = false;
  await page.getByRole('button', { name: 'Повторить загрузку истории' }).click();
  await expect(page.getByText('Операций по выбранным условиям пока нет.')).toBeVisible();
});

test('history cards keep readable spacing and fit mobile during rename', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push({
    ...savedConversation(),
    name: 'Очень длинное название работы с чашкой и праздничной надписью',
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/history');
    const card = page.locator('.history-card');
    await expect(card).toBeVisible();
    await expect(page.getByRole('heading', { name: 'История', exact: true })).toHaveCount(0);
    await expect(page.getByText(/ПУТЬ ОТ ИДЕИ|Ваши беседы сохраняются|Беседа сохранена/)).toHaveCount(0);
    await card.locator('.history-actions summary').click();
    await card.getByRole('button', { name: 'Переименовать' }).click();
    await expect(card.getByLabel('Новое название')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/history-release-${width}.png`, fullPage: true });
  }
});

test(
  'logout confirmation can be dismissed without ending the session',
  { tag: '@smoke' },
  async ({ page }) => {
    await mockApi(page);
    let requests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/logout') requests++;
    });
    await page.goto('/account');
    const trigger = page.getByRole('button', { name: 'Выйти из студии' });
    const dialog = page.getByRole('dialog', { name: 'Выйти из аккаунта?' });
    await trigger.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await trigger.click();
    await dialog.getByRole('button', { name: 'Закрыть' }).click();
    await expect(dialog).toHaveCount(0);
    expect(requests).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('genfactory.session'))).toBe('test-session');
    await expect(page).toHaveURL(/\/account$/);
  },
);

for (const withIdToken of [true, false]) {
  test(
    `logout ends Keycloak SSO ${withIdToken ? 'with ID token' : 'for a legacy session without ID token'}`,
    { tag: '@smoke' },
    async ({ page }) => {
      await mockApi(page);
      await page.goto('/account');
      if (withIdToken)
        await page.evaluate(() => sessionStorage.setItem('genfactory.idToken', 'test-id-token'));
      const logout = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/logout');
      await page.getByRole('button', { name: 'Выйти из студии' }).click();
      await page
        .getByRole('dialog', { name: 'Выйти из аккаунта?' })
        .getByRole('button', { name: 'Выйти', exact: true })
        .click();
      expect((await logout).headers()['authorization']).toBe('Bearer test-session');
      await expect(page).toHaveURL(/sso\.example\.test.*openid-connect\/logout/);
      const url = new URL(page.url());
      expect(url.searchParams.get('client_id')).toBe('gnosis');
      expect(url.searchParams.get('post_logout_redirect_uri')).toBe('http://127.0.0.1:5173/account');
      expect(url.searchParams.get('id_token_hint')).toBe(withIdToken ? 'test-id-token' : null);
      const state = await page.context().storageState();
      expect(
        state.origins
          .find((o) => o.origin === 'http://127.0.0.1:5173')
          ?.localStorage.some((item) => item.name === 'genfactory.session'),
      ).toBeFalsy();
    },
  );
}

test('ready previews are thumbnails while the dialog and download keep the original', async ({ page }) => {
  await mockApi(page);
  const item = {
    ...file,
    preview: {
      image: {
        status: 'READY',
        url: '/media/gallery-2.jpg',
        mime: 'image/webp',
        width: 768,
        height: 512,
        size: 100,
      },
    },
  };
  await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([item]) }));
  await page.route('**/api/file/' + file.id, (route) => route.fulfill({ json: item }));
  await page.goto('/library');
  const card = page.getByRole('button', { name: new RegExp(file.name) }).first();
  await expect(card.locator('img')).toHaveAttribute('src', /gallery-2.jpg$/);
  await card.click();
  await expect(page.getByRole('dialog').locator('.preview-status')).toHaveCount(0);
  await expect(page.getByRole('dialog').locator('img')).toHaveAttribute('src', /gallery-1.jpg$/);
  await openViewerActions(page);
  await expect(page.getByRole('link', { name: 'Открыть оригинал' })).toHaveAttribute(
    'href',
    /gallery-1.jpg$/,
  );
});

test('an existing file can queue a preview and socket displays completion', async ({ page }) => {
  const state = await mockApi(page);
  let started = false;
  const ready = { image: { status: 'READY', url: '/media/gallery-2.jpg' } };
  await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([file]) }));
  await page.route('**/api/file/' + file.id, (route) =>
    route.fulfill({ json: { ...file, ...(started ? { preview: ready } : {}) } }),
  );
  await page.route('**/api/file/' + file.id + '/preview', (route) => {
    expect(route.request().method()).toBe('POST');
    started = true;
    return route.fulfill({ json: { image: { status: 'PENDING' } } });
  });
  await page.goto('/library');
  await page
    .getByRole('button', { name: new RegExp(file.name) })
    .first()
    .click();
  await openViewerActions(page);
  await page.getByRole('button', { name: 'Создать превью', exact: true }).click();
  await expect(page.getByText('Превью создаётся…')).toBeVisible();
  state.socket!.send(
    '42/gnosisai,' +
      JSON.stringify([
        'transportSocketEvent',
        { uid: crypto.randomUUID(), name: 'FilePreviewChangedEvent', data: { id: file.id } },
      ]),
  );
  await expect(page.getByRole('dialog').locator('.preview-status')).toHaveCount(0, { timeout: 10000 });
});

test('an unavailable preview and original settle on a fallback without repeated requests', async ({
  page,
}) => {
  await mockApi(page);
  let previewRequests = 0;
  let originalRequests = 0;
  await page.route('**/broken-preview.webp', (route) => {
    previewRequests++;
    return route.abort();
  });
  await page.route('**/broken-original.png', (route) => {
    originalRequests++;
    return route.abort();
  });
  await page.route('**/api/file?*', (route) =>
    route.fulfill({
      json: pagination([
        {
          ...file,
          path: '/broken-original.png',
          preview: { image: { status: 'READY', url: '/broken-preview.webp' } },
        },
      ]),
    }),
  );
  await page.goto('/library');
  await expect(page.getByRole('img', { name: /^(Изображение|Видео): Test result$/ })).toBeVisible();
  expect(previewRequests).toBe(1);
  expect(originalRequests).toBe(1);
});

test('idle connected pages do not poll and a user-room event refreshes active jobs', async ({ page }) => {
  const state = await mockApi(page);
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes('/api/'))
      requests.push(new URL(request.url()).pathname);
  });
  await page.goto('/library');
  await expect(page.getByRole('button', { name: 'Активные работы: 0' })).toBeVisible();
  await page.waitForTimeout(500); // initial load and connection reconciliation
  await page.clock.install();
  const before = requests.length;
  await page.clock.runFor(12000);
  expect(requests.length).toBe(before);
  state.conversations.push({ ...savedConversation(), status: 'LOADING' });
  state.socket!.send(
    '42/gnosisai,' +
      JSON.stringify([
        'transportSocketEvent',
        {
          uid: crypto.randomUUID(),
          name: 'ConversationChangedEvent',
          data: { id: 101, item: { status: 'LOADING' } },
        },
      ]),
  );
  await page.clock.runFor(200);
  await expect(page.getByRole('button', { name: 'Активные работы: 1' })).toBeVisible();
});

test('advanced editor: edit action focuses the prompt without sending another generation', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  state.messages.set(101, [{ id: 1, role: 'ASSISTANT', files: [file], createdDate: file.createdDate }]);
  await page.goto('/image?conversation=101&studio=advanced');
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  expect(state.sends).toHaveLength(0);
});

test('history displays ready covers and refreshes pending covers from socket', async ({ page }) => {
  const state = await mockApi(page);
  const conversation = savedConversation();
  conversation.preview = { image: { status: 'PROCESSING' } };
  state.conversations.push(conversation, { ...savedConversation(102), name: 'Old work' });
  await page.goto('/history');
  await expect(page.getByText('Создаётся…', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Изображение: Old work', exact: true })).toBeVisible();
  await expect.poll(() => !!state.socket).toBeTruthy();
  conversation.preview = { image: { status: 'READY', url: '/media/gallery-1.jpg' } };
  state.socket!.send(
    '42/gnosisai,' +
      JSON.stringify([
        'transportSocketEvent',
        {
          name: 'FilePreviewChangedEvent',
          uid: crypto.randomUUID(),
          data: { id: 12 },
        },
      ]),
  );
  await expect(page.getByAltText('Превью: Saved creative work')).toBeVisible();
  await expect(page.locator('.history-cover img').first()).toBeVisible();
});

test('socket reconnect restores the conversation room', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  await page.goto('/image?conversation=101');
  await expect
    .poll(() => state.joinedRooms.filter((room) => room === 'conversation101').length)
    .toBeGreaterThan(0);
  const joinsBeforeReconnect = state.joinedRooms.length;
  const previous = state.socket!;
  previous.close();
  await expect.poll(() => state.socket !== previous, { timeout: 15000 }).toBeTruthy();
  await expect
    .poll(() => state.joinedRooms.filter((room) => room === 'conversation101').length, { timeout: 15000 })
    .toBeGreaterThan(joinsBeforeReconnect);
  await expect(
    page.getByRole('button', { name: /^(Создать изображение|Собрать изображение)$/, exact: true }),
  ).toBeVisible();
});

test('history broken video poster falls back', async ({ page }) => {
  const state = await mockApi(page);
  const conversation = savedConversation();
  conversation.preview = {
    image: { status: 'READY', url: '/missing-history-poster.webp' },
    video: { status: 'READY', url: '/test-video.mp4' },
  };
  state.conversations.push(conversation);
  await page.route('**/missing-history-poster.webp', (route) => route.fulfill({ status: 404 }));
  await page.goto('/history');
  const cover = page.locator('.history-cover');
  await expect(cover.getByText('Недоступно')).toBeVisible();
});

test('file browser navigates folders, edits metadata, moves to root and confirms deletion', async ({
  page,
}) => {
  await mockApi(page);
  const folder = {
    ...file,
    id: 80,
    uid: 'folder-80',
    name: 'Project folder',
    type: 'DIRECTORY',
    directory: null,
  };
  let items: any[] = [folder, { ...file, directory: folder.uid }];
  const writes: any[] = [];
  await page.route('**/api/file?*', (route) => {
    const conditions = JSON.parse(new URL(route.request().url()).searchParams.get('conditions')!);
    const directory = typeof conditions.directory === 'string' ? conditions.directory : null;
    return route.fulfill({ json: pagination(items.filter((f) => (f.directory || null) === directory)) });
  });
  await page.route('**/api/file/12', async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      const changes = route.request().postDataJSON();
      writes.push(changes);
      items = items.map((f) => (f.id === 12 ? { ...f, ...changes } : f));
    }
    if (method === 'DELETE') {
      items = items.filter((f) => f.id !== 12);
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({ json: items.find((f) => f.id === 12) });
  });
  await page.goto('/library');
  await page.getByRole('button', { name: /^Project folder Папка(?:\s|$)/ }).click();
  await page.locator('.file-actions summary').click();
  await page.getByRole('button', { name: 'Название и теги', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Updated material');
  await page.getByLabel('Теги через запятую').fill('campaign, campaign, ready');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('button', { name: /Updated material/ })).toBeVisible();
  expect(writes[0]).toEqual({ name: 'Updated material', tags: ['campaign', 'ready'] });
  await page.locator('.file-actions summary').click();
  await page.getByRole('button', { name: 'Переместить', exact: true }).click();
  await page.getByRole('button', { name: 'Переместить сюда', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes[1]).toEqual({ directory: null });
  await page.getByRole('button', { name: 'Корень библиотеки', exact: true }).click();
  const entry = page.locator('.file-entry').filter({ hasText: 'Updated material' });
  await entry.locator('summary').click();
  await entry.getByRole('button', { name: 'Удалить', exact: true }).click();
  expect(items.some((f) => f.id === 12)).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(entry).toHaveCount(0);
});

test('library picker resolves an alias to the original and rejects a broken alias', async ({ page }) => {
  await mockApi(page);
  const alias = { ...file, id: 90, name: 'Reference alias', type: 'LINK', linkTo: file.id };
  await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([alias]) }));
  await page.goto('/image');
  await page.getByRole('button', { name: 'Добавить изображение', exact: true }).click();
  await page.getByRole('button', { name: /Reference alias/ }).click();
  await expect(page.getByRole('button', { name: `Убрать ${file.name}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Убрать ${file.name}`, exact: true }).click();
  await page.route('**/api/file/12', (route) =>
    route.fulfill({ status: 404, json: { message: 'Файл удалён' } }),
  );
  await page.getByRole('button', { name: 'Добавить изображение', exact: true }).click();
  await page.getByRole('button', { name: /Reference alias/ }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Файл удалён');
  await expect(page.getByRole('button', { name: `Убрать ${file.name}`, exact: true })).toHaveCount(0);
});

test('file search is server-side across folders and handles an empty result', async ({ page }) => {
  await mockApi(page);
  const queries: any[] = [];
  await page.route('**/api/file?*', (route) => {
    const conditions = JSON.parse(new URL(route.request().url()).searchParams.get('conditions')!);
    queries.push(conditions);
    return route.fulfill({ json: pagination(conditions.name ? [] : [file]) });
  });
  await page.goto('/library');
  await page.getByLabel('Поиск по всем файлам').fill('missing');
  await expect(page.getByText('По вашему запросу ничего не найдено.')).toBeVisible();
  expect(queries.at(-1)).toEqual({ name: { condition: 'CONTAINS', type: 'STRING', value: '%missing%' } });
});

test('advanced editor: new conversation carries result folder and tags without changing reference IDs', async ({
  page,
}) => {
  const state = await mockApi(page);
  const folder = { ...file, id: 80, uid: 'results-folder', name: 'Campaign results', type: 'DIRECTORY' };
  await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([folder]) }));
  await page.goto('/image?studio=advanced');
  await page.getByText('Куда сохранять результаты', { exact: true }).click();
  await page.getByRole('button', { name: 'Папка результатов', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Campaign results Папка(?:\s|$)/ })
    .click();
  await page.getByRole('button', { name: 'Сохранять в эту папку', exact: true }).click();
  await page.getByLabel('Теги результатов через запятую').fill('catalog,summer');
  expect(state.creates).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
  await submit(page, 'Draw a product');
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.creates[0].fileOutput).toEqual({ directory: 'results-folder', tags: ['catalog', 'summer'] });
  expect(state.sends[0].files).toEqual([]);
});

test('thumbnail actions float above the card and close with Escape without opening the viewer', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/library');
  const entry = page.locator('.file-entry').first();
  const initial = await entry.boundingBox();
  await entry.locator('summary').click();
  await expect(entry.getByRole('button', { name: 'Название и теги', exact: true })).toBeVisible();
  expect((await entry.boundingBox())!.height).toBeCloseTo(initial!.height, 1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(entry.locator('details')).not.toHaveAttribute('open');
  await entry.locator('summary').click();
  await page.getByRole('textbox', { name: 'Поиск по всем файлам', exact: true }).click();
  await expect(entry.locator('details')).not.toHaveAttribute('open');
});

test('tag chips and suggestions filter the entire library with explicit all or any matching', async ({
  page,
}) => {
  await mockApi(page);
  const conditions: any[] = [];
  const tagConditions: any[] = [];
  await page.route('**/api/file?*', (route) => {
    conditions.push(JSON.parse(new URL(route.request().url()).searchParams.get('conditions')!));
    return route.fulfill({ json: pagination([{ ...file, tags: ['Catalog'] }]) });
  });
  await page.route('**/api/fileTag?*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.has('search')).toBe(false);
    tagConditions.push(JSON.parse(query.get('conditions')!));
    return route.fulfill({
      json: pagination([
        { tag: 'catalog', count: 5 },
        { tag: 'summer', count: 2 },
      ]),
    });
  });
  await page.goto('/library');
  await page.getByRole('button', { name: 'Файлы с тегом Catalog', exact: true }).click();
  await expect.poll(() => conditions.at(-1)?.tags?.condition).toBe('INCLUDES_ALL');
  expect(conditions.at(-1).directory).toBeUndefined();
  expect(conditions.at(-1).tags.value).toEqual(['catalog']);
  await page.getByText('Фильтр по тегам (1)', { exact: true }).click();
  await expect.poll(() => tagConditions.at(-1)).toEqual({});
  await page.getByLabel('Найти тег', { exact: true }).fill('A%_\\');
  await expect
    .poll(() => tagConditions.at(-1))
    .toEqual({
      tag: { condition: 'CONTAINS', value: 'A\\%\\_\\\\%' },
    });
  await page.getByRole('button', { name: 'summer 2', exact: true }).click();
  await page.getByLabel('Совпадение тегов', { exact: true }).selectOption('any');
  await expect.poll(() => conditions.at(-1)?.tags?.condition).toBe('INCLUDES_ONE_OF');
  expect(conditions.at(-1).tags.value).toEqual(['catalog', 'summer']);
  await page.getByRole('button', { name: 'Сбросить теги', exact: true }).click();
  await expect.poll(() => conditions.at(-1)?.tags).toBeUndefined();
  expect(conditions.at(-1).directory.condition).toBe('NULL');
});

test('file viewer centers image and video and keeps actions in an overlay menu at both viewport sizes', async ({
  page,
}) => {
  await mockApi(page);
  let item = { ...file };
  await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([item]) }));
  await page.route('**/api/file/12', (route) => route.fulfill({ json: item }));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const type of ['IMAGE', 'VIDEO']) {
      item = { ...file, type, ...(type === 'VIDEO' ? { mime: 'video/mp4', path: '/test-video.mp4' } : {}) };
      await page.goto('/library');
      await page
        .getByRole('button', { name: /Test result/ })
        .first()
        .click();
      const dialog = page.getByRole('dialog');
      const media = dialog.locator(type === 'IMAGE' ? '.media-preview img' : '.media-preview video');
      await expect
        .poll(() =>
          media.evaluate((el) =>
            el instanceof HTMLImageElement
              ? el.complete && el.naturalWidth > 0
              : (el as HTMLVideoElement).readyState >= 1,
          ),
        )
        .toBe(true);
      const box = await dialog.locator('.media-preview').boundingBox();
      const content = await media.boundingBox();
      expect(Math.abs(content!.x + content!.width / 2 - box!.x - box!.width / 2)).toBeLessThan(1);
      expect(Math.abs(content!.y + content!.height / 2 - box!.y - box!.height / 2)).toBeLessThan(1);
      await expect(dialog.getByRole('button', { name: 'Скачать файл', exact: true })).toBeHidden();
      await openViewerActions(page);
      await expect(dialog.getByRole('button', { name: 'Скачать файл', exact: true })).toBeVisible();
      const menu = await dialog.locator('.preview-menu-panel').boundingBox();
      expect(menu!.x).toBeGreaterThanOrEqual(0);
      expect(menu!.x + menu!.width).toBeLessThanOrEqual(width);
      expect((await dialog.locator('.media-preview').boundingBox())!.height).toBeCloseTo(box!.height, 1);
      await page.screenshot({ path: `test-results/viewer-${type}-${width}.png` });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.preview-menu')).not.toHaveAttribute('open');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
  }
});

async function mockAudio(page: Page) {
  const state = await mockApi(page);
  const models: IModelDescription[] = ['TTS', 'STT'].map((kind): IModelDescription => ({
    reference: { provider: `OPEN_ROUTER_${kind}`, model: `test-${kind.toLowerCase()}` },
    name: `Catalog ${kind}`,
    schema: {
      type: 'object',
      required: ['model', 'task', 'options'],
      properties: {
        model: { const: `OPEN_ROUTER_${kind}` },
        task:
          kind === 'TTS'
            ? {
                type: 'object',
                required: ['text'],
                properties: { text: { type: 'string', minLength: 4, maxLength: 100 } },
              }
            : { type: 'object', required: ['file'], properties: { file: { type: 'integer', minimum: 1 } } },
        options: {
          type: 'object',
          required: ['model'],
          properties: {
            model: { const: `test-${kind.toLowerCase()}` },
            ...(kind === 'TTS'
              ? {
                  voice: {
                    type: 'string',
                    enum: ['catalog-voice', 'second-voice'],
                    default: 'catalog-voice',
                  },
                  format: { type: 'string', enum: ['mp3', 'flac'], default: 'mp3' },
                }
              : { language: { type: 'string', minLength: 2 } }),
          },
        },
      },
    },
  }));
  await page.route('**/api/aimodel/OPEN_ROUTER_CONVERSATION', (route) =>
    route.fulfill({
      json: { tools: ['TTS', 'STT'].map((uid) => ({ uid, providers: [`OPEN_ROUTER_${uid}`] })) },
    }),
  );
  await page.route(
    (url) =>
      url.pathname === '/api/aimodels' &&
      ['OPEN_ROUTER_TTS', 'OPEN_ROUTER_STT'].includes(catalogProvider(url) || ''),
    (route) =>
      route.fulfill({
        json: catalogPage(
          models.filter((m) => m.reference.provider === catalogProvider(route.request().url())),
        ),
      }),
  );
  return state;
}

test('audio TTS uses catalog settings, validates text, and restores saved preferences', async ({ page }) => {
  const state = await mockAudio(page);
  await page.goto('/audio');
  await expect(page.getByLabel('Голос', { exact: true })).toHaveValue('"catalog-voice"');
  await page.getByLabel('Текст для озвучки', { exact: true }).fill('a'.repeat(101));
  await page.getByRole('button', { name: 'Озвучить текст', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('100');
  expect(state.sends).toHaveLength(0);
  await page.getByLabel('Текст для озвучки', { exact: true }).fill('Точный текст для озвучки.');
  await page.getByLabel('Голос', { exact: true }).selectOption('"second-voice"');
  await page.getByLabel('Формат файла', { exact: true }).selectOption('"flac"');
  await page.getByRole('button', { name: 'Озвучить текст', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.creates[0].options.tools[0]).toMatchObject({
    uid: 'TTS',
    settings: {
      isLockSelection: true,
      model: { provider: 'OPEN_ROUTER_TTS' },
      options: { voice: 'second-voice', format: 'flac' },
    },
  });
  expect(state.creates[0].options.tools[0].settings.options).not.toHaveProperty('model');
  expect(state.sends[0].settings.tools[0].settings.options).not.toHaveProperty('model');
  expect(state.sends[0].text).toContain('Точный текст для озвучки.');
  await expect(page).toHaveURL(/audio\?mode=tts&conversation=101/);
  await page.reload();
  await expect(page.getByLabel('Голос', { exact: true })).toHaveValue('"second-voice"');
  await expect(page.getByLabel('Формат файла', { exact: true })).toHaveValue('"flac"');
  expect(state.forbidden).toEqual([]);
});

test('audio STT takes the exact video from the file menu and saves transcription in the same conversation', async ({
  page,
}) => {
  const state = await mockAudio(page);
  const video = { ...file, type: 'VIDEO', mime: 'video/mp4', path: '/test-video.mp4' };
  await page.route('**/api/file?**', (route) => route.fulfill({ json: pagination([video]) }));
  await page.route('**/api/file/12', (route) => route.fulfill({ json: video }));
  await page.goto('/library');
  await page.locator('.library-card').filter({ hasText: 'Test result' }).first().click();
  await openViewerActions(page);
  await page.getByRole('button', { name: 'Расшифровать', exact: true }).click();
  await expect(page).toHaveURL(/audio\?mode=stt/);
  await page.getByLabel('Язык (код, например ru)').fill('ru');
  await page.getByRole('button', { name: 'Расшифровать файл' }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  await expect(page.locator('.reference-list .composer-attachment')).toHaveCount(0);
  expect(state.sends[0].files).toEqual([12]);
  expect(state.sends[0].text).toContain('fileId=12');
  expect(state.sends[0].text).toContain('isFile=true');
  expect(state.sends[0].settings.tools[0]).toMatchObject({
    uid: 'STT',
    settings: { isLockSelection: true, options: { language: 'ru' } },
  });
  await expect(page).toHaveURL(/audio\?mode=stt&conversation=101/);
  await page.getByRole('link', { name: 'Озвучить', exact: true }).click();
  await page.getByLabel('Текст для озвучки', { exact: true }).fill('Проверка второй операции.');
  await page.getByRole('button', { name: 'Озвучить текст', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(2);
  expect(state.creates).toHaveLength(1);
  expect(state.edits.at(-1).options.tools.map((t: any) => t.uid)).toEqual(['STT', 'TTS']);
});

test('audio editor fits mobile and hands text off without automatically spending', async ({ page }) => {
  const state = await mockAudio(page);
  state.conversations.push(savedConversation());
  state.messages.set(101, [
    { id: 5, role: 'ASSISTANT', text: 'Текст из ответа.', createdDate: file.createdDate },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/agent?conversation=101&studio=advanced');
  await page.getByRole('button', { name: 'Озвучить', exact: true }).click();
  await expect(page.getByLabel('Текст для озвучки', { exact: true })).toHaveValue('Текст из ответа.');
  await expect(page.getByLabel('Голос', { exact: true })).toBeVisible();
  expect(state.sends).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/audio-mobile.png', fullPage: true });
});

test('audio restores a running job and receives the result over the socket without resending', async ({
  page,
}) => {
  const state = await mockAudio(page);
  await page.route('**/test-audio.wav', (route) =>
    route.fulfill({
      contentType: 'audio/wav',
      body: readFileSync(new URL('../fixtures/audio.wav', import.meta.url)),
    }),
  );
  state.conversations.push({
    ...savedConversation(),
    status: 'LOADING',
    tags: ['genfactory', 'audio', 'tts'],
    options: {
      model: agent.reference.model,
      tools: [
        {
          uid: 'TTS',
          settings: {
            model: { provider: 'TEST_TTS', model: 'test-tts' },
            options: { voice: 'catalog-voice' },
          },
        },
      ],
    },
  });
  await page.goto('/audio?mode=tts&conversation=101');
  await expect(page.getByRole('button', { name: 'Ассистент работает…', exact: true })).toBeDisabled();
  state.conversations[0].status = 'LOADED';
  state.messages.set(101, [
    {
      id: 1,
      role: 'ASSISTANT',
      text: 'Озвучка получена по сокету.',
      files: [{ ...file, type: 'AUDIO', mime: 'audio/wav', path: '/test-audio.wav', name: 'Озвучка.mp3' }],
      createdDate: file.createdDate,
    },
  ]);
  await expect.poll(() => state.joinedRooms.includes('conversation101')).toBe(true);
  state.socket!.send(
    '42/gnosisai,' +
      JSON.stringify([
        'transportSocketEvent',
        {
          uid: crypto.randomUUID(),
          name: 'ConversationChangedEvent',
          data: { id: 101, item: { status: 'LOADED' } },
        },
      ]),
  );
  await expect(page.getByText('Озвучка получена по сокету.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть Озвучка.mp3' }).click();
  await expect(page.getByRole('dialog').locator('audio')).toBeVisible();
  expect(state.sends).toHaveLength(0);
});

test('audio keeps an accepted failed request in history without an automatic paid retry', async ({
  page,
}) => {
  const state = await mockAudio(page);
  state.abortAfterAccept = true;
  await page.goto('/audio');
  await page.getByLabel('Текст для озвучки', { exact: true }).fill('Не повторять автоматически.');
  await page.getByRole('button', { name: 'Озвучить текст', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Проверьте историю');
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(2);
  expect(state.sends).toHaveLength(1);
});

test('audio transcript opens as plain text and transfers the full content without executing a tool', async ({
  page,
}) => {
  const state = await mockAudio(page);
  const transcript = 'Полная расшифровка.\n<script>Только текст</script>\nПоследняя строка.';
  const document = {
    ...file,
    type: 'DOCUMENT',
    mime: 'text/plain',
    name: 'Расшифровка.txt',
    path: '/transcript.txt',
  };
  await page.route('**/api/file/12/text', (route) => route.fulfill({ json: { text: transcript } }));
  await page.route('**/transcript.txt', (route) => route.abort());
  await page.route('**/api/file?**', (route) => route.fulfill({ json: pagination([document]) }));
  await page.route('**/api/file/12', (route) => route.fulfill({ json: document }));
  await page.goto('/library');
  await page.locator('.library-card').filter({ hasText: 'Расшифровка.txt' }).click();
  await expect(page.locator('.file-text-preview')).toHaveText(transcript);
  await expect(page.locator('.file-text-preview script')).toHaveCount(0);
  await openViewerActions(page);
  await page.getByRole('button', { name: 'Озвучить текст', exact: true }).click();
  await expect(page.getByLabel('Текст для озвучки', { exact: true })).toHaveValue(transcript);
  expect(state.sends).toHaveLength(0);
});

test('audio downloads original bytes through the authorized API when storage blocks browser reads', async ({
  page,
}) => {
  await mockAudio(page);
  const bytes = readFileSync(new URL('../fixtures/audio.wav', import.meta.url));
  const audio = {
    ...file,
    type: 'AUDIO',
    mime: 'audio/wav',
    name: 'Озвучка.wav',
    path: 'https://storage.example.test/audio.wav',
  };
  await page.route('https://storage.example.test/**', (route) => route.abort());
  await page.route('**/api/file?**', (route) => route.fulfill({ json: pagination([audio]) }));
  await page.route('**/api/file/12', (route) => route.fulfill({ json: audio }));
  await page.route('**/api/file/12/content', (route) => {
    expect(route.request().headers().authorization).toBe('Bearer test-session');
    return route.fulfill({ contentType: 'audio/wav', body: bytes });
  });
  await page.goto('/library');
  await page.locator('.library-card').filter({ hasText: audio.name }).click();
  await openViewerActions(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать файл', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(audio.name);
  expect(readFileSync((await download.path())!)).toEqual(bytes);
});

test('file tags stay inside cards and filters while audio and documents have consistent placeholders', async ({
  page,
}) => {
  await mockApi(page);
  const longTag = 'ОченьДлинныйТегБезПробелов'.repeat(2);
  const items = [
    { ...file, tags: Array.from({ length: 32 }, (_, i) => `${longTag}${i}`) },
    { ...file, id: 13, type: 'AUDIO', mime: 'audio/mpeg', name: 'Озвучка.mp3', tags: ['audio-check'] },
    { ...file, id: 14, type: 'DOCUMENT', mime: 'text/plain', name: 'Расшифровка.txt', tags: [] },
  ];
  await page.route('**/api/file?**', (route) => route.fulfill({ json: pagination(items) }));
  await page.route('**/api/fileTag?**', (route) =>
    route.fulfill({ json: pagination([{ tag: longTag, count: 3 }]) }),
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/library');
    await expect(page.locator('.file-placeholder-audio')).toHaveCount(1);
    await expect(page.locator('.file-placeholder-document')).toHaveCount(1);
    const media = await page.locator('.library-media').evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { top: box.top, height: box.height };
      }),
    );
    expect(media[0].top).toBeCloseTo(media[1].top, 1);
    expect(media[0].height).toBe(media[1].height);
    const tags = page.locator('.file-tag-chips').first();
    expect((await tags.boundingBox())!.height).toBeLessThanOrEqual(78);
    expect(await tags.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const bounds = await page
      .locator('.file-tag-chips .chip')
      .evaluateAll((nodes) =>
        nodes.every(
          (node) =>
            node.getBoundingClientRect().right <= node.closest('.file-entry')!.getBoundingClientRect().right,
        ),
      );
    expect(bounds).toBe(true);
    await tags.getByRole('button').first().click();
    await page.getByText(/Фильтр по тегам/).click();
    await expect(page.getByLabel('Найти тег')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/file-tags-placeholders-${width}.png`, fullPage: true });
  }
});

test('audio accepts recordings larger than the former upload limits and explains server size rejection', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const state = await mockAudio(page);
  let uploads = 0;
  let reject = false;
  await page.route('**/api/file', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    uploads++;
    if (reject)
      return route.fulfill({
        status: 413,
        contentType: 'text/html',
        body: '<h1>413 Request Entity Too Large</h1>',
      });
    return route.fulfill({
      json: {
        ...file,
        name: 'large-recording.wav',
        type: 'AUDIO',
        mime: 'audio/wav',
        size: 32 * 1024 * 1024,
      },
    });
  });
  await page.goto('/audio?mode=stt');
  await page.locator('input[type=file]').setInputFiles({
    name: 'large-recording.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.alloc(32 * 1024 * 1024),
  });
  await expect(page.getByRole('button', { name: 'Расшифровать файл', exact: true })).toBeEnabled({
    timeout: 20_000,
  });
  expect(uploads).toBe(1);
  expect(state.sends).toHaveLength(0);
  reject = true;
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'another.wav', mimeType: 'audio/wav', buffer: Buffer.from('fixture') });
  await expect(page.getByRole('alert')).toContainText('Сервер отклонил загрузку из-за размера файла');
  expect(uploads).toBe(2);
  expect(state.sends).toHaveLength(0);
});

for (const path of ['/audio?mode=stt', '/library', '/image', '/prompt']) {
  test(`upload button shows activity until the server responds: ${path}`, async ({ page }) => {
    await mockAudio(page);
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const audio = path.startsWith('/audio');
    await page.route('**/api/file', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await waiting;
      await route.fulfill({ json: { ...file, ...(audio ? { type: 'AUDIO', mime: 'audio/wav' } : {}) } });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    if (path === '/image' || path === '/prompt') {
      await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
      await page
        .getByRole('button', {
          name: path === '/prompt' ? 'Добавить изображение или видео' : 'Добавить изображение',
          exact: true,
        })
        .click();
      await expect(page.getByRole('dialog', { name: 'Библиотека' })).toBeVisible();
    }
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({
        name: audio ? 'test.wav' : 'test.png',
        mimeType: audio ? 'audio/wav' : 'image/png',
        buffer: readFileSync(
          new URL(audio ? '../fixtures/audio.wav' : '../../public/media/gallery-1.jpg', import.meta.url),
        ),
      });
    const button = page.locator('button[aria-busy="true"]');
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(button.locator('.upload-button-spinner')).toBeVisible();
    await expect(button).toContainText(/Загрузка|Сохранение|Подготовка/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    finish();
    await expect(page.locator('button[aria-busy="true"]')).toHaveCount(0);
  });
}

for (const invalid of [
  'missing-state',
  'missing-date',
  'future-date',
  'foreign-redirect',
  'malformed-json',
]) {
  test(`OAuth callback rejects ${invalid} and consumes the attempt`, async ({ page }) => {
    await mockApi(page, false);
    let exchanges = 0;
    await page.route('**/api/login', async (route) => {
      exchanges++;
      await route.fulfill({ json: { sid: 'must-not-login' } });
    });
    await page.goto('/');
    await page.evaluate((invalid) => {
      const attempt: Record<string, unknown> = {
        state: 'expected',
        createdAt: Date.now(),
        redirectUri: `${location.origin}/auth/callback`,
      };
      if (invalid === 'missing-state') delete attempt.state;
      if (invalid === 'missing-date') delete attempt.createdAt;
      if (invalid === 'future-date') attempt.createdAt = Date.now() + 60_000;
      if (invalid === 'foreign-redirect') attempt.redirectUri = 'https://other.example/auth/callback';
      sessionStorage.setItem(
        'genfactory.oauth',
        invalid === 'malformed-json' ? '{broken' : JSON.stringify(attempt),
      );
    }, invalid);
    await page.goto('/auth/callback?state=expected&code=must-not-exchange');
    await expect(page.getByRole('heading', { name: 'Не удалось войти' })).toBeVisible();
    expect(exchanges).toBe(0);
    expect(await page.evaluate(() => sessionStorage.getItem('genfactory.oauth'))).toBeNull();
    await expect(page).toHaveURL(/\/auth\/callback$/);
  });
}

test('OAuth redirect login does not use popup windows', { tag: '@smoke' }, async ({ page }) => {
  await mockApi(page, false);
  await page.goto('/account');
  await page.evaluate(() => {
    window.open = () => {
      throw new Error('Popup prohibited');
    };
  });
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/sso\.example\.test.*openid-connect\/auth/);
  const url = new URL(page.url());
  expect(url.searchParams.get('theme')).toBe('genfactory');
  expect(url.searchParams.get('client_id')).toBe('gnosis');
  expect(url.searchParams.get('state')).toBeTruthy();
  expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5173/auth/callback');
});

test(
  'direct login prevents duplicate requests and lets the user retry a failed connection',
  { tag: '@smoke' },
  async ({ page }) => {
    await mockApi(page, false);
    let requests = 0;
    let release: (() => void) | undefined;
    await page.route('**/api/config', async (route) => {
      requests++;
      if (requests === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await route.fulfill({ status: 503, json: { message: 'Unavailable' } });
      } else await route.fallback();
    });
    await page.goto('/account');
    const sidebar = page.getByRole('button', { name: 'Войти в аккаунт', exact: true });
    const account = page.getByRole('main').getByRole('button', { name: 'Войти', exact: true });
    await sidebar.click();
    await expect.poll(() => requests).toBe(1);
    await expect(sidebar).toBeDisabled();
    await account.click();
    expect(requests).toBe(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    release!();
    await expect(page.getByRole('alert')).toContainText('Не удалось открыть вход');
    await expect(sidebar).toBeEnabled();
    await expect(page).toHaveURL(/\/account$/);
    await account.click();
    await expect(page).toHaveURL(/sso\.example\.test.*openid-connect\/auth/);
    expect(requests).toBe(2);
  },
);

test('OAuth callback cannot exchange the same attempt twice', async ({ page }) => {
  await mockApi(page, false);
  let exchanges = 0;
  await page.route('**/api/login', async (route) => {
    exchanges++;
    await route.fulfill({ json: { sid: 'new-session' } });
  });
  await page.goto('/');
  await page.evaluate(() =>
    sessionStorage.setItem(
      'genfactory.oauth',
      JSON.stringify({
        state: 'single-use',
        createdAt: Date.now(),
        redirectUri: `${location.origin}/auth/callback`,
      }),
    ),
  );
  await page.goto('/auth/callback?state=single-use&code=test-code');
  await expect(page).toHaveURL(/\/image(?:\?studio=advanced)?$/);
  await page.goto('/auth/callback?state=single-use&code=test-code');
  await expect(page.getByRole('heading', { name: 'Не удалось войти' })).toBeVisible();
  expect(exchanges).toBe(1);
});

test('home task opens the studio with its text and never starts a paid request', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Сначала задача. Потом кадр.' })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить в студии' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(
    await page
      .getByRole('textbox', { name: 'Ваша задача', exact: true })
      .evaluate((el) => (el as HTMLTextAreaElement).validity.valueMissing),
  ).toBe(true);
  await page.getByRole('textbox', { name: 'Ваша задача', exact: true }).fill('Красная чашка на белом фоне');
  await page.getByRole('button', { name: 'Продолжить в студии' }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.locator('#cw-draft')).toHaveValue('Красная чашка на белом фоне');
  expect(state.creates).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
});

test('prototype navigation selects specialized editors and matches the reference sections', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Основное меню' });
  await nav.getByRole('link', { name: 'Nano Banana', exact: true }).click();
  await expect(page).toHaveURL(/\/image\?studio=banana$/);
  await expect(nav.getByRole('link', { name: 'Nano Banana', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('link', { name: 'Изображения', exact: true })).not.toHaveAttribute(
    'aria-current',
    'page',
  );
  await nav.getByRole('link', { name: 'Seedance Studio', exact: true }).click();
  await expect(page).toHaveURL(/\/video\?studio=seedance$/);
  await expect(nav.getByRole('link', { name: 'Библиотека', exact: true })).toHaveAttribute(
    'href',
    '/library',
  );
  for (const label of ['Аудио', 'Шаблоны', 'Правила бренда']) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toHaveCount(0);
  }
  await nav.getByRole('link', { name: 'AI agent', exact: true }).click();
  await expect(page.locator('#agent-draft')).toBeVisible();
});

test('home fits the mobile matrix and menu restores keyboard focus', async ({ page }, testInfo) => {
  await mockApi(page);
  await page.goto('/');
  for (const [width, height] of [
    [360, 800],
    [375, 667],
    [390, 844],
    [412, 915],
    [430, 932],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole('heading', { name: 'Сначала задача. Потом кадр.', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({
      path: testInfo.outputPath(`home-prototype-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Меню', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Меню', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Открыть меню', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'История', exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole('dialog', { name: 'Меню', exact: true })).toHaveCount(0);
});

test('login stays in place while account initialization retries on tab return', async ({ page }) => {
  await mockApi(page);
  let release: (() => void) | undefined;
  let requests = 0;
  await page.route('**/api/init', async (route) => {
    requests++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ status: 503, json: { message: 'Temporarily unavailable' } });
  });
  await page.goto('/');
  const login = page.getByRole('button', { name: 'Войти в аккаунт', exact: true });
  await expect(login).toBeVisible();
  const initial = await login.boundingBox();
  await expect.poll(() => requests).toBe(1);
  release!();
  await expect(login).toHaveAttribute('aria-busy', 'false');
  expect(await login.boundingBox()).toEqual(initial);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    window.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    window.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => requests).toBe(2);
  await expect(login).toBeVisible();
  expect(await login.boundingBox()).toEqual(initial);
  release!();
  await expect(login).toHaveAttribute('aria-busy', 'false');
  expect(await login.boundingBox()).toEqual(initial);
});

test('home history filters saved work by type', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push({ ...savedConversation(), tags: ['genfactory', 'image'] });
  await page.goto('/');
  const history = page.getByRole('region', { name: 'История', exact: true });
  await expect(history.getByRole('tab', { name: 'Все', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(history.getByRole('link', { name: 'Открыть работу Saved creative work' })).toBeVisible();
  await history.getByRole('tab', { name: 'Видео', exact: true }).click();
  await expect(history).toContainText('В этом списке пока ничего нет.');
  await history.getByRole('tab', { name: 'Изображения', exact: true }).click();
  await expect(history.getByRole('link', { name: 'Открыть работу Saved creative work' })).toBeVisible();
});

test('content studio prototype controls, templates and guest favorites work without generating', async ({
  page,
}) => {
  const state = await mockApi(page, false);
  await page.goto('/chat');
  await expect(page.getByRole('button', { name: 'Видео', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.cw-card')).toHaveCount(30);
  const first = page.locator('.cw-card').first();
  await first.locator('.cw-fav').click();
  await page.getByRole('button', { name: 'Избранные шаблоны', exact: true }).click();
  await expect(page.locator('.cw-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.cw-card').first().locator('.cw-fav')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.cw-add').first().click();
  await expect(page.getByRole('dialog', { name: 'Studio product turn' })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.locator('#cw-draft')).toHaveValue('');
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: 'Камера Авто', exact: true }).click();
  await page.getByRole('option', { name: 'Сверху', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Камера Сверху', exact: true })).toBeVisible();

  await expect(page.getByRole('switch', { name: 'Сценарист', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Презентация', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Изображение', exact: true }).click();
  await page.getByRole('tab', { name: 'Шаблоны', exact: true }).click();
  await expect(page.locator('.cw-card')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Ширина галереи: средняя', exact: true }).click();
  await expect(page.locator('#creative-workspace')).toHaveAttribute('data-gallery', 'l');
  expect(state.creates).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
});

test(
  'content studio sends image in a persistent conversation and restores its result',
  { tag: '@smoke' },
  async ({ page }) => {
    const state = await mockApi(page);
    await page.goto('/chat');
    await page.getByRole('button', { name: 'Изображение', exact: true }).click();
    await page.getByRole('tab', { name: 'Настройки', exact: true }).click();

    await page.getByRole('button', { name: 'Стороны: 1:1', exact: true }).click();
    await page.getByRole('option', { name: '1:1', exact: true }).click();
    await page.locator('#cw-draft').fill('Чашка на белом фоне');
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect.poll(() => state.sends.length).toBe(1);
    expect(state.creates[0].options.tools).toHaveLength(1);
    expect(state.sends[0].settings.tools[0].uid).toBe('IMAGE');
    await expect(page).toHaveURL(/chat\?conversation=101/);
    await expect(page.locator('.cw-thread')).toContainText('Чашка на белом фоне');
    await page.reload();
    await expect(page.locator('.cw-thread')).toContainText('Чашка на белом фоне');
    expect(state.sends).toHaveLength(1);
    await expect.poll(() => state.joinedRooms.some((room) => room.includes('101'))).toBe(true);
    await page.screenshot({ path: '/tmp/content-studio-connected.png' });
  },
);

// Temporarily unavailable: the writer is hidden by request; remove these legacy cases with the mode.
test.skip('content studio writer disables tools for the request and preserves connected tools', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  await page.goto('/chat?conversation=101');
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Сценарист', exact: true })).toHaveCount(0);

  await page.locator('#cw-draft').fill('Придумай сценарий рекламы кофейни');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.edits).toHaveLength(0);
  expect(state.conversations[0].options.tools).toHaveLength(2);
  expect(state.sends[0].settings.isToolsDisabled).toBe(true);
  expect(state.sends[0].settings.tools).toEqual([]);
  expect(state.sends[0].text).toContain('Не запускай генерацию медиа');
  expect(state.creates).toHaveLength(0);
});

test('content studio blocks an end frame without a start frame before uploading', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/chat');
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: 'Конечный кадр Не задан', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Загрузить', exact: true }).click();
  await (await chooser).setFiles({ name: 'cup.png', mimeType: 'image/png', buffer: Buffer.from('fake') });
  await page.locator('#cw-draft').fill('Оживи чашку');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('добавьте начальный');
  expect(state.uploads).toBe(0);
  expect(state.sends).toHaveLength(0);
});

test('content studio uploads a reference and sends video with its file id', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/chat');
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();

  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'cup.png', mimeType: 'image/png', buffer: Buffer.from('fake') });
  await page.locator('#cw-draft').fill('Поверни чашку');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.uploads).toBe(1);
  expect(state.sends[0].files).toEqual([12]);
  expect(state.sends[0].settings.tools[0]).toMatchObject({
    uid: 'VIDEO',
    settings: { options: { duration: 8, generateAudio: false } },
  });
  expect(state.sends[0].settings.tools[0].settings.options).not.toHaveProperty('aspectRatio');
  await expect(page.locator('.cw-thread video')).toBeVisible();
});

test('content studio restores a running job and receives socket completion without resending', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push({ ...savedConversation(), status: 'LOADING' });
  await page.goto('/chat?conversation=101');
  await expect(page.getByRole('button', { name: 'Отправить запрос', exact: true })).toBeDisabled();
  await expect.poll(() => state.joinedRooms.includes('conversation101')).toBe(true);
  state.conversations[0].status = 'LOADED';
  state.messages.set(101, [
    {
      id: 1,
      role: 'ASSISTANT',
      text: 'Результат пришёл по сокету.',
      files: [file],
      createdDate: file.createdDate,
    },
  ]);
  state.socket!.send(
    '42/gnosisai,' +
      JSON.stringify([
        'transportSocketEvent',
        {
          uid: crypto.randomUUID(),
          name: 'ConversationChangedEvent',
          data: { id: 101, item: { status: 'LOADED' } },
        },
      ]),
  );
  await expect(page.getByText('Результат пришёл по сокету.', { exact: true })).toBeVisible();
  expect(state.sends).toHaveLength(0);
});

test('content studio retains draft after an accepted network failure without retry', async ({ page }) => {
  const state = await mockApi(page);
  state.abortAfterAccept = true;
  await page.goto('/chat');
  await page.locator('#cw-draft').fill('Подготовь сценарий');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Автоматического повтора нет');
  await expect(page.locator('#cw-draft')).toHaveValue('Подготовь сценарий');
  await expect(page.locator('.cw-thread')).toContainText('Подготовь сценарий');
  expect(state.sends).toHaveLength(1);
});

test('content studio controls keep chevrons clear of labels and match conversation structure', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  state.messages.set(101, [
    { id: 1, role: 'USER', text: 'Красная чашка на столе', createdDate: file.createdDate },
    {
      id: 2,
      role: 'ASSISTANT',
      text: 'Изображение готово. [Смотреть видео](https://example.test/result.mp4)',
      files: [file],
      createdDate: file.createdDate,
    },
  ]);
  await page.goto('/chat?conversation=101');
  await expect(page.locator('.as-turn')).toHaveCount(1);
  await expect(page.locator('.as-face')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Смотреть видео', exact: true })).toHaveAttribute(
    'href',
    'https://example.test/result.mp4',
  );
  await expect(page.getByRole('button', { name: 'Повторить запрос', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Повторить запрос', exact: true }).click();
  await expect(page.locator('#cw-draft')).toHaveValue('Красная чашка на столе');
  await expect(page.locator('#cw-draft')).toBeFocused();
  expect(state.sends).toHaveLength(0);
  await page.getByRole('button', { name: 'Видео', exact: true }).click();
  const chips = page.locator('.cw-ratio-pick');
  await expect(chips).toHaveCount(3);
  for (const chip of await chips.all()) {
    expect(await chip.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none');
  }
  await page.locator('.cw-model').click();
  await expect(page.locator('.cw-model')).toHaveAttribute('aria-expanded', 'true');
  const box = await page.locator('.cw-model-menu').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: '/tmp/content-controls-checked.png' });
});

test('content studio gallery creates explicit first and last image frames and sends their ids', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/chat');
  for (const label of ['Начальный', 'Конечный']) {
    await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
    await page.getByRole('button', { name: `${label} кадр Не задан`, exact: true }).click();
    await page.getByRole('button', { name: 'Выбрать шаблон', exact: true }).click();
    await page.locator('.cw-card-media').first().click();
    await page.locator('.cw-add').first().click();
    await expect(page.locator('.composer-attachment').filter({ hasText: `${label} кадр` })).toBeVisible({
      timeout: 20000,
    });
  }
  expect(state.uploads).toBe(0);
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();

  await page.locator('#cw-draft').fill('Плавно перейди от первого кадра к последнему');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.uploads).toBe(2);
  expect(state.sends[0].files).toEqual([12, 13]);
  expect(state.sends[0].settings.tools[0].uid).toBe('VIDEO');
  expect(state.sends[0].settings.tools[0].settings.isLockSelection).toBe(true);
});

test('content studio template is a recipe and portrait format is translated to image size', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Изображение', exact: true }).click();
  await page.locator('.cw-card-media').first().click();
  await page.locator('.cw-add').first().click();
  await page.getByLabel('Продукт', { exact: true }).fill('Красная чашка');
  await page.getByRole('dialog').getByRole('button', { name: 'Из библиотеки' }).click();
  await selectLibraryFile(page, 'Test result');
  await page.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
  await page.getByRole('button', { name: 'Стороны: 1:1', exact: true }).click();
  await page.getByRole('option', { name: '2:3', exact: true }).click();
  await expect(page.locator('#cw-draft')).toHaveValue(/Красная чашка/);
  expect(state.sends).toHaveLength(0);
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].text).toContain('Professional e-commerce main product photo');
  expect(state.sends[0].text).not.toContain('[PRODUCT]');
  expect(state.sends[0].settings.tools[0].settings.options.size).toBe('1024x1536');
  expect(state.sends[0].text).toContain('Размер (options.size): 1024x1536');
  expect(state.sends[0].files).toEqual([12]);
  expect(state.uploads).toBe(0);
});

test('content studio forwards all creative controls and brand rules', async ({ page }) => {
  const state = await mockApi(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      'genfactory.preferences.v1.7',
      JSON.stringify({ brand: 'Только синий фон, без надписей' }),
    ),
  );
  await page.goto('/chat');
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await page.getByRole('switch', { name: 'Дизайн-система', exact: true }).click();
  const settings = [
    ['Формат', 'Премиум, студийный свет'],
    ['Идея', 'Сразу показать товар'],
    ['Обстановка', 'В студии'],
    ['Камера', 'Сверху'],
    ['Движение', 'Наезд'],
    ['Линза', '85 мм'],
    ['Свет', 'Студия'],
  ];
  for (const [label, value] of settings) {
    await page.getByRole('button', { name: new RegExp(`^${label} `) }).click();
    await page.getByRole('option', { name: value, exact: true }).click();
  }
  await page.locator('#cw-draft').fill('Сценарий рекламы чашки');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  for (const [label, value] of settings) expect(state.sends[0].text).toContain(`${label}: ${value}`);
  expect(state.sends[0].text).toContain('Правила бренда: Только синий фон, без надписей');
  expect(state.sends[0].settings.tools[0]).toMatchObject({ uid: 'VIDEO' });
});

test('content studio restores video technical options on reload', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/chat');
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();

  await page.getByRole('button', { name: 'Короче', exact: true }).click();
  await page.locator('#cw-draft').fill('Простой ролик');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  const options = state.sends[0].settings.tools[0].settings.options;
  await page.reload();
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Сценарист', exact: true })).toHaveCount(0);
  await page.locator('#cw-draft').fill('Повтори с теми же параметрами');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(2);
  expect(state.sends[1].settings.tools[0].settings.options).toEqual(options);
});

test('content studio rejects unsupported attachments before upload', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/chat');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'document.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fake') });
  await expect(page.getByRole('alert')).toContainText('JPEG, PNG или WebP');
  expect(state.uploads).toBe(0);
  expect(state.sends).toHaveLength(0);
});

test('content studio sends sound duration scene structure and quality independently', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/chat');
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();

  await page.getByRole('button', { name: 'Изображение', exact: true }).click();
  await page.getByRole('button', { name: /^Качество / }).click();
  await page.getByRole('option', { name: 'low', exact: true }).click();
  await page.getByRole('button', { name: 'Видео', exact: true }).click();
  await page.getByRole('button', { name: 'Без звука', exact: true }).click();
  await page.getByRole('option', { name: 'Со звуком', exact: true }).click();
  await page.getByRole('button', { name: 'Один кадр', exact: true }).click();
  await page.getByRole('option', { name: 'Набор сцен', exact: true }).click();
  await page.getByRole('button', { name: 'Длиннее', exact: true }).click();
  await page.getByRole('button', { name: 'Стороны: 9:16', exact: true }).click();
  await page.getByRole('option', { name: '16:9', exact: true }).click();
  await page.locator('#cw-draft').fill('Ролик с несколькими сценами');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].text).toContain('Структура: Набор сцен');
  expect(state.sends[0].text).toContain('Общая длительность всех сцен вместе');
  expect(state.sends[0].text).not.toContain('Адаптируй сюжет в один непрерывный план');
  expect(state.sends[0].settings.tools[0].settings.options).toMatchObject({
    generateAudio: true,
    duration: 10,
    resolution: '720p',
    aspectRatio: '16:9',
  });
});

test('content studio adapts a multi-shot template to the selected continuous take', async ({ page }) => {
  const state = await mockApi(page);
  const conversation = savedConversation();
  conversation.options.tools = [{ uid: 'VIDEO' }];
  state.conversations.push(conversation);
  await page.goto('/chat?conversation=101');
  const card = page
    .locator('.cw-card')
    .filter({ has: page.locator('strong', { hasText: 'Macro: detail and texture' }) });
  await card.locator('.cw-add').click();
  const dialog = page.getByRole('dialog', { name: 'Macro: detail and texture', exact: true });
  await expect(dialog.locator('.template-settings')).toContainText('Структура: Один кадр');
  for (const input of await dialog.locator('[data-template-variable]').all()) await input.fill('Синяя чашка');
  await dialog.getByRole('button', { name: 'Из библиотеки' }).click();
  await selectLibraryFile(page, 'Test result');
  await dialog.getByRole('button', { name: /Адаптировать под/ }).click();
  await dialog.getByRole('button', { name: 'Использовать шаблон' }).click();
  await expect(page.locator('#cw-draft')).toHaveValue(/Shot 2/);
  expect(state.sends).toHaveLength(0);
  await page.reload();
  await expect(page.locator('.cw-files')).toContainText('Начальный кадр: Test result');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].text).toContain('Структура: Один кадр');
  expect(state.sends[0].text).toContain(
    'она важнее структуры шаблона, готового сценария и предыдущих сообщений',
  );
  expect(state.sends[0].text).toContain('один непрерывный план без склеек');
  expect(state.sends[0].text).toContain('не переноси это разбиение в сценарий и промпт инструмента VIDEO');
  expect(state.sends[0].files).toEqual([12]);
  expect(state.sends[0].settings.tools[0]).toMatchObject({
    uid: 'VIDEO',
    settings: { isLockSelection: true },
  });
});

test('content studio keeps unavailable draft references and blocks generation until removed', async ({
  page,
}) => {
  const state = await mockApi(page);
  const conversation = savedConversation();
  conversation.options.tools = [{ uid: 'VIDEO' }];
  state.conversations.push(conversation);
  await page.goto('/chat?conversation=101');
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  await selectLibraryFile(page, 'Test result');
  await page.locator('#cw-draft').fill('Поверни чашку');
  await page.route('**/api/file/12', (route) =>
    route.fulfill({ status: 404, json: { message: 'Not found' } }),
  );
  await page.reload();
  await expect(page.locator('.cw-files')).toContainText('Test result · Недоступен');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Референс недоступен');
  expect(state.sends).toHaveLength(0);
  expect(state.creates).toHaveLength(0);
  await page.getByRole('button', { name: 'Убрать Test result', exact: true }).click();
  await page.reload();
  await expect(page.locator('.cw-files')).toHaveCount(0);
});

test('content studio does not leak a delayed draft reference into another conversation', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation(101), savedConversation(102));
  await page.goto('/chat?conversation=101');
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  await selectLibraryFile(page, 'Test result');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('genfactory.draft.v1.7.content-studio.101')))
    .toContain('Test result');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/file/12', async (route) => {
    await gate;
    await route.fulfill({ json: file });
  });
  const requested = page.waitForRequest('**/api/file/12');
  await page.reload();
  await requested;
  await page.evaluate(() => {
    history.pushState(null, '', '/chat?conversation=102');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('button', { name: 'Добавить файл', exact: true })).toBeEnabled();
  release();
  await expect(page.locator('.cw-files')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.cw-files')).toHaveCount(0);
  expect(state.sends).toHaveLength(0);
});

test('content studio sends the visible structure after restoring video parameters and reloading', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  const generation = {
    model: { provider: 'OPEN_ROUTER_VIDEO', model: 'x-ai/grok-imagine-video-1.5-lite' },
    prompt: 'Shot 1: blue cup. Shot 2: close-up of its handle.',
    options: { duration: 8, resolution: '720p', aspectRatio: '9:16', generateAudio: false },
  };
  state.messages.set(101, [
    {
      id: 2,
      role: 'ASSISTANT',
      text: 'Готово',
      createdDate: file.createdDate,
      files: [
        {
          ...file,
          id: 13,
          type: 'VIDEO',
          mime: 'video/mp4',
          path: '/test-video.mp4',
          origin: { kind: 'GENERATION', sourceFileIds: [], generation },
        },
      ],
    },
  ]);
  await page.goto('/chat?conversation=101');
  await page.getByRole('button', { name: 'Использовать параметры', exact: true }).click();
  await expect(page.locator('#cw-draft')).toHaveValue(generation.prompt);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Один кадр', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].text).toContain('Структура: Один кадр');
  expect(state.sends[0].text).toContain('один непрерывный план без склеек');
  expect(state.sends[0].settings.tools[0].settings.options).toEqual(generation.options);
});

test('content studio restores creative settings without leaking into another project', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation(101), savedConversation(102));
  await page.goto('/chat?conversation=101');
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: 'Свет Авто', exact: true }).click();
  await page.getByRole('option', { name: 'Ночь', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('genfactory.draft.v1.7.content-studio.101')))
    .toContain('Ночь');
  await page.reload();
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Свет Ночь', exact: true })).toBeVisible();
  await page.evaluate(() => {
    history.pushState(null, '', '/chat?conversation=102');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('button', { name: 'Свет Авто', exact: true })).toBeVisible();
  expect(state.sends).toHaveLength(0);
});

test('content studio applies a saved script with references without generating until send', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.scriptReply = 'Длительность: 8 с. Действие: чашка вращается. Камера: статичная.';
  await page.goto('/chat');
  await page.locator('input[type=file]').setInputFiles({
    name: 'cup.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fake'),
  });
  await page.locator('#cw-draft').fill('Подготовь сценарий для этой чашки');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].settings.tools).toEqual([]);
  expect(state.sends[0].text).toContain('[Genfactory:context]');
  expect(state.sends[0].text).toContain('Структура: Один кадр');
  expect(state.sends[0].text).toContain('предложи сценарий с выбранной структурой');
  expect(state.sends[0].text).not.toContain('предложи сценарий по сценам');
  await expect(page.locator('.as-ask').first()).toHaveText('Подготовь сценарий для этой чашки');
  await expect(page.getByRole('button', { name: 'Использовать сценарий', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Использовать сценарий', exact: true }).click();
  await expect(page.locator('#cw-draft')).toHaveValue(state.scriptReply);
  await expect(page.locator('#cw-draft')).toBeFocused();
  expect(state.sends).toHaveLength(1);
  expect(state.uploads).toBe(1);
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Сценарист', exact: true })).toHaveCount(0);
  await page.locator('#cw-draft').fill('Утверждённый сценарий: чашка вращается');
  await page.screenshot({ path: '/tmp/content-script-applied.png' });
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(2);
  expect(state.sends[1].files).toEqual([12]);
  expect(state.sends[1].text).toContain('Утверждённый сценарий: чашка вращается');
  expect(state.sends[1].settings.tools[0].uid).toBe('VIDEO');
  expect(state.uploads).toBe(1);
  await expect(page.getByRole('button', { name: 'Использовать сценарий', exact: true })).toHaveCount(1);
});

test('content studio model search and favorites preserve actual selection across reload', async ({
  page,
}) => {
  const state = await mockApi(page);
  const selected = catalog.find((item) => item.reference.model === 'qwen/qwen-image-2.1-pro')!;
  const title = modelTitle(selected);
  state.conversations.push(savedConversation());
  await page.goto('/chat?conversation=101');
  await page.getByRole('button', { name: 'Изображение', exact: true }).click();
  await page.locator('.cw-model').click();
  await page.getByRole('searchbox', { name: 'Поиск модели' }).fill(selected.reference.model);
  await expect(page.getByRole('option', { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.getByRole('button', { name: `О модели ${title}`, exact: true }).click();
  await expect(page.locator('dialog')).toContainText(
    `${selected.reference.provider}:${selected.reference.model}`,
  );
  expect(state.sends).toHaveLength(0);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: `В избранные: ${title}`, exact: true }).click();
  await expect(page.locator('.cw-model')).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('searchbox', { name: 'Поиск модели' }).fill('');
  await expect(page.getByRole('option').first()).toHaveAttribute('aria-label', title);
  await page.getByRole('option', { name: title, exact: true }).click();
  await expect(page.locator('.cw-model')).toContainText(title);
  await page.reload();
  await expect(page.locator('.cw-model')).toContainText(title);
  await page.locator('.cw-model').click();
  await expect(page.getByRole('option', { name: title, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: `Убрать из избранных: ${title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `В избранные: ${title}`, exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('.cw-model')).toBeFocused();
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await page.locator('#cw-draft').fill('Чашка на белом фоне');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].settings.tools[0].settings.model).toEqual(selected.reference);
});

test('content studio restores actual result settings and sources instead of current conversation settings', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  const generation = {
    model: catalog.find((item) => item.reference.model === 'sourceful/riverflow-v2.6-pro')!.reference,
    prompt: 'Исторический промпт чашки',
    options: { size: '1024x1536', background: 'opaque' },
  };
  state.messages.set(101, [
    { id: 1, role: 'USER', text: 'Исходный бриф', files: [file], createdDate: file.createdDate },
    {
      id: 2,
      role: 'ASSISTANT',
      text: 'Готово',
      files: [{ ...file, id: 13, origin: { kind: 'GENERATION', sourceFileIds: [12], generation } }],
      createdDate: file.createdDate,
    },
  ]);
  await page.goto('/chat?conversation=101');
  await expect(page.getByLabel(`Параметры ${file.name}`)).toContainText(
    modelTitle(catalog.find((item) => item.reference.model === generation.model.model)!),
  );
  await expect(page.getByLabel(`Параметры ${file.name}`)).toContainText('1024x1536');
  await page.reload();
  await page.getByRole('button', { name: 'Использовать параметры', exact: true }).click();
  await expect(page.locator('#cw-draft')).toHaveValue(generation.prompt);
  await expect(page.locator('#cw-draft')).toBeFocused();
  await expect(page.locator('.cw-model')).toContainText(
    modelTitle(catalog.find((item) => item.reference.model === generation.model.model)!),
  );
  expect(state.sends).toHaveLength(0);
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].settings.tools[0].settings).toEqual({
    isLockSelection: true,
    model: generation.model,
    options: generation.options,
  });
  expect(state.sends[0].files).toEqual([12]);
  expect(state.uploads).toBe(0);
});

test('content studio refuses missing historical references without replacing the draft or generating', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  state.messages.set(101, [
    {
      id: 2,
      role: 'ASSISTANT',
      files: [
        {
          ...file,
          origin: {
            kind: 'GENERATION',
            sourceFileIds: [12],
            generation: {
              model: catalog[0].reference,
              prompt: 'Старый промпт',
              options: { size: '1024x1024', quality: 'low' },
            },
          },
        },
      ],
      createdDate: file.createdDate,
    },
  ]);
  await page.route('**/api/file/12', (route) =>
    route.fulfill({ status: 404, json: { message: 'Исходный файл удалён' } }),
  );
  await page.goto('/chat?conversation=101');
  await page.locator('#cw-draft').fill('Мой текущий черновик');
  await page.getByRole('button', { name: 'Использовать параметры', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('#cw-draft')).toHaveValue('Мой текущий черновик');
  expect(state.sends).toHaveLength(0);
});

test('content studio preserves custom generation dimensions when restoring the same aspect ratio', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  const model = catalog.find((item) => item.reference.model === 'sourceful/riverflow-v2.6-pro')!;
  const generation = {
    model: model.reference,
    prompt: 'Квадратная чашка',
    options: { size: '1536x1536', background: 'opaque' },
  };
  state.messages.set(101, [
    {
      id: 2,
      role: 'ASSISTANT',
      files: [{ ...file, origin: { kind: 'GENERATION', sourceFileIds: [], generation } }],
      createdDate: file.createdDate,
    },
  ]);
  await page.goto('/chat?conversation=101');
  await page.getByRole('button', { name: 'Использовать параметры', exact: true }).click();
  await expect(page.locator('#cw-draft')).toHaveValue(generation.prompt);
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].settings.tools[0].settings.options.size).toBe('1536x1536');
  expect(parseStudioContext(state.sends[0].text)!.input.isDrawNew).toBeUndefined();
  expect(state.sends[0].files).toEqual([]);
});

test('content studio library reuses saved references without uploading or sending on selection', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Изображение', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Библиотека' });
  await selectLibraryFile(page, 'Test result');
  await expect(picker).not.toBeVisible();
  await expect(page.locator('.cw-files')).toContainText('Test result');
  expect(state.uploads).toBe(0);
  expect(state.sends).toHaveLength(0);
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();

  await page.locator('#cw-draft').fill('Use this saved image');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([12]);
  expect(state.uploads).toBe(0);
});

test('content studio library selects and replaces frame slots on mobile', async ({ page }) => {
  const state = await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Видео', exact: true }).click();
  await page.getByRole('button', { name: 'Шаблоны и настройки', exact: true }).click();
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: /Начальный кадр/ }).click();
  await page.getByRole('button', { name: 'Из библиотеки', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Библиотека' })).toBeVisible();
  await page.screenshot({ path: '/tmp/content-library-mobile.png' });
  await page.getByRole('dialog').getByText('Test result', { exact: true }).click();
  await expect(page.getByRole('button', { name: /Начальный кадр Test result/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить файл', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /Начальный кадр Test result/ }).click();
  await page.getByRole('button', { name: 'Из библиотеки', exact: true }).click();
  await page.getByRole('dialog').getByText('Test result', { exact: true }).click();
  await expect(page.locator('.cw-files .composer-attachment')).toHaveCount(1);
  expect(state.uploads).toBe(0);
  expect(state.sends).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('library shows stored generation details and handles unavailable sources without generating', async ({
  page,
}) => {
  const state = await mockApi(page);
  const generated = {
    ...file,
    origin: {
      kind: 'GENERATION',
      sourceFileIds: [999],
      generation: {
        model: { provider: 'OPEN_ROUTER_VIDEO', model: 'x-ai/grok-imagine-video-1.5-lite' },
        prompt: 'Historical prompt with roses',
        options: { duration: 4, resolution: '480p', aspectRatio: '9:16', generateAudio: true },
      },
    },
  };
  await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([generated]) }));
  await page.route('**/api/file/12', (route) => route.fulfill({ json: generated }));
  await page.route('**/api/file/999', (route) =>
    route.fulfill({ status: 404, json: { message: 'Unavailable' } }),
  );
  await page.goto('/library');
  await expect(page.locator('.file-generation-summary')).toContainText('4 с · 480p');
  await page.getByRole('button', { name: /Test result/ }).click();
  await openViewerActions(page);
  await page.getByRole('button', { name: 'Параметры генерации', exact: true }).click();
  await expect(page.getByText('Historical prompt with roses', { exact: true })).toBeVisible();
  await expect(page.getByText('Исходник №999 недоступен')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Копировать промпт' })).toBeVisible();
  await page.screenshot({ path: '/tmp/library-generation-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/library-generation-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.sends).toHaveLength(0);
  expect(state.uploads).toBe(0);
});

test('library does not invent generation details for uploaded files', async ({ page }) => {
  await mockApi(page);
  await page.goto('/library');
  await expect(page.getByRole('button', { name: /Test result/ })).toBeVisible();
  await expect(page.locator('.file-generation-summary')).toHaveCount(0);
  await page.getByRole('button', { name: /Test result/ }).click();
  await openViewerActions(page);
  await expect(page.getByRole('button', { name: 'Параметры генерации', exact: true })).toHaveCount(0);
});

for (const title of ['Studio product turn', 'Product in use']) {
  test(`guided template ${title} validates materials and applies without generation`, async ({ page }) => {
    const state = await mockApi(page);
    await page.goto('/chat');
    await page.getByRole('button', { name: 'Короче', exact: true }).click();
    const card = page.locator('.cw-card').filter({ has: page.locator('strong', { hasText: title }) });
    await card.hover();
    await card.locator('.cw-add').click();
    await page.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Заполните');
    await page.getByLabel('Продукт', { exact: true }).fill('Красная чашка');
    if (title === 'Studio product turn') await page.getByLabel('Цвет фона', { exact: true }).fill('Белый');
    else {
      await page.getByLabel('Место действия', { exact: true }).fill('Парк');
      await page.getByLabel('Персонаж', { exact: true }).fill('Взрослая девушка');
      await page.getByLabel('Действие', { exact: true }).fill('Держит чашку');
    }
    await page.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Выберите исходное фото');
    await page.getByRole('dialog').getByRole('button', { name: 'Из библиотеки' }).click();
    await selectLibraryFile(page, 'Test result');
    await page.getByRole('button', { name: /Адаптировать под/ }).click();
    await expect(page.getByLabel('Готовый текст для редактора')).toHaveValue(/6-second/);
    await expect(page.locator('.template-settings')).toContainText('6 с');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `/tmp/template-${title.replaceAll(' ', '-')}.png` });
    await page.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#cw-draft')).toHaveValue(/6-second/);
    await expect(page.locator('#cw-draft')).toHaveValue(/Красная чашка/);
    await expect(page.locator('.cw-stepper')).toContainText('6 с');
    await expect(page.locator('.cw-files')).toContainText('Test result');
    expect(state.sends).toHaveLength(0);
    expect(state.uploads).toBe(0);
    await expect(page.getByRole('status').filter({ hasText: 'применён' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Убрать Test result', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'применён' })).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#cw-draft')).toHaveValue(/Красная чашка/);
  });
}

test.describe('complete template catalog', () => {
  test.describe.configure({ mode: 'parallel' });
  for (const kind of ['image', 'video']) {
    const items = templates.filter((item) => item.kind === kind);
    for (let offset = 0; offset < items.length; offset += 20) {
      test(`all ${kind} templates prepare a complete draft without generation: ${offset + 1}-${Math.min(offset + 20, items.length)}`, async ({
        page,
      }) => {
        test.setTimeout(120_000);
        const state = await mockApi(page);
        await page.goto('/chat');
        const modeName = { image: 'Изображение', video: 'Видео' }[kind]!;
        await page.getByRole('button', { name: modeName, exact: true }).click();
        for (const [index, item] of items.slice(offset, offset + 20).entries()) {
          const card = page.locator('.cw-card').nth(offset + index);
          await card.locator('.cw-card-media').click();
          await card.locator('.cw-add').click();
          const dialog = page.getByRole('dialog', { name: item.title, exact: true });
          const inputs = dialog.locator('[data-template-variable]');
          for (const input of await inputs.all()) await input.fill('Тестовые данные');
          if (kind === 'presentation')
            await page
              .getByLabel('Тема и исходные факты')
              .fill('Кофейня: 2 филиала, основана в 2020 году. Другие данные неизвестны.');
          else {
            // Проверяем доступный референс во всех media-шаблонах без загрузки и платного запроса.
            await dialog.getByRole('button', { name: 'Из библиотеки' }).click();
            await selectLibraryFile(page, 'Test result');
          }
          const adapt = dialog.getByRole('button', { name: /Адаптировать под/ });
          if (await adapt.count()) await adapt.click();
          const prepared = await dialog.getByLabel('Готовый текст для редактора').inputValue();
          expect(prepared, item.id).not.toMatch(/\[[A-Za-z][A-Za-z_0-9 ]*\]/);
          await dialog.getByRole('button', { name: 'Использовать шаблон' }).click();
          await expect(dialog).toHaveCount(0);
          await expect(page.locator('#cw-draft')).toHaveValue(prepared);
          expect(state.sends, item.id).toHaveLength(0);
          expect(state.uploads, item.id).toBe(0);
        }
      });
    }
  }
});

test('optional template clears previous references and sends explicitly from scratch', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  await page.goto('/chat?conversation=101');
  await page.getByRole('button', { name: 'Изображение', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  await selectLibraryFile(page, 'Test result');
  const card = page.locator('.cw-card').nth(11);
  await card.locator('.cw-card-media').click();
  const dialog = page.getByRole('dialog');
  for (const input of await dialog.locator('[data-template-variable]').all())
    await input.fill('Спокойный парк');
  await dialog.getByRole('button', { name: 'Убрать фото' }).click();
  await dialog.getByRole('button', { name: 'Использовать шаблон' }).click();
  await expect(page.locator('.cw-files')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#cw-draft')).toHaveValue(/Спокойный парк/);
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([]);
  expect(parseStudioContext(state.sends[0].text)!.input.isDrawNew).toBe(true);
  expect(state.uploads).toBe(0);
  await expect(page.locator('#cw-draft')).toHaveValue('');
  await page.locator('#cw-draft').fill('Сделай свет мягче на предыдущем результате');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(2);
  expect(
    parseStudioContext(state.sends[1].text)!.historyFiles?.some((file) => file.role === 'ASSISTANT'),
  ).toBe(true);
});

for (const command of ['подтверждаю', 'да сделай уже видео!']) {
  test.skip(`content studio does not change mode for text command: ${command}`, async ({ page }) => {
    const state = await mockApi(page);
    state.scriptReply = '**Длительность:** 8 секунд\n**Действие:** Чашка вращается.\n**Камера:** Статичная.';
    await page.goto('/chat');
    await page.locator('#cw-draft').fill('Придумай сценарий');
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Использовать сценарий', exact: true })).toBeVisible();
    await page.locator('#cw-draft').fill(command);
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect.poll(() => state.sends.length).toBe(2);
    expect(state.sends[1].settings.isToolsDisabled).toBe(true);
    expect(state.sends[1].settings.tools).toEqual([]);
    await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Сценарист', exact: true })).toHaveCount(0);

    await page.locator('#cw-draft').fill('Сделай видео по сценарию');
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect.poll(() => state.sends.length).toBe(3);
    expect(state.sends[2].settings.tools[0]).toMatchObject({ uid: 'VIDEO' });
  });
}

test('content studio does not offer clarification or refusal as a script', async ({ page }) => {
  const state = await mockApi(page);
  state.scriptReply = 'Какая нужна длительность?';
  await page.goto('/chat');
  await page.locator('#cw-draft').fill('Придумай сценарий');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect(page.locator('.cw-thread')).toContainText(state.scriptReply);
  await expect(page.getByRole('button', { name: 'Использовать сценарий', exact: true })).toHaveCount(0);
  await page.locator('#cw-draft').fill('сделай видео');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(2);
  expect(state.sends[1].settings.isToolsDisabled).toBe(true);
});

for (const width of [390, 1440]) {
  test(`history filters stay in place while loading and empty at ${width}`, async ({ page }) => {
    const state = await mockApi(page);
    state.conversations.push(savedConversation());
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/conversation?**', async (route) => {
      const conditions = JSON.parse(new URL(route.request().url()).searchParams.get('conditions') || '{}');
      if (conditions.status !== 'LOADING') return route.fallback();
      await pending;
      await route.fulfill({ json: pagination([]) });
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/history');
    await expect(page.locator('.history-card')).toHaveCount(1);
    const toolbar = page.locator('.library-toolbar');
    const before = await toolbar.boundingBox();
    await page.getByRole('button', { name: 'В работе', exact: true }).click();
    await expect(page.getByText('Загружаем историю…')).toBeVisible();
    expect(await toolbar.boundingBox()).toEqual(before);
    release();
    await expect(page.getByRole('heading', { name: 'Нет работ в процессе' })).toBeVisible();
    expect(await toolbar.boundingBox()).toEqual(before);
    await page.getByRole('button', { name: 'Избранное', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Нет избранных работ' })).toBeVisible();
    expect(await toolbar.boundingBox()).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test(
  'history card opens its result from cover title date and free space',
  { tag: '@smoke' },
  async ({ page }) => {
    const state = await mockApi(page);
    state.conversations.push({ ...savedConversation(), previewMode: 'MANUAL', previewFileId: 12 });
    for (const selector of ['.history-cover', 'h2', 'time', '.history-card']) {
      await page.goto('/history');
      const target = page.locator('.history-card').first();
      await expect(target).toBeVisible();
      const box = await (selector === '.history-card' ? target : target.locator(selector)).boundingBox();
      if (!box) throw new Error('Card target is missing');
      await page.mouse.click(
        box.x + box.width / 2,
        box.y + (selector === '.history-card' ? box.height - 5 : box.height / 2),
      );
      await expect(page, selector).toHaveURL(/\/history$/);
      await expect(page.getByRole('dialog')).toBeVisible();
    }
    expect(state.sends).toHaveLength(0);
    expect(state.edits).toHaveLength(0);
  },
);

test('history conversation link supports keyboard without a generated file', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push({ ...savedConversation(), tags: ['genfactory', 'content-studio'] });
  await page.goto('/history');
  await page.getByLabel('Действия работы Saved creative work', { exact: true }).click();
  const link = page.getByRole('link', { name: 'Обсудить работу', exact: true });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/chat\?conversation=101$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.sends).toHaveLength(0);
});

test(
  'library batch upload keeps destination, continues after failure and navigates back',
  { tag: '@smoke' },
  async ({ page }) => {
    await mockApi(page);
    const folder = { ...file, id: 80, uid: 'folder-80', name: 'ДТП', type: 'DIRECTORY' };
    await page.route('**/api/file?*', (route) => {
      const conditions = JSON.parse(new URL(route.request().url()).searchParams.get('conditions')!);
      return route.fulfill({ json: pagination(typeof conditions.directory === 'string' ? [] : [folder]) });
    });
    const requests: string[] = [];
    await page.route('**/api/file', async (route) => {
      requests.push(route.request().postDataBuffer()!.toString());
      await route.fulfill(
        requests.length === 2
          ? { status: 400, json: { message: 'Файл повреждён' } }
          : { json: { ...file, id: 100 + requests.length } },
      );
    });
    await page.goto('/image');
    const navigation = page.getByRole('navigation', { name: 'Основное меню' });
    await expect(navigation.getByRole('link', { name: 'История', exact: true })).toBeVisible();
    const labels = await navigation.getByRole('link').allTextContents();
    expect(labels).not.toContain('Беседы');
    await navigation.getByRole('link', { name: 'Библиотека', exact: true }).click();
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByRole('button', { name: 'Все файлы', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /^ДТП Папка(?:\s|$)/ }).click();
    await page.locator('input[type=file]').setInputFiles([
      { name: 'one.png', mimeType: 'image/png', buffer: Buffer.from('image') },
      { name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf') },
      { name: 'three.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video') },
    ]);
    await expect(page.getByRole('status')).toHaveText('Загружено: 2 из 3');
    await expect(page.getByRole('alert')).toContainText('broken.pdf');
    expect(requests).toHaveLength(3);
    for (const request of requests) expect(request).toContain('folder-80');
    const up = page
      .locator('.library-grid > .file-entry')
      .first()
      .getByRole('button', { name: 'На уровень выше' });
    await expect(up).toBeVisible();
    await up.click();
    await expect(page.getByRole('button', { name: 'На уровень выше' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^ДТП Папка(?:\s|$)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Назад в родительскую папку' })).toHaveCount(0);
  },
);

test('library picker keeps batch upload status inside its button and explains the file limit', async ({
  page,
}, testInfo) => {
  await mockApi(page);
  let uploads = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/file', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    if (++uploads === 4) await gate;
    await route.fulfill({
      status: 403,
      json: { code: 'FILE_AMOUNT_EXCEED', message: 'FileAmountExceedError' },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Изображение', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Библиотека' });
  await picker.locator('input[type=file]').setInputFiles(
    Array.from({ length: 4 }, (_, index) => ({
      name: `image-${index}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from('image'),
    })),
  );
  await expect.poll(() => uploads).toBe(4);
  const button = picker.getByRole('button', { name: 'Загрузить файл', exact: true });
  try {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(button).toHaveAttribute('aria-busy', 'true');
      await expect(button.locator('.file-upload-count')).toHaveText('4/4');
      const bounds = await button.boundingBox();
      const status = await button.locator('.upload-button-status').boundingBox();
      const count = await button.locator('.file-upload-count').boundingBox();
      const search = await picker.getByRole('textbox', { name: 'Поиск по всем файлам' }).boundingBox();
      expect(status!.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(status!.x + status!.width).toBeLessThanOrEqual(count!.x);
      expect(count!.x + count!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
      expect(search!.width).toBeGreaterThan(40);
      expect(await picker.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`library-upload-${width}.png`) });
    }
  } finally {
    release();
  }
  await expect(picker.getByRole('alert')).toContainText('Достигнут лимит количества файлов');
  await expect(picker.getByRole('alert')).not.toContainText('FileAmountExceedError');
  await expect(picker.locator('.file-browser > [role=status]')).toHaveText('Загружено: 0 из 4');
  await expect(button).toHaveAttribute('aria-busy', 'false');
  await expect(button).toBeEnabled();
});

test('mobile library search keeps focus and selection while results refresh', async ({ page }, testInfo) => {
  await mockApi(page);
  const searches: Array<string> = [];
  await page.route('**/api/file?*', async (route) => {
    const conditions = JSON.parse(new URL(route.request().url()).searchParams.get('conditions') || '{}');
    searches.push(conditions.name?.value || '');
    await route.fulfill({ json: pagination([]) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Изображение', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Библиотека' });
  const search = picker.getByRole('textbox', { name: 'Поиск по всем файлам' });
  await expect(search).toHaveCSS('font-size', '16px');
  await search.click();
  for (const text of ['ли', 'са']) {
    await search.pressSequentially(text);
    const value = await search.inputValue();
    await expect.poll(() => searches.includes(`%${value}%`)).toBe(true);
    await expect(search).toBeFocused();
    expect(await search.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(value.length);
  }
  await expect(search).toHaveValue('лиса');
  await page.setViewportSize({ width: 390, height: 430 });
  await expect(search).toBeFocused();
  await expect(search).toBeInViewport();
  await expect(search).toHaveValue('лиса');
  await page.screenshot({ path: testInfo.outputPath('library-search-mobile.png') });
});

for (const pickerMode of [false, true]) {
  test(`library layout stays within the viewport across browsing and upload states, picker ${pickerMode}`, async ({
    page,
  }, testInfo) => {
    await mockApi(page);
    const folderName = 'Папка с очень длинным названием проекта и вложенных материалов';
    const folder = { ...file, id: 80, uid: 'layout-folder', name: folderName, type: 'DIRECTORY' };
    const items = Array.from({ length: 12 }, (_, index) => ({
      ...file,
      id: index + 100,
      name: `${'ОченьДлинноеИмя'.repeat(8)}-${index}.png`,
    }));
    await page.route('**/api/file?*', (route) => {
      const conditions = JSON.parse(new URL(route.request().url()).searchParams.get('conditions') || '{}');
      return route.fulfill({
        json: pagination(
          conditions.name ? [] : conditions.directory === folder.uid ? items : [folder, ...items],
        ),
      });
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/file', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await gate;
      await route.fulfill({ status: 400, json: { message: 'Файл не поддерживается.' } });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(pickerMode ? '/chat' : '/library');
    if (pickerMode) {
      await page.getByRole('button', { name: 'Изображение', exact: true }).click();
      await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
    }
    const surface = pickerMode
      ? page.getByRole('dialog', { name: 'Библиотека' })
      : page.locator('.library-page');
    const search = surface.getByRole('textbox', { name: 'Поиск по всем файлам' });
    const checkBounds = async (): Promise<void> => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await surface.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      const input = await search.boundingBox();
      expect(input!.width).toBeGreaterThan(40);
    };
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(surface.locator('.file-entry')).toHaveCount(13);
      await checkBounds();
      await page.screenshot({ path: testInfo.outputPath(`library-${pickerMode}-${width}.png`) });
    }
    if (pickerMode) {
      await surface.locator('.file-entry').last().scrollIntoViewIfNeeded();
      const last = await surface.locator('.file-entry').last().boundingBox();
      const footer = await surface.locator('.library-selection-bar').boundingBox();
      expect(last!.y + last!.height).toBeLessThanOrEqual(footer!.y);
    }
    await surface
      .locator('.library-card')
      .filter({ has: page.locator('b', { hasText: folderName }) })
      .click();
    await expect(surface.locator('.file-entry')).toHaveCount(13);
    await page.setViewportSize({ width: 320, height: 430 });
    await checkBounds();
    await search.fill('Нет такого файла');
    await expect(surface.getByText('По вашему запросу ничего не найдено.', { exact: true })).toBeVisible();
    await expect(search).toBeFocused();
    await checkBounds();
    await search.fill('');
    await expect(surface.locator('.file-entry')).toHaveCount(13);
    await surface.locator('input[type=file]').setInputFiles({
      name: `${'LongName'.repeat(14)}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from('image'),
    });
    const button = surface.getByRole('button', { name: 'Загрузить файл', exact: true });
    try {
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(button).toHaveAttribute('aria-busy', 'true');
        await checkBounds();
        await expect
          .poll(() =>
            button.evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              const status = element.querySelector('.upload-button-status')!.getBoundingClientRect();
              return status.left >= bounds.left - 1 && status.right <= bounds.right + 1;
            }),
          )
          .toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`library-busy-${pickerMode}-${width}.png`) });
      }
    } finally {
      release();
    }
    await expect(surface.getByRole('alert')).toContainText('Файл не поддерживается.');
    await page.setViewportSize({ width: 320, height: 430 });
    await checkBounds();
    await surface.getByRole('alert').scrollIntoViewIfNeeded();
    await expect(surface.getByRole('alert')).toBeInViewport();
    if (pickerMode) {
      const alert = await surface.getByRole('alert').boundingBox();
      const footer = await surface.locator('.library-selection-bar').boundingBox();
      expect(alert!.y + alert!.height).toBeLessThanOrEqual(footer!.y);
    }
    await page.screenshot({ path: testInfo.outputPath(`library-error-${pickerMode}.png`) });
  });
}

test('library incompatible document is visibly marked and cannot be attached', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/file?*', (route) =>
    route.fulfill({
      json: pagination([
        file,
        { ...file, id: 81, name: 'Document.pdf', type: 'DOCUMENT', mime: 'application/pdf' },
        {
          ...file,
          id: 82,
          name: 'Movie.mp4',
          type: 'VIDEO',
          mime: 'video/mp4',
          preview: { video: { status: 'READY', url: '/test-video.mp4' } },
        },
      ]),
    }),
  );
  await page.goto('/image');
  await page.getByRole('button', { name: 'Добавить изображение', exact: true }).click();
  const card = page.locator('.file-entry').filter({ hasText: 'Document.pdf' });
  await expect(card).toHaveClass(/is-incompatible/);
  await expect(card.locator('.library-card')).toBeDisabled();
  await expect(card.getByRole('tooltip')).toBeHidden();
  await expect(card.locator('.file-incompatible')).toHaveCSS('color', 'rgb(255, 208, 138)');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await card.getByRole('button', { name: 'Почему файл не подходит' }).focus();
    await expect(card.getByRole('tooltip')).toBeVisible();
    const movie = page.locator('.file-entry').filter({ hasText: 'Movie.mp4' });
    await movie.hover();
    await expect(movie.locator('video')).toHaveCount(0);
    const good = page.locator('.file-entry').filter({ hasText: 'Test result' });
    const heights = await Promise.all([good, card].map(async (item) => (await item.boundingBox())!.height));
    expect(Math.abs(heights[0] - heights[1])).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/library-incompatible-${width}.png` });
  }
});

test('library move picker describes empty subfolders and still moves into a folder containing images', async ({
  page,
}) => {
  await mockApi(page);
  const folder = { ...file, id: 80, uid: 'folder-80', name: 'ДТП', type: 'DIRECTORY' };
  const writes: unknown[] = [];
  await page.route('**/api/file?*', (route) => {
    const conditions = JSON.parse(new URL(route.request().url()).searchParams.get('conditions')!);
    const items = typeof conditions.directory === 'string' ? [] : conditions.type ? [folder] : [folder, file];
    return route.fulfill({ json: pagination(items) });
  });
  await page.route('**/api/file/12', (route) => {
    if (route.request().method() === 'PUT') writes.push(route.request().postDataJSON());
    return route.fulfill({ json: file });
  });
  await page.goto('/library');
  await page.locator('.file-entry').filter({ hasText: 'Test result' }).locator('summary').click();
  await page.getByRole('button', { name: 'Переместить', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^ДТП Папка(?:\s|$)/ }).click();
  await expect(dialog.getByText('Нет вложенных папок. Можно выбрать текущую.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Переместить сюда', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual([{ directory: 'folder-80' }]);
});

test('prompt result dialog contains long blocked responses on desktop and mobile', async ({ page }) => {
  const state = await mockApi(page);
  const conversation = {
    ...savedConversation(93),
    tags: ['genfactory', 'prompt'],
    options: { model: agent.reference.model, tools: [] },
  };
  state.conversations.push(conversation);
  const source = { ...file, name: 'photo_2026-11-05_17-02-29_1793890509948.jpg' };
  state.messages.set(93, [
    {
      id: 303,
      role: 'USER',
      text:
        '[Genfactory:prompt-input] ' +
        JSON.stringify({
          task: 'video',
          target: 'universal',
          language: 'English',
          aspects: ['Общая идея'],
          note: 'Запрос видеопромпта',
        }),
      files: [source],
      createdDate: file.createdDate,
    },
    {
      id: 304,
      role: 'ASSISTANT',
      text: JSON.stringify({
        status: 'blocked',
        title: 'Не удалось подготовить промпт по этому запросу',
        prompt: null,
        observations: Array.from({ length: 5 }, () => ({
          fileId: file.id,
          text: 'На изображении виден персонаж в пиратской шляпе, расположенный по центру кадра в домашней обстановке.',
        })),
        clarifications: [],
        limitations: Array.from(
          { length: 3 },
          () =>
            'Модель не подготовила промпт по текущему запросу. Измените описание сцены и отправьте новый запрос, сохранив необходимые детали исходного изображения.',
        ),
      }),
      files: [],
      createdDate: file.createdDate,
    },
  ]);
  await page.goto('/prompt?conversation=93');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.prompt-card').first().hover();
    await page.getByRole('button', { name: 'Открыть промпт', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveClass(/prompt-result-modal/);
    await expect(dialog).toBeVisible();
    const geometry = await dialog.evaluate((d) => {
      const view = d.querySelector('.prompt-view')!;
      const rect = d.getBoundingClientRect();
      const close = d.querySelector('[aria-label="Закрыть"]')!.getBoundingClientRect();
      return {
        fits: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        overflow: d.scrollWidth > d.clientWidth || view.scrollWidth > view.clientWidth,
        closeVisible: close.top >= 0 && close.bottom <= innerHeight,
        background: getComputedStyle(d).backgroundColor,
      };
    });
    expect(geometry.fits).toBe(true);
    expect(geometry.overflow).toBe(false);
    expect(geometry.closeVisible).toBe(true);
    expect(geometry.background).not.toBe('rgba(0, 0, 0, 0)');
    await page.screenshot({ path: `/tmp/prompt-panel-mock-${width}.png` });
    if (width === 390) {
      const scrollTop = await dialog.locator('.prompt-view').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        return element.scrollTop;
      });
      expect(scrollTop).toBeGreaterThan(0);
      await expect(dialog.getByRole('button', { name: 'Закрыть', exact: true })).toBeInViewport();
    }
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  expect(state.sends).toHaveLength(0);
});

test('image submission clears its reference after a response but keeps it on uncertain transport failure', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/image');
  await page.getByRole('button', { name: 'Добавить изображение', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Test result/ })
    .click();
  await submit(page, 'Preserve the reference cup');
  await expectCompleted(page);
  expect(state.tasks[0].task.fileIds).toEqual([12]);
  await expect(page.getByRole('button', { name: 'Убрать Test result', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Добавить изображение', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Test result/ })
    .click();
  state.abortAfterAccept = true;
  await submit(page, 'Try another angle');
  await expect(page.getByRole('alert')).toContainText('Автоматического повтора нет');
  await expect(page.getByRole('button', { name: 'Убрать Test result', exact: true })).toBeVisible();
  expect(state.tasks).toHaveLength(2);
});

test('prompt cards keep their geometry with multiple long responses and a portrait reference', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push({
    ...savedConversation(93),
    tags: ['genfactory', 'prompt'],
    options: { model: agent.reference.model, tools: [] },
  });
  const source = { ...file, path: '/portrait-test.svg' };
  await page.route('**/portrait-test.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="1200"><rect width="300" height="1200" fill="steelblue"/></svg>',
    }),
  );
  state.messages.set(
    93,
    Array.from({ length: 8 }, (_, index) => [
      {
        id: 400 + index * 2,
        role: 'USER',
        text:
          '[Genfactory:prompt-input] ' +
          JSON.stringify({
            task: 'video',
            target: 'universal',
            language: 'English',
            aspects: ['Общая идея'],
            note: 'Идея',
          }),
        files: [source],
        createdDate: file.createdDate,
      },
      {
        id: 401 + index * 2,
        role: 'ASSISTANT',
        text: JSON.stringify({
          status: 'blocked',
          title: 'Длинное название ответа модели для видеопромпта',
          prompt: null,
          observations: [],
          clarifications: [],
          limitations: ['Длинный ответ модели. '.repeat(25)],
        }),
        files: [],
        createdDate: file.createdDate,
      },
    ]).flat() as IConversationMessage[],
  );
  await page.goto('/prompt?conversation=93');
  await expect(page.locator('.prompt-card')).toHaveCount(8);
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `/tmp/prompt-cards-${width}.png` });
    const geometry = await page
      .locator('.prompt-card-shot')
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        const image = el.querySelector('img')!.getBoundingClientRect();
        return { ratio: r.width / r.height, imageHeight: image.height, height: r.height };
      });
    const cards = await page.locator('.prompt-card').evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left };
      }),
    );
    for (let i = 1; i < cards.length; i++) {
      const previous = cards
        .slice(0, i)
        .filter((c) => Math.abs(c.left - cards[i].left) < 1)
        .at(-1);
      if (previous) expect(cards[i].top - previous.bottom).toBeGreaterThanOrEqual(11);
    }
    expect(geometry.ratio).toBeCloseTo(16 / 9, 1);
    expect(geometry.imageHeight).toBeLessThanOrEqual(geometry.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('running generation restores elapsed time after reload and clears its previous completion notice', async ({
  page,
}) => {
  const state = await mockApi(page);
  const conversation: IConversation = { ...savedConversation(101), status: 'LOADING' };
  state.conversations.push(conversation);
  state.messages.set(101, [
    { id: 20, role: 'USER', text: 'Generate a cup', createdDate: new Date(Date.now() - 65000).toISOString() },
  ]);
  await page.goto('/image?conversation=101');
  await expect(page.locator('.generation-elapsed')).toBeVisible();
  expect(parseInt(await page.locator('.generation-elapsed').innerText())).toBeGreaterThanOrEqual(65);
  await page.reload();
  await expect(page.locator('.generation-elapsed')).toBeVisible();
  expect(parseInt(await page.locator('.generation-elapsed').innerText())).toBeGreaterThanOrEqual(65);
  await expect.poll(() => !!state.socket).toBeTruthy();
  const refresh = () =>
    state.socket!.send(
      '42/gnosisai,' +
        JSON.stringify([
          'transportSocketEvent',
          { uid: crypto.randomUUID(), name: 'ConversationChangedEvent', data: { id: 101 } },
        ]),
    );
  conversation.status = 'LOADED';
  refresh();
  await expect(page.locator('.job-notice')).toContainText('Работа завершена');
  conversation.status = 'LOADING';
  refresh();
  await expect(page.getByRole('button', { name: 'Активные работы: 1' })).toBeVisible();
  await expect(page.locator('.job-notice')).toHaveCount(0);
  expect(state.sends).toHaveLength(0);
});

test('library model label uses exact saved model from catalog', async ({ page }) => {
  await mockApi(page);
  const model = catalog[0];
  await page.route('**/api/file?*', (route) =>
    route.fulfill({
      json: pagination([
        {
          ...file,
          origin: { kind: 'GENERATION', generation: { model: model.reference, prompt: 'cup', options: {} } },
        },
      ]),
    }),
  );
  await page.goto('/library');
  await expect(page.locator('.file-generation-summary')).toHaveText(modelTitle(model));
});

test('active work finishes on another page even when its final socket event is lost', async ({ page }) => {
  const state = await mockApi(page);
  const conversation: IConversation = { ...savedConversation(101), status: 'LOADING' };
  state.conversations.push(conversation);
  await page.goto('/library');
  await expect(page.getByRole('button', { name: 'Активные работы: 1' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Активные работы: 1' })).toBeVisible();
  conversation.status = 'LOADED';
  await expect(page.getByRole('button', { name: 'Активные работы: 0' })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.job-notice')).toContainText('Работа завершена');
  expect(state.sends).toHaveLength(0);
});

for (const kind of ['image', 'video'] as const) {
  test(`${kind} shows a response without a file as a neutral card and opens the full answer`, async ({
    page,
  }) => {
    const state = await mockApi(page);
    const conversation = savedConversation(95);
    conversation.tags = ['genfactory', kind];
    state.conversations.push(conversation);
    const answer =
      kind === 'video'
        ? 'Не удалось получить ролик: генератор завершил задачу без выходного файла, вероятно из-за фильтра контента. Повторно запускать генерацию без вашего указания не буду.'
        : 'Уточните, какой предмет должен быть на изображении.';
    state.messages.set(95, [
      {
        id: 316,
        role: 'ASSISTANT',
        text: answer + '\n' + 'Подробности ответа. '.repeat(100),
        files: [],
        createdDate: file.createdDate,
      },
    ]);
    await page.goto(`/${kind}?conversation=95`);
    const card = page.locator('.media-answer-card');
    await expect(card).toContainText(answer);
    await expect(card).toContainText('Ответ по запросу');
    await expect(page.locator('.video-result-failed')).toHaveCount(0);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await card.getByRole('button', { name: 'Открыть ответ по запросу' }).click();
      const dialog = page.getByRole('dialog', { name: 'Ответ по запросу' });
      await expect(dialog).toContainText(answer);
      expect(await dialog.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
        'rgba(0, 0, 0, 0)',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/${kind}-answer-${width}.png` });
      await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    expect(state.sends).toHaveLength(0);
    expect(state.creates).toHaveLength(0);
  });
}

test('video with an output file does not also display a no-result answer card', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation(95));
  state.messages.set(95, [
    {
      id: 316,
      role: 'ASSISTANT',
      text: 'Ролик готов',
      files: [{ ...file, type: 'VIDEO', mime: 'video/mp4', path: '/test-video.mp4' }],
      createdDate: file.createdDate,
    },
  ]);
  await page.goto('/video?conversation=95');
  await expect(page.locator('.video-result')).toHaveCount(1);
  await expect(page.locator('.media-answer-card')).toHaveCount(0);
  expect(state.sends).toHaveLength(0);
});

test('reloaded image page reveals completed output without a final socket event or another send', async ({
  page,
}) => {
  const state = await mockApi(page);
  const conversation: IConversation = { ...savedConversation(101), status: 'LOADING' };
  state.conversations.push(conversation);
  state.messages.set(101, [
    { id: 20, role: 'USER', text: 'Generate a cup', createdDate: new Date().toISOString() },
  ]);
  await page.goto('/image?conversation=101');
  await expect(page.locator('.image-result-pending')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.image-result-pending')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Активные работы: 1' })).toBeVisible();
  conversation.status = 'LOADED';
  state.messages.get(101)!.push({
    id: 21,
    role: 'ASSISTANT',
    text: 'Готово',
    files: [file],
    createdDate: new Date().toISOString(),
  });
  await expect(page.locator('.image-result-pending')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('.image-result')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Добавить изображение', exact: true })).toBeEnabled();
  expect(state.sends).toHaveLength(0);
});

test('history menus close outside and on Escape without blocking actions', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation(), { ...savedConversation(), id: 102, name: 'Second work' });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/history');
    const menus = page.locator('.history-actions');
    await menus.first().locator('summary').click();
    await expect(menus.first()).toHaveAttribute('open', '');
    await page.getByRole('textbox', { name: 'Поиск по названию и запросу' }).click();
    await expect(page.locator('.history-actions[open]')).toHaveCount(0);
    await menus.first().locator('summary').click();
    await menus.last().locator('summary').click();
    await expect(menus.first()).not.toHaveAttribute('open');
    await expect(menus.last()).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('.history-actions[open]')).toHaveCount(0);
    await expect(menus.last().locator('summary')).toBeFocused();
    await menus.first().locator('summary').click();
    await menus.first().getByRole('button', { name: 'Переименовать', exact: true }).click();
    await expect(page.getByLabel('Новое название')).toBeVisible();
    await expect(page.locator('.history-actions[open]')).toHaveCount(0);
  }
});

test('history searches all server pages by title or prompt and resets pagination for a new query', async ({
  page,
}) => {
  await mockApi(page);
  const requests: Array<{ page: number; conditions: any; search: string | null }> = [];
  await page.route('**/api/conversation?**', async (route) => {
    const url = new URL(route.request().url());
    const conditions = JSON.parse(url.searchParams.get('conditions') || '{}');
    const index = Number(url.searchParams.get('pageIndex'));
    requests.push({ page: index, conditions, search: url.searchParams.get('search') });
    const pattern = url.searchParams.get('search');
    const match = pattern === 'РЕДКАЯ';
    const items = pattern
      ? match
        ? [{ ...savedConversation(), id: 200, name: 'Работа, найденная по промпту' }]
        : []
      : [{ ...savedConversation(), name: `Работа страницы ${index}` }];
    await route.fulfill({
      json: {
        ...pagination(items),
        pages: pattern ? (match ? 1 : 0) : 3,
        pageIndex: index,
        total: pattern ? items.length : 60,
      },
    });
  });
  await page.goto('/history');
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Работа страницы 1' })).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Поиск по названию и запросу' });
  await search.fill('  РЕДКАЯ  ');
  await expect(page.getByRole('heading', { name: 'Работа, найденная по промпту' })).toBeVisible();
  expect(requests.at(-1)).toMatchObject({
    page: 0,
    conditions: { userId: 7 },
    search: 'РЕДКАЯ',
  });
  await page.getByRole('button', { name: 'В работе', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.conditions.status).toBe('LOADING');
  expect(requests.at(-1)?.search).toBe('РЕДКАЯ');
  await search.fill('100%_test');
  await expect(page.getByRole('heading', { name: 'Ничего не найдено' })).toBeVisible();
  expect(requests.at(-1)?.search).toBe('100%_test');
  await page.getByRole('button', { name: 'Сбросить поиск' }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Работа страницы 0' })).toBeVisible();
  expect(requests.at(-1)?.search).toBeNull();
});

test(
  'history ignores browser flags, persists archive and rolls back failed patches',
  { tag: '@smoke' },
  async ({ page }) => {
    const state = await mockApi(page);
    state.conversations.push(savedConversation());
    await page.addInitScript(() =>
      localStorage.setItem(
        'genfactory.preferences.v1.7',
        JSON.stringify({ favorites: [101], archive: [101] }),
      ),
    );
    await page.goto('/history');
    const card = page.locator('.history-card');
    await expect(card).toBeVisible();
    await expect(card.locator('.history-favorite-mark')).toHaveCount(0);
    await card.locator('summary').click();
    await expect(card.getByRole('button', { name: 'В избранное', exact: true })).toHaveCount(0);
    await card.getByRole('button', { name: 'В архив', exact: true }).click();
    await expect.poll(() => state.patches).toEqual([{ isArchived: true }]);
    await page.getByRole('button', { name: 'Архив', exact: true }).click();
    await expect(card).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Архив', exact: true }).click();
    await expect(card).toBeVisible();
    await page.route('**/api/conversation/101', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      await route.fulfill({ status: 500, json: { message: 'Save failed' } });
    });
    await card.locator('summary').click();
    await card.getByRole('button', { name: 'Вернуть из архива', exact: true }).click();
    await expect(page.locator('.work-history > [role="alert"]')).toBeVisible();
    await expect(card).toBeVisible();
    expect(state.conversations[0].isArchived).toBe(true);
  },
);

test(
  'late video remains pending across reload and appears after the conversation event without resubmitting',
  { tag: '@smoke' },
  async ({ page }) => {
    const state = await mockApi(page);
    const conversation: IConversation = { ...savedConversation(101), status: 'LOADING' };
    state.conversations.push(conversation);
    const request: IConversationMessage = {
      id: 20,
      role: 'USER',
      text: 'Animate the cup',
      createdDate: new Date(Date.now() - 16 * 60000).toISOString(),
    };
    state.messages.set(101, [request]);
    await page.goto('/video?conversation=101');
    await expect(page.locator('.image-result-pending')).toContainText('Видео ещё создаётся…');
    await expect(page.getByRole('textbox', { name: 'Идея ролика', exact: true })).toBeEnabled();
    await page.reload();
    await expect(page.locator('.image-result-pending')).toContainText('Видео ещё создаётся…');
    await expect.poll(() => !!state.socket).toBeTruthy();
    conversation.status = 'LOADED';
    state.messages.set(101, [
      request,
      {
        id: 21,
        role: 'ASSISTANT',
        text: 'Видео готово.',
        files: [{ ...file, type: 'VIDEO', mime: 'video/mp4', path: '/test-video.mp4' }],
        createdDate: new Date().toISOString(),
      },
    ]);
    state.socket!.send(
      '42/gnosisai,' +
        JSON.stringify([
          'transportSocketEvent',
          { uid: crypto.randomUUID(), name: 'ConversationChangedEvent', data: { id: 101, item: {} } },
        ]),
    );
    await expect(page.locator('.image-result-pending')).toHaveCount(0);
    await expect(page.locator('.image-result')).toHaveCount(1);
    await expect(page.getByRole('textbox', { name: 'Идея ролика', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Активные работы: 0' })).toBeVisible();
    expect(state.sends).toHaveLength(0);
    expect(state.creates).toHaveLength(0);
  },
);

for (const initialWriter of [true, false]) {
  test.skip(`content studio preserves writer changed during a pending request: ${initialWriter}`, async ({
    page,
  }) => {
    const state = await mockApi(page);
    state.scriptReply = 'Длительность: 8 с. Действие: чашка вращается. Камера: статичная.';
    const conversation = savedConversation();
    conversation.options.tools = [];
    state.conversations.push(conversation);
    await page.goto('/chat?conversation=101');
    await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
    const writer = page.getByRole('switch', { name: 'Сценарист', exact: true });
    await expect(writer).toHaveAttribute('aria-checked', 'true');
    if (!initialWriter) await writer.click();
    let release!: () => void;
    const response = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/conversation/101/message', async (route) => {
      if (route.request().method() === 'POST') await response;
      await route.fallback();
    });
    await page.locator('#cw-draft').fill('Чашка вращается');
    const request = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().endsWith('/conversation/101/message'),
    );
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await request;
    await writer.click();
    await expect(writer).toHaveAttribute('aria-checked', String(!initialWriter));
    release();
    await expect(page.locator('#cw-draft')).toHaveValue('');
    await expect(writer).toHaveAttribute('aria-checked', String(!initialWriter));
    expect(state.sends[0].text.startsWith('[Genfactory:script]')).toBe(initialWriter);
    await page.locator('#cw-draft').fill('Следующий кадр с чашкой');
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect.poll(() => state.sends.length).toBe(2);
    expect(state.sends[1].text.startsWith('[Genfactory:script]')).toBe(!initialWriter);
    expect(state.sends[1].settings.tools.length).toBe(initialWriter ? 1 : 0);
    await expect(page.locator('#cw-draft')).toHaveValue('');
    await page.reload();
    await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
    await expect(writer).toHaveAttribute('aria-checked', String(!initialWriter));
  });
}

for (const hasCurrent of [false, true]) {
  test(`content studio applies script with earlier references and preserves current selection: ${hasCurrent}`, async ({
    page,
  }) => {
    const state = await mockApi(page);
    const conversation = savedConversation();
    conversation.options.tools = [];
    state.conversations.push(conversation);
    state.messages.set(101, [
      {
        id: 1,
        role: 'USER',
        text: '[Genfactory:script]\nЗапрос пользователя:\nОживи чашку',
        files: [file],
        createdDate: file.createdDate,
      },
      { id: 2, role: 'ASSISTANT', text: 'Какое движение?', createdDate: file.createdDate },
      {
        id: 3,
        role: 'USER',
        text: '[Genfactory:script]\nЗапрос пользователя:\nМедленное вращение',
        createdDate: file.createdDate,
      },
      {
        id: 4,
        role: 'ASSISTANT',
        text: 'Длительность: 8 с. Действие: чашка вращается. Камера: статичная.',
        createdDate: file.createdDate,
      },
    ]);
    await page.route('**/api/conversation/101/message?*', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const pageIndex = Number(new URL(route.request().url()).searchParams.get('pageIndex') || 0);
      const items = state.messages
        .get(101)!
        .filter((item) => (pageIndex === 0 ? item.id > 2 : item.id <= 2))
        .reverse();
      await route.fulfill({ json: { ...pagination(items), pages: 2, total: 4, pageIndex } });
    });
    await page.goto('/chat?conversation=101');
    if (hasCurrent)
      await page
        .locator('input[type=file]')
        .setInputFiles({ name: 'current.png', mimeType: 'image/png', buffer: Buffer.from('fake') });
    await page.getByRole('button', { name: 'Использовать сценарий', exact: true }).click();
    await expect(page.locator('.cw-action-mode')).toHaveCount(0);
    await expect(page.locator('.cw-send')).toHaveText('');
    await expect(page.locator('.cw-files')).toContainText(hasCurrent ? 'current.png' : file.name);
    expect(state.sends).toHaveLength(0);
    await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Сценарист', exact: true })).toHaveCount(0);
  });
}

for (const status of ['HIDDEN', 'DISABLED'] as const) {
  test(`saved ${status} model remains visible after reload without replacement`, async ({ page }) => {
    const state = await mockApi(page);
    const retained = { ...catalog[0], status };
    state.conversations.push(savedConversation());
    await page.route('**/api/aimodels?*', (route) => {
      if (catalogProvider(route.request().url()) !== retained.reference.provider) return route.fallback();
      return route.fulfill({
        json: catalogPage(
          catalog.filter(
            (m) =>
              m.reference.provider === retained.reference.provider &&
              m.reference.model !== retained.reference.model,
          ),
        ),
      });
    });
    await page.route('**/api/aimodels/details?*', (route) => route.fulfill({ json: retained }));
    await page.goto('/image?conversation=101&studio=advanced');
    await expect(page.getByLabel('Модель', { exact: true })).toContainText(retained.name);
    await page.reload();
    await expect(page.getByLabel('Модель', { exact: true })).toContainText(retained.name);
    await page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ }).fill('Keep this saved model');
    await page
      .getByRole('button', { name: /^(Создать изображение|Собрать изображение)$/, exact: true })
      .click();
    if (status === 'DISABLED') {
      await expect(page.getByRole('alert')).toContainText('Модель отключена администратором');
      expect(state.sends).toHaveLength(0);
      expect(state.creates).toHaveLength(0);
    } else {
      const choice = page
        .getByRole('dialog', { name: 'Использовать предыдущий результат?' })
        .getByRole('button', { name: 'Создать с нуля', exact: true });
      if (await choice.isVisible()) {
        await choice.click();
        await page
          .getByRole('button', { name: /^(Создать изображение|Собрать изображение)$/, exact: true })
          .click();
      }
      await expect.poll(() => state.sends.length).toBe(1);
      expect(state.sends[0].settings.tools[0].settings.model).toEqual(retained.reference);
      expect(state.sends[0].settings.tools[0].settings.options.quality).toBe('high');
    }
    await page.screenshot({ path: `test-results/model-status-${status}.png`, fullPage: true });
  });
}

test('model status events refresh the catalogue without replacing a saved selection or sending', async ({
  page,
}) => {
  const state = await mockApi(page);
  const retained = {
    ...catalog.find((model) => model.reference.provider === 'OPEN_ROUTER_IMAGE')!,
    status: 'DISABLED' as const,
  };
  state.conversations.push(savedConversation());
  let disabled = false;
  await page.route('**/api/aimodels?*', (route) => {
    if (catalogProvider(route.request().url()) !== retained.reference.provider) return route.fallback();
    return route.fulfill({
      json: catalogPage(
        catalog.filter(
          (m) =>
            m.reference.provider === retained.reference.provider &&
            (!disabled || m.reference.model !== retained.reference.model),
        ),
      ),
    });
  });
  await page.route('**/api/aimodels/details?*', (route) => route.fulfill({ json: retained }));
  await page.goto('/image?conversation=101&studio=advanced');
  await expect(page.getByLabel('Модель', { exact: true })).toContainText(modelTitle(retained));
  await expect.poll(() => !!state.socket).toBe(true);
  disabled = true;
  state.socket!.send(
    '42/gnosisai,' +
      JSON.stringify([
        'transportSocketEvent',
        {
          uid: 'model-status',
          name: 'AiModelChangedEvent',
          data: { reference: retained.reference, status: 'DISABLED' },
        },
      ]),
  );
  await expect(page.getByRole('option', { name: modelTitle(retained), exact: true })).toBeDisabled();
  await page
    .getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ })
    .fill('Do not submit this disabled model');
  await page
    .getByRole('button', { name: /^(Создать изображение|Собрать изображение)$/, exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Модель отключена администратором');
  expect(state.sends).toHaveLength(0);
  expect(state.creates).toHaveLength(0);
});

for (const status of ['HIDDEN', 'DISABLED'] as const) {
  test(`content studio restores saved ${status} model and its options`, async ({ page }) => {
    const state = await mockApi(page);
    const retained = { ...catalog[0], name: 'Saved image model', status };
    state.conversations.push(savedConversation());
    await page.route('**/api/aimodels?*', (route) => {
      if (catalogProvider(route.request().url()) !== retained.reference.provider) return route.fallback();
      return route.fulfill({
        json: catalogPage(
          catalog.filter(
            (m) =>
              m.reference.provider === retained.reference.provider &&
              m.reference.model !== retained.reference.model,
          ),
        ),
      });
    });
    await page.route('**/api/aimodels/details?*', (route) => route.fulfill({ json: retained }));
    await page.goto('/chat?conversation=101');
    await expect(page.getByRole('button', { name: `Модель: ${retained.name}`, exact: true })).toBeVisible();
    await page.locator('#cw-draft').fill('Continue with this saved model');
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    if (status === 'DISABLED') {
      await expect(page.getByRole('alert')).toContainText('Модель отключена администратором');
      expect(state.sends).toHaveLength(0);
    } else {
      await expect.poll(() => state.sends.length).toBe(1);
      expect(state.sends[0].settings.tools[0].settings.model).toEqual(retained.reference);
      expect(state.sends[0].settings.tools[0].settings.options.quality).toBe('high');
    }
  });
}

for (const sameUrl of [false, true]) {
  test(`content studio does not send after leaving a pending creation, same URL: ${sameUrl}`, async ({
    page,
  }) => {
    const state = await mockApi(page);
    state.conversations.push(savedConversation(102));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;
    await page.route('**/api/conversation', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      entered = true;
      await gate;
      return route.fallback();
    });
    await page.goto('/chat');
    await page.getByRole('button', { name: 'Изображение', exact: true }).click();
    await page.locator('#cw-draft').fill('A draft that must not be sent after navigation');
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect.poll(() => entered).toBe(true);
    const oldKey = await page.evaluate(() => history.state.key);
    if (sameUrl) {
      await page.getByRole('link', { name: 'Студия контента', exact: true }).click();
      await expect.poll(() => page.evaluate(() => history.state.key)).not.toBe(oldKey);
    } else {
      await page.evaluate(() => {
        history.pushState({ key: 'another-project' }, '', '/chat?conversation=102');
        dispatchEvent(new PopStateEvent('popstate'));
      });
      await expect(page).toHaveURL(/conversation=102/);
    }
    const completed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/conversation' && response.request().method() === 'POST',
    );
    release();
    await completed;
    await expect(page.locator('#cw-draft')).toBeEnabled();
    expect(state.sends).toHaveLength(0);
    await expect(page).toHaveURL(sameUrl ? /\/chat$/ : /conversation=102/);
  });
}

for (const existing of [false, true]) {
  test(`content studio ${existing ? 'keeps the model of an existing conversation' : 'creates new conversations with Claude Opus through OpenRouter'}`, async ({
    page,
  }) => {
    const state = await mockApi(page);
    const opus = structuredClone(agent);
    opus.reference = { provider: 'OPEN_ROUTER_CONVERSATION', model: 'anthropic/claude-opus-5.5' };
    opus.name = 'Claude Opus 5.5';
    opus.status = 'ACTIVE';
    opus.schema.properties!.model = { type: 'string', const: opus.reference.provider };
    opus.schema.properties!.options.properties!.model = {
      type: 'string',
      enum: [opus.reference.model],
      default: opus.reference.model,
    };
    await page.route('**/api/aimodels?*', (route) => {
      if (catalogProvider(new URL(route.request().url())) === 'OPEN_ROUTER_CONVERSATION')
        return route.fulfill({ json: catalogPage([opus]) });
      return route.fallback();
    });
    if (existing)
      state.conversations.push({
        ...savedConversation(),
        options: { model: 'deepseek/deepseek-chat', tools: [] },
      });
    await page.goto(existing ? '/chat?conversation=101' : '/chat');
    await page.locator('#cw-draft').fill('Предложи короткую идею для рекламы чашки');
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect.poll(() => state.sends.length).toBe(1);
    if (existing) {
      expect(state.creates).toHaveLength(0);
      expect(state.conversations[0].model).toBe(agent.reference.provider);
      expect(state.conversations[0].options.model).toBe('deepseek/deepseek-chat');
    } else {
      expect(state.creates).toHaveLength(1);
      expect(state.creates[0]).toMatchObject({
        model: opus.reference.provider,
        options: { model: opus.reference.model },
      });
    }
  });
}

for (const savedError of [true, false]) {
  test(`content studio shows a failed request once, saved error: ${savedError}`, async ({ page }) => {
    const state = await mockApi(page);
    const conversation = savedConversation();
    conversation.options.tools = [];
    state.conversations.push(conversation);
    let posts = 0;
    await page.route('**/api/conversation/101/message', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      posts++;
      conversation.status = 'ERROR';
      if (savedError) conversation.error = { code: 'AI_VENDOR_ERROR', message: 'Provider returned error' };
      await route.fulfill({ status: 502, json: { message: 'Service unavailable' } });
    });
    await page.goto('/chat?conversation=101');
    await page.locator('#cw-draft').fill('Проверка единственного сообщения об ошибке');
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect(page.locator('.content-error')).toBeVisible();
    await expect(page.locator('.content-feedback.error')).toHaveCount(0);
    await expect(page.locator('#cw-draft')).toHaveValue('Проверка единственного сообщения об ошибке');
    expect(posts).toBe(1);
    await page.reload();
    await expect(page.locator('.content-error')).toBeVisible();
    await expect(page.locator('.content-feedback.error')).toHaveCount(0);
    expect(posts).toBe(1);
  });
}

test('content studio keeps an unconfirmed transport error beside the draft', async ({ page }) => {
  const state = await mockApi(page);
  const conversation = savedConversation();
  conversation.options.tools = [];
  state.conversations.push(conversation);
  let posts = 0;
  await page.route('**/api/conversation/101/message', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts++;
    await route.abort('failed');
  });
  await page.goto('/chat?conversation=101');
  await page.locator('#cw-draft').fill('Сохранить черновик при обрыве связи');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect(page.locator('.content-feedback.error')).toBeVisible();
  await expect(page.locator('.content-error')).toHaveCount(0);
  await expect(page.locator('#cw-draft')).toHaveValue('Сохранить черновик при обрыве связи');
  expect(posts).toBe(1);
});

test('content studio shows progress on the send button and restores the arrow after completion', async ({
  page,
}) => {
  const state = await mockApi(page);
  const conversation = { ...savedConversation(), status: 'LOADING' as IConversation['status'] };
  conversation.options.tools = [];
  state.conversations.push(conversation);
  state.messages.set(101, [
    { id: 1, role: 'USER', text: 'Подготовь идею', files: [], createdDate: file.createdDate },
  ]);
  await page.goto('/chat?conversation=101');
  const send = page.getByRole('button', { name: 'Отправить запрос', exact: true });
  await expect(send).toHaveAttribute('aria-busy', 'true');
  await expect(send.locator('.spinner')).toBeVisible();
  await expect(send).toBeDisabled();
  await expect(page.getByText('Ассистент работает…', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(send.locator('.spinner')).toBeVisible();
  await expect.poll(() => state.joinedRooms.includes('conversation101') && !!state.socket).toBe(true);
  conversation.status = 'LOADED';
  state.socket!.send(
    '42/gnosisai,' +
      JSON.stringify([
        'transportSocketEvent',
        {
          uid: crypto.randomUUID(),
          name: 'ConversationChangedEvent',
          data: { id: 101, item: { status: 'LOADED' } },
        },
      ]),
  );
  await expect(send).toHaveAttribute('aria-busy', 'false');
  await expect(send.locator('.spinner')).toHaveCount(0);
  await page.locator('#cw-draft').fill('Следующий запрос');
  await expect(send).toBeEnabled();
  expect(state.sends).toHaveLength(0);
});

for (const width of [1440, 390])
  test(`content studio attachment preview and bottom blur ${width}`, async ({ page }, testInfo) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/chat');
    await page.getByRole('button', { name: 'Изображение', exact: true }).click();
    await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
    await selectLibraryFile(page, 'Test result');
    const tile = page.locator('.cw-files .composer-attachment');
    await expect(tile.locator('img')).toBeVisible();
    await tile.getByRole('button', { name: 'Открыть Test result', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Test result', exact: true }).locator('img')).toBeVisible();
    await page
      .getByRole('dialog', { name: 'Test result', exact: true })
      .getByRole('button', { name: 'Закрыть', exact: true })
      .click();
    const blur = await page.locator('#creatives .cw-chat').evaluate((el) => {
      const css = getComputedStyle(el, '::after');
      return {
        blur: css.backdropFilter || css.getPropertyValue('-webkit-backdrop-filter'),
        events: css.pointerEvents,
        background: css.backgroundImage,
      };
    });
    expect(blur.blur).toBe('blur(8px)');
    expect(blur.events).toBe('none');
    expect(blur.background).toContain('linear-gradient');
    await page.locator('#cw-draft').fill('Новый запрос');
    await page.screenshot({ path: testInfo.outputPath(`attachments-${width}.png`) });
    await tile.getByRole('button', { name: 'Убрать Test result', exact: true }).click();
    await expect(tile).toHaveCount(0);
    expect(state.sends).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

test('content studio binds all four Seedance references to the required VIDEO call', async ({ page }) => {
  const state = await mockApi(page);
  const seedance = structuredClone(catalog.find((m) => m.reference.model === 'bytedance/seedance-2.5')!);
  seedance.schema.properties!.task!.properties!.fileIds = {
    type: 'array',
    maxItems: 30,
    items: { type: 'integer' },
  };
  seedance.schema.properties!.task!.properties!.referenceMode = {
    type: 'string',
    enum: ['frames', 'references'],
  };
  seedance.schema.properties!.options!.properties!.inputReferences = {
    type: 'array',
    maxItems: 30,
    items: {
      type: 'object',
      properties: { url: { type: 'string' }, type: { const: 'image' } },
      required: ['url', 'type'],
    },
  };
  const files = [14, 8, 23, 6].map((id) => ({ ...file, id, name: `Фото ${id}` }));
  await page.route('**/api/aimodels?*', (route) => {
    const provider = catalogProvider(new URL(route.request().url()));
    const items =
      provider === 'OPEN_ROUTER_VIDEO'
        ? [seedance]
        : provider === 'OPEN_ROUTER_CONVERSATION'
          ? [agent]
          : catalog.filter((m) => m.reference.provider === provider);
    return route.fulfill({ json: catalogResponse(route.request().url(), items) });
  });
  await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination(files) }));
  await page.route(/\/api\/file\/\d+$/, (route) =>
    route.fulfill({ json: files.find((file) => file.id === Number(route.request().url().split('/').pop())) }),
  );
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Видео', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Библиотека' });
  for (const id of [14, 8, 23, 6]) {
    await picker.getByText(`Фото ${id}`, { exact: true }).click();
  }
  await expect(picker.getByRole('status')).toContainText('Выбрано: 4');
  await expect(page.locator('.cw-files .composer-attachment')).toHaveCount(0);
  await picker.getByRole('button', { name: 'Добавить (4)', exact: true }).click();
  await expect(page.locator('.cw-files .composer-attachment img')).toHaveCount(4);
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();

  await page.locator('#cw-draft').fill('Все предметы в одной сцене');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([14, 8, 23, 6]);
  expect(parseStudioContext(state.sends[0].text)?.input).toEqual({
    fileIds: [14, 8, 23, 6],
    referenceMode: 'references',
  });
  expect(state.sends[0].settings.tools[0].isRequired).not.toBe(true);
  expect(state.creates[0].options.tools[0]).not.toHaveProperty('input');
});

for (const referenceMode of ['references', 'frames'] as const)
  test(`content studio restores video ${referenceMode} without changing conditioning`, async ({ page }) => {
    const state = await mockApi(page);
    const seedance = structuredClone(catalog.find((m) => m.reference.model === 'bytedance/seedance-2.5')!);
    seedance.schema.properties!.task!.properties!.fileIds = {
      type: 'array',
      maxItems: 30,
      items: { type: 'integer' },
    };
    seedance.schema.properties!.options!.properties!.inputReferences = {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        properties: { url: { type: 'string' }, type: { const: 'image' } },
        required: ['url', 'type'],
      },
    };
    const files = (referenceMode === 'references' ? [14, 8, 23, 6] : [14, 8]).map((id) => ({
      ...file,
      id,
      path: `/media/gallery-${id === 14 ? 1 : 2}.jpg`,
      name: `Source ${id}`,
    }));
    const conditioning =
      referenceMode === 'references'
        ? { inputReferences: files.map((f) => ({ url: f.path, type: 'image' })) }
        : {
            frameImages: files.map((f, i) => ({ url: f.path, type: i === 0 ? 'first_frame' : 'last_frame' })),
          };
    const generation = {
      model: seedance.reference,
      prompt: 'Historical video scene',
      options: { duration: 4, resolution: '480p', ...conditioning },
    };
    state.conversations.push(savedConversation());
    state.messages.set(101, [
      { id: 1, role: 'USER', text: 'Бриф', files, createdDate: file.createdDate },
      {
        id: 2,
        role: 'ASSISTANT',
        text: 'Готово',
        files: [
          {
            ...file,
            id: 99,
            name: 'Historical.mp4',
            type: 'VIDEO',
            mime: 'video/mp4',
            path: '/test-video.mp4',
            origin: { kind: 'GENERATION', sourceFileIds: files.map((f) => f.id), generation },
          },
        ],
        createdDate: file.createdDate,
      },
    ]);
    await page.route('**/api/aimodels?*', (route) => {
      const provider = catalogProvider(new URL(route.request().url()));
      return route.fulfill({
        json: catalogResponse(
          route.request().url(),
          provider === 'OPEN_ROUTER_VIDEO'
            ? [seedance]
            : provider === 'OPEN_ROUTER_CONVERSATION'
              ? [agent]
              : catalog.filter((m) => m.reference.provider === provider),
        ),
      });
    });
    await page.route(/\/api\/file\/\d+$/, (route) =>
      route.fulfill({ json: files.find((f) => f.id === Number(route.request().url().split('/').pop())) }),
    );
    await page.goto('/chat?conversation=101');
    await page.getByRole('button', { name: 'Использовать параметры', exact: true }).click();
    await expect(page.locator('#cw-draft')).toHaveValue(generation.prompt);
    await expect(page.locator('.cw-files .composer-attachment')).toHaveCount(files.length);
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect.poll(() => state.sends.length).toBe(1);
    expect(parseStudioContext(state.sends[0].text)?.input).toEqual({
      fileIds: files.map((f) => f.id),
      referenceMode,
    });
  });

for (const restored of [false, true])
  test(`content studio keeps writer disabled and hidden, restored draft: ${restored}`, async ({ page }) => {
    const state = await mockApi(page);
    if (restored)
      await page.addInitScript(() =>
        localStorage.setItem(
          'genfactory.draft.v1.7.content-studio.new',
          JSON.stringify({
            version: 1,
            at: new Date().toISOString(),
            value: { mode: 'video', writer: true, draft: 'Старый черновик' },
          }),
        ),
      );
    await page.goto('/chat');
    if (restored) await expect(page.locator('#cw-draft')).toHaveValue('');
    await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Сценарист', exact: true })).toHaveCount(0);
    await page.locator('#cw-draft').fill('Чашка вращается');
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect.poll(() => state.sends.length).toBe(1);
    expect(state.sends[0].settings.tools[0]).toMatchObject({ uid: 'VIDEO' });
    expect(state.sends[0].settings.isToolsDisabled).not.toBe(true);
    expect(state.sends[0].text).not.toContain('[Genfactory:script]');
    await page.reload();
    await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Сценарист', exact: true })).toHaveCount(0);
  });

for (const width of [1440, 390])
  test(`studio agent question choices survive reload and preserve the request ${width}`, async ({
    page,
  }, testInfo) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width, height: 1000 });
    const context = {
      uid: 'VIDEO',
      settings: {
        model: catalog.find((m) => m.reference.model === 'bytedance/seedance-2.5')!.reference,
        options: { duration: 4, resolution: '480p' },
        isLockSelection: true,
      },
      input: { fileIds: [12], referenceMode: 'references' },
    };
    const question = {
      kind: 'question',
      question: 'На чём сделать акцент?',
      choices: ['На товаре', 'На атмосфере', 'На подарке'],
      allowAuto: true,
      context,
    };
    state.conversations.push({
      ...savedConversation(),
      tags: ['genfactory', 'content-studio'],
      options: { model: agent.reference.model, tools: [{ uid: context.uid, settings: context.settings }] },
    });
    state.messages.set(101, [
      {
        id: 1,
        role: 'USER',
        text: withStudioContext('Сделай рекламу чашки', context as any),
        files: [file],
        createdDate: file.createdDate,
      },
      {
        id: 2,
        role: 'ASSISTANT',
        text: '[Genfactory:studio-question:v1]\n' + JSON.stringify({ ...question, context: undefined }),
        createdDate: file.createdDate,
      },
    ]);
    await page.goto('/chat?conversation=101');
    await page.reload();
    const card = page.getByRole('group', { name: question.question });
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: 'Выбери сам', exact: true })).toBeVisible();
    await expect(page.locator('.cw-thread')).not.toContainText('[Genfactory:studio-question');
    await expect(card).toContainText('Seedance 2.5');
    await page.screenshot({ path: testInfo.outputPath(`studio-question-${width}.png`) });
    await card.getByRole('button', { name: 'На товаре', exact: true }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect.poll(() => state.sends.length).toBe(1);
    expect(state.sends[0].settings).not.toHaveProperty('studioAnswerTo');
    expect(state.sends[0].settings.tools[0]).toEqual({ uid: context.uid, settings: context.settings });
    expect(parseStudioContext(state.sends[0].text)).toEqual(context);
    expect(state.sends[0].files).toEqual([12]);
    await expect(card.getByRole('button', { name: 'На товаре', exact: true })).toBeDisabled();
    expect(state.sends).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

test('studio agent factual question allows a custom answer but no automatic decision', async ({ page }) => {
  const state = await mockApi(page);
  const context = {
    uid: 'IMAGE',
    settings: {
      model: catalog.find((m) => m.reference.provider === 'OPEN_ROUTER_IMAGE')!.reference,
      isLockSelection: true,
      options: {},
    },
    input: { request: { task: { fileIds: [] } }, isDrawNew: true },
  };
  const question = {
    kind: 'question',
    question: 'Какую цену указать?',
    choices: ['Без цены', 'Место для цены'],
    allowAuto: false,
    context,
  };
  state.conversations.push({
    ...savedConversation(),
    tags: ['content-studio'],
    options: { model: agent.reference.model, tools: [{ uid: 'IMAGE', settings: context.settings }] },
  });
  state.messages.set(101, [
    { id: 1, role: 'USER', text: 'Нужен баннер с ценой', createdDate: file.createdDate },
    {
      id: 2,
      role: 'ASSISTANT',
      text: '[Genfactory:studio-question:v1]\n' + JSON.stringify(question),
      createdDate: file.createdDate,
    },
  ]);
  await page.goto('/chat?conversation=101');
  const card = page.getByRole('group', { name: question.question });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Выбери сам' })).toHaveCount(0);
  await card.getByRole('textbox', { name: 'Свой ответ' }).fill('Цена 1500 рублей');
  await card.getByRole('button', { name: 'Ответить', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].text).toContain('Цена 1500 рублей');
  expect(state.sends[0].settings).not.toHaveProperty('studioAnswerTo');
});

test('studio agent historical question cannot trigger another generation', async ({ page }) => {
  const state = await mockApi(page);
  const context = {
    uid: 'VIDEO',
    settings: {
      model: catalog.find((m) => m.reference.provider === 'OPEN_ROUTER_VIDEO')!.reference,
      isLockSelection: true,
    },
    input: { fileIds: [] },
  };
  const question = {
    kind: 'question',
    question: 'Какой фон?',
    choices: ['Светлый', 'Тёмный'],
    allowAuto: true,
    context,
  };
  state.conversations.push({ ...savedConversation(), tags: ['content-studio'] });
  state.messages.set(101, [
    {
      id: 1,
      role: 'ASSISTANT',
      text: '[Genfactory:studio-question:v1]\n' + JSON.stringify(question),
      createdDate: file.createdDate,
    },
    { id: 2, role: 'USER', text: 'Светлый', createdDate: file.createdDate },
    { id: 3, role: 'ASSISTANT', text: 'Готово.', files: [file], createdDate: file.createdDate },
  ]);
  await page.goto('/chat?conversation=101');
  const card = page.getByRole('group', { name: question.question });
  await expect(card.getByRole('button', { name: 'Светлый', exact: true })).toBeDisabled();
  await expect(card.getByRole('textbox', { name: 'Свой ответ' })).toHaveCount(0);
  expect(state.sends).toHaveLength(0);
});

test('studio blocks attachment removal during a pending request and clears accepted references', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  await page.goto('/chat?conversation=101');
  await page.getByRole('button', { name: 'Изображение', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  await selectLibraryFile(page, 'Test result');
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  let sent = false;
  await page.route('**/api/conversation/101/message', async (route) => {
    if (route.request().method() === 'POST') {
      sent = true;
      await wait;
    }
    await route.fallback();
  });
  await page.locator('#cw-draft').fill('Измени фон');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => sent).toBe(true);
  const tile = page.locator('.cw-files .composer-attachment');
  const remove = tile.getByRole('button', { name: 'Убрать Test result', exact: true });
  await expect(remove).toBeDisabled();
  await expect(remove).toHaveCSS('opacity', '0.4');
  await expect(remove).toHaveCSS('cursor', 'default');
  await tile.getByRole('button', { name: 'Открыть Test result', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Test result', exact: true }).locator('img')).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Test result', exact: true })
    .getByRole('button', { name: 'Закрыть', exact: true })
    .click();
  await expect(tile).toHaveCount(1);
  release();
  await expect.poll(() => state.sends.length).toBe(1);
  await expect(tile).toHaveCount(0);
  await expect(page.locator('#cw-draft')).toHaveValue('');
  expect(state.sends[0].files).toEqual([12]);
  await page.reload();
  await expect(page.locator('.cw-files')).toHaveCount(0);
});

test('studio clears new conversations and removes restored existing references permanently', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  await page.goto('/chat?conversation=101');
  // Wait for project/model restoration before testing edits to its saved draft.
  await expect(page.locator('.cw-model')).toContainText('Riverflow V2.6 Pro');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('genfactory.draft.v1.7.content-studio.101') || 'null')?.value
            .selectedModel,
      ),
    )
    .toBe('OPEN_ROUTER_IMAGE:sourceful/riverflow-v2.6-pro');
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  await selectLibraryFile(page, 'Test result');
  await page.locator('#cw-draft').fill('Старый текст');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('genfactory.draft.v1.7.content-studio.101') || ''))
    .toContain('Test result');
  await page.reload();
  const remove = page.getByRole('button', { name: 'Убрать Test result', exact: true });
  await expect(remove).toBeEnabled();
  await remove.click();
  await expect(page.locator('.cw-files')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.cw-files')).toHaveCount(0);
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  await selectLibraryFile(page, 'Test result');
  await page.locator('a.shell-nav-item[href="/chat"]').first().click();
  await expect(page.locator('#cw-draft')).toHaveValue('');
  await expect(page.locator('.cw-files')).toHaveCount(0);
  await page.locator('#cw-draft').fill('Еще один черновик');
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  await selectLibraryFile(page, 'Test result');
  await page.locator('a.shell-nav-item[href="/chat"]').first().click();
  await expect(page.locator('#cw-draft')).toHaveValue('');
  await expect(page.locator('.cw-files')).toHaveCount(0);
  await page.locator('#cw-draft').fill(Array(20).fill('Длинная строка').join('\n'));
  const dimensions = await page.locator('#cw-draft').evaluate((el) => ({
    line: parseFloat(getComputedStyle(el).lineHeight),
    height:
      el.clientHeight -
      parseFloat(getComputedStyle(el).paddingTop) -
      parseFloat(getComputedStyle(el).paddingBottom),
    scroll: el.scrollHeight,
  }));
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.line * 3 + 1);
  expect(dimensions.scroll).toBeGreaterThan(dimensions.height);
  await page.screenshot({ path: testInfo.outputPath('compact-composer.png') });
  expect(state.sends).toHaveLength(0);
});

test('studio can remove a restored reference while metadata is delayed without resurrecting it', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  await page.goto('/chat?conversation=101');
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  await selectLibraryFile(page, 'Test result');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('genfactory.draft.v1.7.content-studio.101')))
    .toContain('Test result');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/file/12', async (route) => {
    await gate;
    await route.fulfill({ json: file });
  });
  const requested = page.waitForRequest('**/api/file/12');
  await page.reload();
  await requested;
  const remove = page.getByRole('button', { name: 'Убрать Test result', exact: true });
  await expect(remove).toBeEnabled();
  await remove.click();
  await expect(page.locator('.cw-files')).toHaveCount(0);
  release();
  await expect(page.getByRole('button', { name: 'Добавить файл', exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.locator('.cw-files')).toHaveCount(0);
});

for (const mime of ['text/plain', 'text/markdown'])
  test(`history opens a generated ${mime} document as text`, async ({ page }) => {
    const state = await mockApi(page);
    const text = '# План\n<script>Только текст</script>\nПоследняя строка.';
    const document = {
      ...file,
      type: 'DOCUMENT',
      mime,
      name: mime === 'text/plain' ? 'План.txt' : 'План.md',
    };
    state.conversations.push(savedConversation());
    state.messages.set(101, [
      { id: 2, role: 'ASSISTANT', text: 'Готово', createdDate: file.createdDate, files: [document] },
    ]);
    await page.route('**/api/file/12', (route) => route.fulfill({ json: document }));
    await page.route('**/api/file/12/text', (route) => route.fulfill({ json: { text } }));
    await page.route('**/api/file/12/content', (route) => route.fulfill({ contentType: mime, body: text }));
    await page.goto('/history');
    await page.getByRole('button', { name: 'Открыть результат Saved creative work', exact: true }).click();
    await expect(page.getByRole('dialog', { name: document.name })).toBeVisible();
    await expect(page.locator('.file-text-preview')).toHaveText(text);
    await expect(page.locator('.file-text-preview script')).toHaveCount(0);
    await expect(
      page.getByText('В этой беседе пока нет готового изображения или видео.', { exact: true }),
    ).toHaveCount(0);
    expect(state.sends).toHaveLength(0);
    expect(state.edits).toHaveLength(0);
  });

for (const width of [1440, 390])
  test(`all attachment editors share compact previews at ${width}`, async ({ page }) => {
    test.setTimeout(180_000);
    const state = await mockAudio(page);
    await page.setViewportSize({ width, height: 1000 });
    let source = file;
    await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([source]) }));
    const routes = [
      ['/chat', 'Добавить файл'],
      ['/image', 'Добавить изображение'],
      ['/video', 'Добавить кадр'],
      ['/agent', 'Добавить изображение'],
      ['/prompt', 'Добавить изображение или видео'],
      ['/script', 'Из библиотеки'],
      ['/audio?mode=stt', 'Из библиотеки'],
      ['/image?studio=advanced', 'Из библиотеки'],
      ['/video?studio=advanced', 'Из библиотеки'],
    ];
    for (const [index, [path, button]] of routes.entries()) {
      source = path.startsWith('/audio') ? { ...file, type: 'AUDIO', mime: 'audio/wav' } : file;
      await page.goto(path);
      await page.getByRole('button', { name: button, exact: true }).first().click();
      await selectLibraryFile(page, 'Test result');
      const attachment = page.locator('.composer-attachment').first();
      await expect(attachment).toBeVisible();
      await expect(attachment).toHaveCSS('height', '40px');
      await expect(attachment.locator('.composer-attachment-preview')).toHaveCSS('height', '30px');
      await expect(attachment.locator('.composer-attachment-caption')).toHaveCSS('white-space', 'nowrap');
      await expect(attachment.getByRole('button', { name: 'Убрать Test result', exact: true })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `/artifacts/attachments-${width}-${index}.png` });
      await attachment.locator('.composer-attachment-caption').click();
      const viewer = page.getByRole('dialog', { name: 'Test result', exact: true });
      await expect(viewer).toBeVisible();
      await expect(attachment).toHaveCount(1);
      await viewer.getByRole('button', { name: 'Закрыть', exact: true }).click();
      await expect(viewer).toHaveCount(0);
      await attachment.getByRole('button', { name: 'Убрать Test result', exact: true }).click();
      await expect(page.locator('.composer-attachment')).toHaveCount(0);
    }
    expect(state.sends).toHaveLength(0);
  });

test('studio preserves attachments and text when sending fails', async ({ page }) => {
  await mockApi(page);
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Изображение', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  await selectLibraryFile(page, 'Test result');
  await page.locator('#cw-draft').fill('Сохрани материалы при ошибке отправки');
  await page.route('**/api/conversation/*/message', async (route) => {
    if (route.request().method() === 'POST')
      return route.fulfill({ status: 500, json: { message: 'Сбой отправки' } });
    await route.fallback();
  });
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Сервис временно недоступен');
  await expect(page.locator('#cw-draft')).toHaveValue('Сохрани материалы при ошибке отправки');
  await expect(page.locator('.cw-files .composer-attachment')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Убрать Test result', exact: true })).toBeEnabled();
});

test('local attachments use the shared viewer without requesting an unsaved file from the API', async ({
  page,
}) => {
  const state = await mockApi(page);
  const reads: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/file\//.test(new URL(request.url()).pathname)) reads.push(request.url());
  });
  await page.goto('/chat');
  await page.locator('input[type=file]').setInputFiles({
    name: 'local.jpg',
    mimeType: 'image/jpeg',
    buffer: readFileSync(new URL('../../public/media/gallery-1.jpg', import.meta.url)),
  });
  const tile = page.locator('.cw-files .composer-attachment');
  await expect(tile).toHaveCount(1);
  await tile.locator('.composer-attachment-caption').click();
  const viewer = page.getByRole('dialog', { name: 'local.jpg', exact: true });
  await expect(viewer.locator('.media-preview img')).toBeVisible();
  await openViewerActions(page);
  await expect(viewer.getByRole('button', { name: 'Создать превью', exact: true })).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: 'Скачать файл', exact: true })).toBeVisible();
  await Promise.all([
    page.waitForEvent('download'),
    viewer.getByRole('button', { name: 'Скачать файл', exact: true }).click(),
  ]);
  await expect(tile).toHaveCount(1);
  expect(state.sends).toHaveLength(0);
  await viewer.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(tile).toHaveCount(1);
  await tile.getByRole('button', { name: 'Убрать local.jpg', exact: true }).click();
  await expect(tile).toHaveCount(0);
  expect(reads).toEqual([]);
  expect(state.uploads).toBe(0);
  expect(state.sends).toHaveLength(0);
});

test('studio continues an older chair brief with a historical photo while the composer stays empty', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push({ ...savedConversation(), history: 32, isConsiderHistory: true });
  state.messages.set(101, [
    {
      id: 1,
      role: 'USER',
      text: '[Genfactory:script]\nСделай постер этого кресла',
      files: [file],
      createdDate: file.createdDate,
    },
    {
      id: 2,
      role: 'ASSISTANT',
      text: 'Кресло чёрное, с деревянной отделкой.',
      createdDate: file.createdDate,
    },
  ]);
  await page.goto('/chat?conversation=101');
  await expect(page.locator('.cw-files')).toHaveCount(0);
  await page.locator('#cw-draft').fill('Сделай рекламный постер этого кресла по прежнему фото');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  const body = state.sends[0];
  const context = parseStudioContext(body.text)!;
  expect(context.historyFiles).toEqual([
    { id: 12, name: file.name, type: 'IMAGE', role: 'USER', messageId: 1 },
  ]);
  expect(context.input).toEqual({ request: { task: { fileIds: [] } } });
  expect(body.files).toEqual([]);
  expect(body.settings.tools[0].isRequired).toBeUndefined();
  expect(body.settings.tools[0].input).toBeUndefined();
  expect(state.edits.some((edit) => edit.system?.includes('historyFiles'))).toBe(true);
  await expect(page.locator('.cw-files')).toHaveCount(0);
});

for (const legacy of [false, true])
  test(`studio only offers image and video, legacy presentation draft: ${legacy}`, async ({
    page,
  }, testInfo) => {
    const state = await mockApi(page);
    if (legacy) {
      state.conversations.push(savedConversation());
      await page.addInitScript(() =>
        localStorage.setItem(
          'genfactory.draft.v1.7.content-studio.101',
          JSON.stringify({
            version: 1,
            at: new Date().toISOString(),
            value: {
              mode: 'presentation',
              selectedModel: 'OPEN_ROUTER_CONVERSATION:old-text-model',
              draft: 'Сохранённый текст',
              templateIds: ['presentation:startup'],
              appliedTemplate: 'Startup',
            },
          }),
        ),
      );
    }
    await page.goto(legacy ? '/chat?conversation=101' : '/chat');
    const modes = page.getByRole('group', { name: 'Вид генерации', exact: true });
    await expect(modes.getByRole('button')).toHaveCount(2);
    await expect(modes.getByRole('button', { name: 'Презентация', exact: true })).toHaveCount(0);
    await expect(
      modes.getByRole('button', { name: legacy ? 'Изображение' : 'Видео', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cw-card[data-kind=slides]')).toHaveCount(0);
    if (legacy) {
      await expect(page.locator('#cw-draft')).toHaveValue('Сохранённый текст');
      await expect(page.locator('.cw-files')).toHaveCount(0);
    }
    await page.screenshot({ path: testInfo.outputPath(`two-modes-${legacy}.png`) });
    expect(state.sends).toHaveLength(0);
    expect(state.creates).toHaveLength(0);
  });

test('answering a legacy question recovers the older photo without changing the selected model', async ({
  page,
}) => {
  const state = await mockApi(page);
  const model = catalog.find((item) => item.reference.provider === 'OPEN_ROUTER_IMAGE')!;
  const context = {
    uid: 'IMAGE' as const,
    settings: { model: model.reference, options: {}, isLockSelection: true },
    input: { request: { task: { fileIds: [] } }, isDrawNew: true },
  };
  const question = {
    kind: 'question',
    question: 'Добавить надписи?',
    choices: ['Без надписей', 'Укажу текст'],
    allowAuto: false,
  };
  state.conversations.push({ ...savedConversation(), history: 32, isConsiderHistory: true });
  state.messages.set(101, [
    { id: 1, role: 'USER', text: 'Исходное кресло', files: [file], createdDate: file.createdDate },
    { id: 2, role: 'ASSISTANT', text: 'Принято', createdDate: file.createdDate },
    { id: 3, role: 'USER', text: withStudioContext('Сделай постер', context), createdDate: file.createdDate },
    {
      id: 4,
      role: 'ASSISTANT',
      text: '[Genfactory:studio-question:v1]\n' + JSON.stringify(question),
      createdDate: file.createdDate,
    },
  ]);
  await page.goto('/chat?conversation=101');
  await page
    .getByRole('group', { name: question.question })
    .getByRole('button', { name: 'Без надписей', exact: true })
    .click();
  await expect.poll(() => state.sends.length).toBe(1);
  const sent = state.sends[0];
  expect(sent.files).toEqual([]);
  expect(sent.settings.tools[0]).toEqual({ uid: 'IMAGE', settings: context.settings });
  expect(parseStudioContext(sent.text)?.historyFiles?.map((file) => file.id)).toEqual([12]);
  expect(parseStudioContext(sent.text)?.input).not.toHaveProperty('isDrawNew');
});

test('a socket event refreshes its conversation without refetching the other open thread', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation(), { ...savedConversation(102), name: 'Second work' });
  state.messages.set(101, [
    { id: 1, role: 'ASSISTANT', text: 'First thread', createdDate: file.createdDate },
  ]);
  state.messages.set(102, [
    { id: 2, role: 'ASSISTANT', text: 'Second thread', createdDate: file.createdDate },
  ]);
  const reads = new Map<number, number>();
  page.on('request', (request) => {
    const match = new URL(request.url()).pathname.match(/^\/api\/conversation\/(\d+)\/message$/);
    if (match && request.method() === 'GET')
      reads.set(Number(match[1]), (reads.get(Number(match[1])) || 0) + 1);
  });
  await page.goto('/chat?conversation=101');
  await expect(page.getByText('First thread', { exact: true })).toBeVisible();
  await expect.poll(() => state.joinedRooms.includes('conversation101')).toBe(true);
  await navigateLegacyRoute(page, '/chat?conversation=102');
  await expect(page.getByText('Second thread', { exact: true })).toBeVisible();
  await expect.poll(() => state.joinedRooms.includes('conversation102')).toBe(true);
  // Settle the initial connection refresh before measuring an isolated event.
  await page.waitForTimeout(250);
  const baseline = reads.get(102);
  state.messages.set(101, [
    { id: 3, role: 'ASSISTANT', text: 'First updated', createdDate: file.createdDate },
  ]);
  const refreshed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/conversation',
  );
  state.socket!.send(
    '42/gnosisai,' +
      JSON.stringify([
        'transportSocketEvent',
        {
          uid: crypto.randomUUID(),
          name: 'ConversationMessageAddedEvent',
          data: { id: 101 },
        },
      ]),
  );
  await refreshed;
  await page.waitForTimeout(200);
  expect(reads.get(102)).toBe(baseline);
  await navigateLegacyRoute(page, '/chat?conversation=101');
  await expect(page.getByText('First updated', { exact: true })).toBeVisible();
  expect(state.sends).toHaveLength(0);
});

test('home video waits until near the viewport and keeps its still cover with reduced motion', async ({
  page,
}, testInfo) => {
  await mockApi(page, false);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const callbacks: Array<(visible: boolean) => void> = [];
    (window as any).observeHome = (visible: boolean) => callbacks.forEach((callback) => callback(visible));
    window.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) {
        callbacks.push((visible) =>
          callback([{ isIntersecting: visible }] as IntersectionObserverEntry[], this as any),
        );
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = '';
      thresholds = [];
    } as any;
  });
  await page.goto('/');
  const video = page.locator('.home-destination-film');
  await expect(video).toHaveCount(1);
  await expect(video).not.toHaveAttribute('src');
  await page.evaluate(() => (window as any).observeHome(true));
  await expect(video).toHaveAttribute('src', '/media/prototype/studio-banner.mp4');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(video).not.toHaveAttribute('src');
  await expect(page.locator('.home-destination-cover').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('home-cover.png') });
});

test('late studio request failure does not appear in another conversation', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation(101), savedConversation(102));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = false;
  await page.route('**/api/conversation/101/message', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    entered = true;
    await gate;
    await route.fulfill({ status: 500, json: { message: 'Late provider failure' } });
  });
  await page.goto('/chat?conversation=101');
  await page.locator('#cw-draft').fill('First conversation request');
  await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
  await expect.poll(() => entered).toBe(true);
  await page.evaluate(() => {
    history.pushState({ key: 'another-project' }, '', '/chat?conversation=102');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/conversation=102/);
  const completed = page.waitForResponse(
    (response) =>
      response.url().endsWith('/conversation/101/message') && response.request().method() === 'POST',
  );
  release();
  await completed;
  await expect(page.locator('#cw-draft')).toBeEnabled();
  await expect(page.locator('.content-feedback.error')).toHaveCount(0);
  await expect(page.locator('.content-error')).toHaveCount(0);
  await expect(page.locator('#cw-draft')).toHaveValue('');
});

test('library multiselect preserves selection across folders and supports deselection and cancellation', async ({
  page,
}, testInfo) => {
  await mockApi(page);
  const folder = {
    ...file,
    id: 30,
    uid: 'folder',
    name: 'Папка',
    type: 'DIRECTORY',
    mime: 'application/x-directory',
  };
  const second = { ...file, id: 13, name: 'Второе фото', directory: 'folder' };
  const third = { ...file, id: 14, name: 'Третье фото' };
  await page.route('**/api/aimodels?*', (route) => {
    const provider = catalogProvider(new URL(route.request().url()));
    const items =
      provider === 'OPEN_ROUTER_CONVERSATION'
        ? [agent]
        : catalog
            .filter((item) => item.reference.provider === provider)
            .map((item) => {
              const copy = structuredClone(item);
              if (copy.schema.properties?.task?.properties?.fileIds)
                copy.schema.properties.task.properties.fileIds.maxItems = 2;
              return copy;
            });
    return route.fulfill({ json: catalogResponse(route.request().url(), items) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  let listReads = 0;
  await page.route('**/api/file?*', (route) => {
    listReads++;
    const conditions = JSON.parse(new URL(route.request().url()).searchParams.get('conditions') || '{}');
    return route.fulfill({
      json: pagination(conditions.directory === 'folder' ? [second] : [file, folder, third]),
    });
  });
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Изображение', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Библиотека' });
  await expect(picker.getByRole('button', { name: 'Добавить (0)' })).toBeDisabled();
  const first = picker.locator('.library-card').filter({ hasText: 'Test result' });
  await expect(first).toBeVisible();
  const initialReads = listReads;
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await first.click();
  expect(listReads).toBe(initialReads);
  await picker.locator('.library-card').filter({ hasText: 'Папка' }).click();
  await picker.getByText('Второе фото', { exact: true }).click();
  await expect(picker.getByRole('status')).toContainText('Выбрано: 2');
  await picker.getByRole('button', { name: 'Корень библиотеки', exact: true }).click();
  await picker.getByText('Третье фото', { exact: true }).click();
  await expect(picker.getByRole('alert')).toContainText('Можно добавить ещё файлов: 2');
  await expect(picker.getByRole('status')).toContainText('Выбрано: 2');
  await page.screenshot({ path: testInfo.outputPath('library-multiselect.png') });
  await picker.getByRole('button', { name: 'Добавить (2)' }).click();
  await expect(page.locator('.cw-files .composer-attachment')).toHaveCount(2);
  await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
  await expect(picker.locator('.library-card').filter({ hasText: 'Test result' })).toBeDisabled();
  await picker.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.locator('.cw-files .composer-attachment')).toHaveCount(2);
});

test.skip('library batch delete confirms IDs, preserves failed selections and retries only failures', async ({
  page,
}, testInfo) => {
  await mockApi(page);
  const second = { ...file, id: 13, name: 'Второй файл' };
  const link = { ...file, id: 14, name: 'Ссылка', type: 'LINK', linkTo: 12 };
  const folder = { ...file, id: 30, name: 'Папка', uid: 'folder', type: 'DIRECTORY' };
  let current = [file, second, link, folder];
  const calls: number[][] = [];
  await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination(current) }));
  await page.route('**/api/file/batch-delete', async (route) => {
    const ids = route.request().postDataJSON().ids;
    calls.push(ids);
    const deleted = calls.length === 1 ? [12, 14] : [13];
    current = current.filter((item) => !deleted.includes(item.id));
    await route.fulfill({
      json: {
        items: ids.map((id: number) =>
          deleted.includes(id)
            ? { id, status: 'DELETED' }
            : { id, status: 'ERROR', code: 'DELETE_FAILED', message: 'Хранилище недоступно' },
        ),
      },
    });
  });
  await page.goto('/library');
  await page.getByRole('button', { name: 'Выбрать для удаления', exact: true }).click();
  for (const name of ['Test result', 'Второй файл', 'Ссылка'])
    await page.locator('.library-card').filter({ hasText: name }).click();
  await expect(page.locator('.library-card').filter({ hasText: 'Папка' })).not.toHaveAttribute(
    'aria-pressed',
  );
  await page.getByRole('button', { name: 'Удалить выбранные (3)', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Удалить выбранные файлы' });
  await expect(dialog).toContainText('Это действие нельзя отменить');
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  expect(calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Удалить выбранные (3)', exact: true }).click();
  await dialog.getByRole('button', { name: 'Удалить безвозвратно', exact: true }).click();
  await expect(page.getByText('Удалено: 2 из 3', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Второй файл: Хранилище недоступно');
  await expect(page.getByRole('button', { name: 'Удалить выбранные (1)', exact: true })).toBeEnabled();
  expect(calls).toEqual([[12, 13, 14]]);
  await page.screenshot({ path: testInfo.outputPath('batch-delete-partial.png') });
  await page.getByRole('button', { name: 'Удалить выбранные (1)', exact: true }).click();
  await dialog.getByRole('button', { name: 'Удалить безвозвратно', exact: true }).click();
  await expect(page.getByText('Удалено: 1 из 1', { exact: true })).toBeVisible();
  expect(calls).toEqual([[12, 13, 14], [13]]);
  await expect(page.getByRole('button', { name: 'Выбрать для удаления', exact: true })).toBeVisible();
});

test.skip('library batch delete blocks duplicate submissions and preserves uncertain selections', async ({
  page,
}) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route('**/api/file/batch-delete', async (route) => {
    calls++;
    await gate;
    await route.fulfill({ status: 503, json: { message: 'Storage unavailable' } });
  });
  await page.goto('/library');
  await page.getByRole('button', { name: 'Выбрать для удаления', exact: true }).click();
  await page.locator('.library-card').filter({ hasText: 'Test result' }).click();
  await page.getByRole('button', { name: 'Удалить выбранные (1)', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Удалить выбранные файлы' });
  await dialog.getByRole('button', { name: 'Удалить безвозвратно', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Удаляем…', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Отмена', exact: true })).toBeDisabled();
  release();
  await expect(dialog.getByRole('alert')).toContainText('часть файлов могла быть удалена');
  expect(calls).toBe(1);
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Удалить выбранные (1)', exact: true })).toBeVisible();
});

for (const limit of [1, 2]) {
  test(`library selects immediately when only one slot is available, limit ${limit}`, async ({ page }) => {
    await mockApi(page);
    const second = { ...file, id: 13, name: 'Второе фото' };
    await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([file, second]) }));
    await page.route('**/api/aimodels?*', (route) => {
      const provider = catalogProvider(new URL(route.request().url()));
      const items =
        provider === 'OPEN_ROUTER_CONVERSATION'
          ? [agent]
          : catalog
              .filter((item) => item.reference.provider === provider)
              .map((item) => {
                const model = structuredClone(item);
                if (model.schema.properties?.task?.properties?.fileIds)
                  model.schema.properties.task.properties.fileIds.maxItems = limit;
                return model;
              });
      return route.fulfill({ json: catalogResponse(route.request().url(), items) });
    });
    await page.goto('/chat');
    await page.getByRole('button', { name: 'Изображение', exact: true }).click();
    await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Библиотека' });
    if (limit === 2) {
      await selectLibraryFile(page, 'Test result');
      await expect(page.locator('.cw-files .composer-attachment')).toHaveCount(1);
      await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
    }
    await expect(picker.locator('.file-select-mark')).toHaveCount(0);
    await expect(picker.locator('.library-selection-bar')).toHaveCount(0);
    await picker.getByText('Второе фото', { exact: true }).click();
    await expect(picker).not.toBeVisible();
    await expect(page.locator('.cw-files .composer-attachment')).toHaveCount(limit);
  });
}

for (const width of [1440, 390]) {
  test(`history identifies content studio conversations without invented counts ${width}`, async ({
    page,
  }, testInfo) => {
    const state = await mockApi(page);
    const studio = {
      ...savedConversation(101),
      name: 'Проект студии',
      tags: ['genfactory', 'content-studio'],
      status: 'LOADING' as const,
    };
    state.conversations.push(studio, { ...savedConversation(102), name: 'Обычная беседа', tags: ['chat'] });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/history');
    const card = page.locator('.history-card').filter({ hasText: 'Проект студии' });
    await expect(card.locator('.history-source')).toHaveText('Студия контента');
    await expect(card.locator('.history-status')).toContainText('В работе');
    await expect(card.locator('.history-card-link')).toHaveAttribute('title', /Модель генерации:/);
    await expect(
      page.locator('.history-card').filter({ hasText: 'Обычная беседа' }).locator('.history-source'),
    ).toHaveCount(0);
    const badge = await card.locator('.history-source').boundingBox();
    const status = await card.locator('.history-status').boundingBox();
    expect(status!.y).toBeGreaterThanOrEqual(badge!.y + badge!.height);
    await page.screenshot({ path: testInfo.outputPath(`history-source-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

for (const existing of [true, false]) {
  test(`studio clears submitted draft when the user message appears before reply and HTTP completion, existing ${existing}`, async ({
    page,
  }) => {
    const state = await mockApi(page);
    if (existing) {
      state.conversations.push(savedConversation());
      state.messages.set(101, [
        { id: 1, role: 'USER', text: 'Предыдущий запрос', createdDate: file.createdDate },
        { id: 2, role: 'ASSISTANT', text: 'Предыдущий ответ', createdDate: file.createdDate },
      ]);
    }
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sent: any;
    let id = 0;
    await page.route(/\/api\/conversation\/\d+\/message(?:\?.*)?$/, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      sent = route.request().postDataJSON();
      id = Number(new URL(route.request().url()).pathname.split('/')[3]);
      await gate;
      await route.fulfill({ json: state.messages.get(id)!.at(-1) });
    });
    await page.goto(existing ? '/chat?conversation=101' : '/chat');
    await page.getByRole('button', { name: 'Изображение', exact: true }).click();
    await page.getByRole('button', { name: 'Добавить файл', exact: true }).click();
    await selectLibraryFile(page, 'Test result');
    await page.locator('#cw-draft').fill('Измени фон');
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect.poll(() => !!sent && state.joinedRooms.includes(`conversation${id}`)).toBe(true);
    const emit = () =>
      state.socket!.send(
        '42/gnosisai,' +
          JSON.stringify([
            'transportSocketEvent',
            { uid: crypto.randomUUID(), name: 'ConversationMessageAddedEvent', data: { id } },
          ]),
      );
    if (existing) {
      state.messages.get(id)![0].text = sent.text;
      emit();
      await expect(page.getByText('Предыдущий ответ', { exact: true })).toBeVisible();
      await expect(page.locator('#cw-draft')).toHaveValue('Измени фон');
    }
    state.messages.set(id, [
      ...(state.messages.get(id) || []),
      { id: 3, role: 'USER', text: sent.text, files: [file], createdDate: file.createdDate },
    ]);
    emit();
    await expect(page.locator('#cw-draft')).toHaveValue('');
    await expect(page.locator('.cw-files .composer-attachment')).toHaveCount(0);
    await expect(page.getByText('Новый результат готов', { exact: true })).toHaveCount(0);
    state.messages.get(id)!.push({
      id: 4,
      role: 'ASSISTANT',
      text: 'Новый результат готов',
      files: [{ ...file, id: 99 }],
      createdDate: file.createdDate,
    });
    emit();
    await expect(page.getByText('Новый результат готов', { exact: true })).toBeVisible();
    release();
    await expect(page.locator('#cw-draft')).toBeEnabled();
    await page.reload();
    await expect(page.locator('#cw-draft')).toHaveValue('');
    await expect(page.locator('.cw-files .composer-attachment')).toHaveCount(0);
  });
}

for (const isLink of [false, true]) {
  test(`library action downloads original file, link ${isLink}`, async ({ page }) => {
    await mockApi(page);
    const source = { ...file, name: 'original.png' };
    const item = isLink ? { ...source, id: 15, name: 'Alias', type: 'LINK', linkTo: 12 } : source;
    const folder = { ...file, id: 30, name: 'Folder', type: 'DIRECTORY' };
    await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([item, folder]) }));
    await page.route('**/api/file/12', (route) => route.fulfill({ json: source }));
    let downloads = 0;
    await page.route('**/api/file/12/content', (route) => {
      downloads++;
      return route.fulfill({ contentType: 'image/png', body: 'test-image' });
    });
    await page.goto('/library');
    await page.getByLabel(`Действия с «${item.name}»`, { exact: true }).click();
    const saved = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Скачать', exact: true }).click();
    expect((await saved).suggestedFilename()).toBe('original.png');
    expect(downloads).toBe(1);
    await page.getByLabel('Действия с «Folder»', { exact: true }).click();
    await expect(
      page.locator('details[open]').getByRole('button', { name: 'Скачать', exact: true }),
    ).toHaveCount(0);
  });
}

test('artifacts reuse file and conversation cards with colliding IDs and open existing viewers', async ({
  page,
}, testInfo) => {
  const state = await mockApi(page);
  const artifactFile = {
    ...file,
    name: 'Очень длинное название созданного изображения с лампой для карточки товара в интернет-магазине.png',
    origin: {
      kind: 'GENERATION',
      sourceFileIds: [],
      generation: {
        model: catalog.find((model) => model.reference.provider === 'OPEN_ROUTER_IMAGE')!.reference,
        prompt: 'Лампа в кабинете',
        options: {},
      },
    },
  };
  const conversation = {
    ...savedConversation(12),
    tags: ['content-studio'],
    name: 'Очень длинное название беседы о создании рекламы настольной лампы',
  };
  state.conversations.push(conversation);
  let fileReads = 0;
  let conversationReads = 0;
  await page.route('**/api/file/12', (route) => {
    fileReads++;
    return route.fulfill({ json: artifactFile });
  });
  await page.route('**/api/conversation/12', (route) => {
    conversationReads++;
    return route.fulfill({ json: conversation });
  });
  await page.route('**/api/artifact?*', (route) =>
    route.fulfill({
      json: pagination([
        {
          id: 12,
          type: 'FILE',
          fileType: 'IMAGE',
          userId: 7,
          name: artifactFile.name,
          generation: artifactFile.origin.generation,
          mime: file.mime,
          size: 12,
          createdDate: file.createdDate,
          activityDate: file.createdDate,
        },
        {
          id: 12,
          type: 'CONVERSATION',
          messageCount: 12,
          userId: 7,
          name: conversation.name,
          status: 'LOADED',
          workspace: 'CONTENT_STUDIO',
          createdDate: file.createdDate,
          activityDate: file.createdDate,
          isArchived: false,
          isFavorite: false,
        },
      ]),
    }),
  );
  await page.goto('/artifacts');
  await expect(page.locator('.file-entry .library-card')).toHaveCount(1);
  await expect(page.locator('.history-card')).toHaveCount(1);
  await expect(page.getByText('Студия контента', { exact: true }).last()).toBeVisible();
  expect(fileReads).toBe(0);
  expect(conversationReads).toBe(0);
  await expect(page.locator('.artifacts-page .history-meta')).toContainText('12 сообщений');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const fileBox = await page.locator('.artifacts-page .file-entry').boundingBox();
    const conversationBox = await page.locator('.artifacts-page .history-card').boundingBox();
    expect(Math.abs(fileBox!.width - conversationBox!.width)).toBeLessThan(1);
    expect(Math.abs(fileBox!.height - conversationBox!.height)).toBeLessThan(1);
    const fileDate = await page.locator('.artifacts-page .library-card time').boundingBox();
    const conversationDate = await page.locator('.artifacts-page .history-meta time').boundingBox();
    const summary = await page.locator('.artifacts-page .file-generation-summary').boundingBox();
    expect(Math.abs(fileDate!.y - conversationDate!.y)).toBeLessThan(1);
    expect(summary!.y + summary!.height).toBeLessThanOrEqual(fileDate!.y);
    const fileActions = await page.locator('.artifacts-page .file-actions summary').boundingBox();
    const conversationActions = await page.locator('.artifacts-page .history-actions summary').boundingBox();
    expect(
      Math.abs(fileActions!.y - fileBox!.y - (conversationActions!.y - conversationBox!.y)),
    ).toBeLessThan(1);
    expect(
      Math.abs(
        fileBox!.x +
          fileBox!.width -
          fileActions!.x -
          (conversationBox!.x + conversationBox!.width - conversationActions!.x),
      ),
    ).toBeLessThan(1);
    await page.screenshot({ path: testInfo.outputPath(`artifacts-equal-${width}.png`), fullPage: true });
  }
  await page.screenshot({ path: testInfo.outputPath('artifacts-desktop.png'), fullPage: true });
  await page.locator('.library-card').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(fileReads).toBe(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: `Открыть результат ${conversation.name}` }).click();
  await expect(page).toHaveURL(/\/chat\?conversation=12/);
  expect(conversationReads).toBeGreaterThan(0);
});

test('artifacts filter and paginate on the server, with compact mobile controls', async ({
  page,
}, testInfo) => {
  await mockApi(page);
  const requests: URL[] = [];
  await page.route('**/api/artifact?*', (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const index = Number(url.searchParams.get('pageIndex'));
    return route.fulfill({
      json: {
        ...pagination([
          {
            id: index + 1,
            type: 'CONVERSATION',
            userId: 7,
            name: `Page ${index + 1}`,
            status: 'LOADED',
            createdDate: file.createdDate,
            activityDate: file.createdDate,
            isFavorite: false,
            isArchived: false,
          },
        ]),
        pageIndex: index,
        pageSize: 24,
        pages: 2,
        total: 25,
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/artifacts');
  await expect(page.getByRole('heading', { name: 'Page 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Следующая страница' }).click();
  await expect(page.getByRole('heading', { name: 'Page 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Беседы', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Page 1' })).toBeVisible();
  expect(JSON.parse(requests.at(-1)!.searchParams.get('conditions')!)).toEqual({ type: 'CONVERSATION' });
  await page.getByRole('textbox', { name: 'Поиск по истории' }).fill('chair');
  await expect.poll(() => requests.at(-1)?.searchParams.get('search')).toBe('chair');
  expect(requests.at(-1)!.searchParams.get('pageIndex')).toBe('0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('artifacts-mobile.png'), fullPage: true });
});

test('artifacts show an error and recover to an empty list without inventing results', async ({ page }) => {
  await mockApi(page);
  let failed = true;
  await page.route('**/api/artifact?*', (route) =>
    failed
      ? route.fulfill({ status: 500, json: { message: 'Unavailable' } })
      : route.fulfill({ json: pagination([]) }),
  );
  await page.goto('/artifacts');
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить артефакты');
  failed = false;
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'История пока пуста' })).toBeVisible();
});

test('content studio runs separate conversations concurrently and keeps pending dialogs locked', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation(101), savedConversation(102));
  const entered = new Set<number>();
  const releases = new Map<number, () => void>();
  await page.route(/\/api\/conversation\/\d+\/message(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const id = Number(new URL(route.request().url()).pathname.split('/')[3]);
    entered.add(id);
    await new Promise<void>((resolve) => releases.set(id, resolve));
    await route.fulfill({ status: 500, json: { message: `Delayed error ${id}` } });
  });
  async function go(path: string): Promise<void> {
    await page.evaluate((path) => {
      history.pushState({ key: crypto.randomUUID() }, '', path);
      dispatchEvent(new PopStateEvent('popstate'));
    }, path);
  }
  try {
    await page.goto('/chat?conversation=101');
    await page.locator('#cw-draft').fill('First pending request');
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect.poll(() => entered.has(101)).toBe(true);
    await go('/chat?conversation=102');
    await expect(page.locator('#cw-draft')).toBeEnabled();
    await page.locator('#cw-draft').fill('Second pending request');
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect.poll(() => entered.has(102)).toBe(true);
    const completed = page.waitForResponse(
      (response) =>
        response.url().endsWith('/conversation/101/message') && response.request().method() === 'POST',
    );
    releases.get(101)!();
    await completed;
    await expect(page.locator('#cw-draft')).toBeDisabled();
    await expect(page.locator('.content-feedback.error')).toHaveCount(0);
    await go('/chat');
    await expect(page.locator('#cw-draft')).toBeEnabled();
    await page.locator('#cw-draft').fill('Third independent request');
    await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect.poll(() => entered.has(103)).toBe(true);
    await go('/chat?conversation=102');
    await expect(page.locator('#cw-draft')).toBeDisabled();
    expect([...entered]).toEqual([101, 102, 103]);
  } finally {
    releases.forEach((release) => release());
  }
});

test('artifacts expose shared file and conversation actions and refresh after edits', async ({ page }) => {
  await mockApi(page);
  let material = { ...file, name: 'Artifact image', tags: ['original'] };
  let removed = false;
  let conversation = {
    ...savedConversation(12),
    name: 'Artifact discussion',
    tags: ['content-studio'],
    isArchived: false,
  };
  await page.route('**/api/artifact?*', (route) =>
    route.fulfill({
      json: pagination([
        ...(!removed
          ? [
              {
                id: 12,
                userId: 7,
                type: 'FILE',
                fileType: 'IMAGE',
                mime: file.mime,
                name: material.name,
                createdDate: file.createdDate,
                activityDate: file.createdDate,
                size: 1,
                workspace: 'CONTENT_STUDIO',
              },
            ]
          : []),
        {
          id: 12,
          userId: 7,
          type: 'CONVERSATION',
          name: conversation.name,
          status: 'LOADED',
          isArchived: conversation.isArchived,
          isFavorite: false,
          workspace: 'CONTENT_STUDIO',
          createdDate: file.createdDate,
          activityDate: file.createdDate,
        },
      ]),
    }),
  );
  await page.route('**/api/file/12', (route) => {
    if (route.request().method() === 'PUT') material = { ...material, ...route.request().postDataJSON() };
    if (route.request().method() === 'DELETE') {
      removed = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: material });
  });
  await page.route('**/api/conversation/12', (route) => {
    if (['PUT', 'PATCH'].includes(route.request().method()))
      conversation = { ...conversation, ...route.request().postDataJSON() };
    return route.fulfill({ json: conversation });
  });
  await page.goto('/artifacts');
  await expect(page.locator('.artifacts-page .history-source')).toHaveCount(2);
  await expect(page.locator('.artifacts-page .history-source svg')).toHaveCount(0);
  await page.getByLabel('Действия с «Artifact image»', { exact: true }).click();
  for (const label of ['Скачать', 'Название и теги', 'Переместить', 'Удалить'])
    await expect(
      page.locator('.file-actions').getByRole('button', { name: label, exact: true }),
    ).toBeVisible();
  await page.getByRole('button', { name: 'Название и теги', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Renamed image');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('.library-card b')).toHaveText('Renamed image');
  expect(material.tags).toEqual(['original']);
  await page.getByLabel('Действия работы Artifact discussion', { exact: true }).click();
  await page.getByRole('button', { name: 'Переименовать', exact: true }).click();
  await page.getByLabel('Новое название').fill('Renamed discussion');
  await page.getByRole('button', { name: 'Сохранить название', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Renamed discussion', exact: true })).toBeVisible();
  await page.getByLabel('Действия работы Renamed discussion', { exact: true }).click();
  await page.getByRole('button', { name: 'В архив', exact: true }).click();
  await expect.poll(() => conversation.isArchived).toBe(true);
  await page.getByLabel('Действия работы Renamed discussion', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Вернуть из архива', exact: true })).toBeVisible();
  await page.getByLabel('Действия с «Renamed image»', { exact: true }).click();
  await page.locator('.file-actions').getByRole('button', { name: 'Удалить', exact: true }).click();
  expect(removed).toBe(false);
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.locator('.artifacts-page .file-entry')).toHaveCount(0);
});

test('media draft waits for the complete catalog and restores after a failed page is retried', async ({
  page,
}) => {
  const state = await mockApi(page);
  const first = { ...catalog[0], reference: { ...catalog[0].reference, provider: 'OPEN_ROUTER_IMAGE' } };
  const second = { ...catalog[1], reference: { ...catalog[1].reference, provider: 'OPEN_ROUTER_IMAGE' } };
  const selected = `${second.reference.provider}:${second.reference.model}`;
  await page.addInitScript(
    ({ selected }) => {
      localStorage.setItem(
        'genfactory.draft.v1.7.image:new:all',
        JSON.stringify({
          version: 1,
          at: '2026-11-12T10:00:00Z',
          value: { prompt: 'Не потерять черновик', selected, options: {}, references: [], shot: {} },
        }),
      );
    },
    { selected },
  );
  let failing = true;
  await page.route('**/api/aimodels?*', (route) => {
    const index = Number(new URL(route.request().url()).searchParams.get('pageIndex'));
    if (index === 1 && failing) return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
    return route.fulfill({
      json: {
        ...pagination(index === 0 ? [first] : [second]),
        pageIndex: index,
        pages: 2,
        total: 2,
      },
    });
  });
  await page.goto('/image');
  await expect(page.getByRole('button', { name: 'Загрузить снова' })).toBeVisible();
  await expect(page.getByText(/Модель черновика/)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('genfactory.draft.v1.7.image:new:all'))).toContain(
    'Не потерять черновик',
  );
  failing = false;
  await page.getByRole('button', { name: 'Загрузить снова' }).click();
  await expect(page.getByRole('textbox', { name: /^(Ваша идея|Идея|Идея ролика)$/ })).toHaveValue(
    'Не потерять черновик',
  );
  await expect(page.getByText(/Модель черновика/)).toHaveCount(0);
  expect(state.tasks).toHaveLength(0);
});

test('image downloads start independently and use storage attachments without buffering in the API', async ({
  page,
}) => {
  test.setTimeout(30_000);
  const state = await mockApi(page);
  state.generated.push(
    { ...file, id: 21, name: 'first.png', origin: { kind: 'GENERATION' } },
    { ...file, id: 22, name: 'second.png', origin: { kind: 'GENERATION' } },
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let firstStarted = false;
  let contentReads = 0;
  await page.route('**/api/file/*/content', (route) => {
    contentReads++;
    return route.fulfill({ body: 'unexpected' });
  });
  await page.route('**/api/file/*/download', async (route) => {
    const id = Number(new URL(route.request().url()).pathname.split('/')[3]);
    if (id === 21) {
      firstStarted = true;
      await gate;
    }
    await route.fulfill({ json: { url: `http://127.0.0.1:5173/original-${id}.png` } });
  });
  await page.route('**/original-*.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      headers: {
        'Content-Disposition': `attachment; filename="${route.request().url().includes('21') ? 'first' : 'second'}.png"`,
      },
      body: 'original image bytes',
    }),
  );
  await page.goto('/image');
  try {
    await page
      .locator('.image-result')
      .filter({ has: page.locator('button[aria-label="Скачать first.png"]') })
      .hover();
    await page.getByRole('button', { name: 'Скачать first.png', exact: true }).click();
    await expect.poll(() => firstStarted).toBe(true);
    const second = page.waitForEvent('download');
    await page
      .locator('.image-result')
      .filter({ has: page.locator('button[aria-label="Скачать second.png"]') })
      .hover();
    await page.getByRole('button', { name: 'Скачать second.png', exact: true }).click();
    expect((await second).suggestedFilename()).toBe('second.png');
    expect(contentReads).toBe(0);
    const first = page.waitForEvent('download');
    release();
    expect((await first).suggestedFilename()).toBe('first.png');
  } finally {
    release();
  }
});

test('image templates use the studio editor, validate fields and references, and preserve model settings', async ({
  page,
}, testInfo) => {
  const state = await mockApi(page);
  await page.goto('/image');
  await chooseModel(page, 'OPEN_ROUTER_IMAGE:sourceful/riverflow-v2.6-pro');
  await page.getByRole('button', { name: 'Стороны', exact: true }).click();
  await page.getByRole('option', { name: '1:1', exact: true }).click();
  await page.getByRole('button', { name: 'Качество', exact: true }).click();
  await page.getByRole('option', { name: '2K', exact: true }).click();
  await page.locator('#img-draft').fill('Старый текст');
  const title = 'Главное фото на белом фоне (маркетплейс)';
  await page.getByRole('button', { name: title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog.locator('.template-editor')).toBeVisible();
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.locator('#img-draft')).toHaveValue('Старый текст');
  await page.getByRole('button', { name: title, exact: true }).click();
  await dialog.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Заполните все поля');
  await dialog.getByLabel('Продукт', { exact: true }).fill('Красная чашка');
  await dialog.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Выберите исходное фото');
  await dialog.getByRole('button', { name: 'Из библиотеки', exact: true }).click();
  await selectLibraryFile(page, 'Test result');
  await dialog.getByText('Редактировать исходный шаблон', { exact: true }).click();
  const source = dialog.getByLabel('Текст шаблона', { exact: true });
  await source.fill((await source.inputValue()) + '\nМягкий свет.');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(dialog.getByRole('button', { name: 'Использовать шаблон', exact: true })).toBeInViewport();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`shared-template-editor-${width}.png`),
      fullPage: true,
    });
  }
  await dialog.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#img-draft')).toHaveValue(/Красная чашка/);
  await expect(page.locator('#img-draft')).toHaveValue(/Мягкий свет/);
  const prompt = await page.locator('#img-draft').inputValue();
  expect(prompt).not.toContain('[PRODUCT]');
  expect(prompt).not.toContain('Старый текст');
  await expect(page.getByRole('button', { name: 'Стороны', exact: true })).toContainText('1:1');
  await expect(page.getByRole('button', { name: 'Качество', exact: true })).toContainText('2K');
  await expect(page.getByRole('button', { name: 'Убрать Test result', exact: true })).toBeVisible();
  await expect(page.locator('.composer-template')).toHaveCount(0);
  expect(state.tasks).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
  await page.getByRole('button', { name: 'Собрать изображение', exact: true }).click();
  await expect.poll(() => state.tasks.length).toBe(1);
  expect(state.tasks[0].task.prompt).toBe(prompt.trim());
  expect(state.tasks[0].task.fileIds).toEqual([12]);
  expect(state.tasks[0].options).toMatchObject({ aspectRatio: '1:1', resolution: '2K' });
});

test('video templates use the same editor and adapt duration without changing selected settings', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/video');
  await page.getByRole('button', { name: 'Длительность', exact: true }).click();
  await page.getByRole('option', { name: '4 с', exact: true }).click();
  await page.getByRole('button', { name: 'Studio product turn', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Studio product turn', exact: true });
  for (const input of await dialog.locator('[data-template-variable]').all()) await input.fill('Синяя чашка');
  await dialog.getByRole('button', { name: 'Из библиотеки', exact: true }).click();
  await selectLibraryFile(page, 'Test result');
  await dialog.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Согласуйте длительность');
  await dialog.getByRole('button', { name: 'Адаптировать под 4 с', exact: true }).click();
  await dialog.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#vd-draft')).toHaveValue(/4-second/);
  await expect(page.getByRole('button', { name: 'Длительность', exact: true })).toContainText('4 с');
  await expect(page.getByRole('button', { name: 'Убрать Test result', exact: true })).toBeVisible();
  expect(state.tasks).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
});

test('studio keeps the shared template editor and applies the same prepared image brief', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Изображение', exact: true }).click();
  const title = 'Главное фото на белом фоне (маркетплейс)';
  const card = page
    .locator('.cw-card')
    .filter({ has: page.getByRole('button', { name: `Открыть шаблон: ${title}`, exact: true }) });
  await card.hover();
  await card.getByRole('button', { name: 'Добавить', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await dialog.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Заполните все поля');
  await dialog.getByLabel('Продукт', { exact: true }).fill('Красная чашка');
  await dialog.getByRole('button', { name: 'Из библиотеки', exact: true }).click();
  await selectLibraryFile(page, 'Test result');
  await dialog.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#cw-draft')).toHaveValue(/Красная чашка/);
  await expect(page.locator('#cw-draft')).not.toHaveValue(/\[PRODUCT\]/);
  await expect(page.getByRole('button', { name: 'Убрать Test result', exact: true })).toBeVisible();
  expect(state.tasks).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
});

for (const kind of ['image', 'video'] as const)
  for (const existing of [false, true]) {
    test(`${kind} composer accepts concurrent tasks ${existing ? 'while its conversation is running' : 'in a new workspace'} and late results preserve the next draft`, async ({
      page,
    }) => {
      const state = await mockApi(page);
      if (existing) state.conversations.push({ ...savedConversation(101), status: 'LOADING' });
      const requests: { task: { prompt: string; session: string } }[] = [];
      const releases = new Map<string, () => void>();
      await page.route('**/api/task', async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const body = route.request().postDataJSON();
        requests.push(body);
        await new Promise<void>((resolve) => releases.set(body.task.prompt, resolve));
        if (body.task.prompt.startsWith('Первое изображение'))
          return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
        const output = {
          ...file,
          id: 22,
          name: 'Second result',
          ...(kind === 'video' ? { type: 'VIDEO', mime: 'video/mp4', path: '/test-video.mp4' } : {}),
          origin: { kind: 'GENERATION' },
        };
        state.generated = [output];
        return route.fulfill({
          status: 201,
          json: { result: [], cost: { status: 'FINAL', amounts: [] }, files: [output] },
        });
      });
      try {
        await page.goto(existing ? `/${kind}?conversation=101` : `/${kind}`);
        const input = page.locator(kind === 'video' ? '#vd-draft' : '#img-draft');
        await expect(input).toBeEnabled();
        if (existing) await expect(page.locator('.image-result-pending')).toHaveCount(0);
        await submit(page, 'Первое изображение', kind);
        await expect.poll(() => requests.length).toBe(1);
        await expect(input).toBeEnabled();
        await expect(input).toHaveValue('');
        await submit(page, 'Второе изображение', kind);
        await expect.poll(() => requests.length).toBe(2);
        expect(new Set(requests.map((request) => request.task.session)).size).toBe(2);
        await expect(input).toBeEnabled();
        await expect(input).toHaveValue('');
        await input.fill('Следующий черновик');
        releases.get(requests[0].task.prompt)!();
        releases.get(requests[1].task.prompt)!();
        await expect(
          page.getByRole('button', { name: 'Открыть Second result', exact: true }).first(),
        ).toBeVisible();
        await expect(input).toHaveValue('Следующий черновик');
        await expect(input).toBeEnabled();
        expect(requests).toHaveLength(2);
        expect(state.sends).toHaveLength(0);
      } finally {
        for (const release of releases.values()) release();
      }
    });
  }

for (const kind of ['image', 'video'] as const) {
  for (const denied of [false, true]) {
    test(`${kind} task ignores ${denied ? 'inaccessible' : 'failed incompatible'} conversation settings and output folders`, async ({
      page,
    }) => {
      const state = await mockApi(page);
      state.conversations.push({
        ...savedConversation(101),
        status: 'ERROR',
        fileOutput: { directory: 'old-directory', tags: ['old-conversation'] },
        options: { model: agent.reference.model, tools: [] },
      });
      if (denied)
        await page.route('**/api/conversation/101', (route) =>
          route.fulfill({ status: 403, json: { message: 'ConversationForbiddenError' } }),
        );
      await page.goto(`/${kind}?conversation=101`);
      const input = page.getByRole('textbox', {
        name: kind === 'image' ? 'Идея' : 'Идея ролика',
        exact: true,
      });
      await expect(input).toBeEnabled();
      if (denied)
        await expect(page.locator('.image-conversation-note')).toContainText('ConversationForbiddenError');
      await submit(page, 'Независимая генерация', kind);
      await expect.poll(() => state.tasks.length).toBe(1);
      expect(state.tasks[0].model).toBe(kind === 'image' ? 'OPEN_ROUTER_IMAGE' : 'OPEN_ROUTER_VIDEO');
      expect(state.tasks[0].task.prompt).toContain('Независимая генерация');
      expect(state.tasks[0].fileOutput).toEqual({});
      expect(state.sends).toHaveLength(0);
      expect(state.edits).toHaveLength(0);
      expect(state.creates).toHaveLength(0);
    });
  }
}

test('unified history groups files and conversations by activity day and navigation uses new labels', async ({
  page,
}, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-11-12T12:00:00Z'));
  await mockApi(page);
  const fileItem = {
    id: 12,
    userId: 7,
    type: 'FILE',
    fileType: 'IMAGE',
    mime: 'image/png',
    size: 42,
    name: 'Today file',
    createdDate: file.createdDate,
    activityDate: '2026-11-12T10:00:00Z',
  };
  const conversation = {
    id: 20,
    userId: 7,
    type: 'CONVERSATION',
    status: 'LOADED',
    name: 'Today conversation',
    messageCount: 2,
    isArchived: false,
    isFavorite: false,
    createdDate: file.createdDate,
    activityDate: '2026-11-12T09:00:00Z',
  };
  await page.route('**/api/artifact?*', (route) =>
    route.fulfill({
      json: pagination([
        fileItem,
        conversation,
        { ...fileItem, id: 13, name: 'Yesterday file', activityDate: '2026-11-11T10:00:00Z' },
        { ...conversation, id: 21, name: 'Yesterday conversation', activityDate: '2026-11-11T09:00:00Z' },
        { ...fileItem, id: 14, name: 'Older file', activityDate: '2026-11-09T10:00:00Z' },
      ]),
    }),
  );
  await page.goto('/artifacts');
  const navigation = page.getByRole('navigation', { name: 'Основное меню' });
  await expect(navigation.getByRole('link', { name: 'История', exact: true })).toHaveAttribute(
    'href',
    '/artifacts',
  );
  await expect(navigation.getByRole('link', { name: 'Беседы', exact: true })).toHaveCount(0);
  await expect(navigation.getByRole('link', { name: 'История', exact: true }).locator('img')).toHaveAttribute(
    'src',
    '/media/nav/history.svg',
  );
  await expect(page.locator('.history-day')).toHaveText(['Сегодня', 'Вчера', /9 ноября 2026/]);
  expect(
    await page
      .locator('.history-list')
      .evaluate((element) => [...element.children].map((child) => child.tagName)),
  ).toEqual(['H3', 'ARTICLE', 'ARTICLE', 'H3', 'ARTICLE', 'ARTICLE', 'H3', 'ARTICLE']);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`unified-history-${width}.png`), fullPage: true });
  }
});

for (const { width, mediaType } of [
  { width: 1440, mediaType: 'IMAGE' },
  { width: 390, mediaType: 'IMAGE' },
  { width: 390, mediaType: 'VIDEO' },
]) {
  test(`file preview keeps its size while loading and opens generation settings in the header at ${width}px for ${mediaType}`, async ({
    page,
  }, testInfo) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width, height: 900 });
    const name =
      'Очень длинное название сгенерированного файла, которое должно оставаться в одной строке и обрезаться многоточием.png';
    const generated = {
      ...file,
      name,
      path: '/test-stable-preview',
      type: mediaType,
      mime: mediaType === 'VIDEO' ? 'video/mp4' : 'image/png',
      origin: {
        kind: 'GENERATION',
        sourceFileIds: [],
        generation: {
          model: {
            provider: mediaType === 'VIDEO' ? 'OPEN_ROUTER_VIDEO' : 'OPEN_ROUTER_IMAGE',
            model:
              mediaType === 'VIDEO'
                ? 'x-ai/grok-imagine-video-1.5-lite'
                : 'google/gemini-3.1-flash-image-preview',
          },
          prompt: 'A calm forest',
          options: { aspectRatio: '3:2' },
        },
      },
    };
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/test-stable-preview', async (route) => {
      await gate;
      await route.fulfill({
        contentType: generated.mime,
        body:
          mediaType === 'VIDEO'
            ? readFileSync(new URL('../fixtures/preview.mp4', import.meta.url))
            : Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9O8AAAAASUVORK5CYII=',
                'base64',
              ),
      });
    });
    await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([generated]) }));
    await page.route('**/api/file/12', (route) => route.fulfill({ json: generated }));
    state.generated = [generated];
    await page.goto(mediaType === 'VIDEO' ? '/video' : '/library', { waitUntil: 'domcontentloaded' });
    if (mediaType === 'VIDEO')
      await page
        .getByRole('button', { name: `Открыть ${name}`, exact: true })
        .first()
        .press('Enter');
    else
      await page
        .locator('.library-card')
        .filter({ has: page.locator('b', { hasText: name }) })
        .click();
    const dialog = page.getByRole('dialog', { name, exact: true });
    const loader = dialog.getByRole('status', { name: 'Загрузка файла' });
    await expect(loader).toBeVisible();
    await expect(dialog.locator('time')).toHaveCount(0);
    const before = await dialog.boundingBox();
    const heading = dialog.getByRole('heading', { name, exact: true });
    await expect(heading).toHaveCSS('white-space', 'nowrap');
    await expect(heading).toHaveCSS('text-overflow', 'ellipsis');
    const settings = dialog.getByRole('button', { name: 'Параметры генерации', exact: true });
    await openViewerActions(page);
    await expect(settings).toBeVisible();
    await expect(dialog.getByText('A calm forest', { exact: true })).not.toBeVisible();
    release();
    await expect(loader).toHaveCount(0);
    await expect(dialog.locator('.media-preview img, .media-preview video')).toBeVisible();
    expect(await dialog.boundingBox()).toEqual(before);
    await settings.click();
    await expect(dialog.getByText('A calm forest', { exact: true })).toBeVisible();
    expect(await dialog.boundingBox()).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath(`file-preview-settings-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog.getByText('A calm forest', { exact: true })).not.toBeVisible();
    await expect(dialog).toBeVisible();
    await openViewerActions(page);
    await settings.click();
    await heading.click();
    await expect(dialog.getByText('A calm forest', { exact: true })).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('file preview stops its loader when the original is unavailable', async ({ page }) => {
  await mockApi(page);
  const missing = { ...file, path: '/test-missing-preview.png' };
  await page.route('**/test-missing-preview.png', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([missing]) }));
  await page.route('**/api/file/12', (route) => route.fulfill({ json: missing }));
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Test result/ }).click();
  const dialog = page.getByRole('dialog', { name: file.name, exact: true });
  await expect(dialog.locator('.file-placeholder')).toBeVisible();
  await expect(dialog.getByRole('status', { name: 'Загрузка файла' })).toHaveCount(0);
});

for (const kind of ['image', 'video'] as const)
  for (const width of [1440, 390]) {
    test(`${kind} submission scrolls the gallery to the pending result and keeps detailed provider errors at ${width}px`, async ({
      page,
    }, testInfo) => {
      await mockApi(page);
      await page.setViewportSize({ width, height: 900 });
      let sends = 0;
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/api/task', async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        sends++;
        await gate;
        await route.fulfill({
          status: 400,
          json: {
            code: 'AI_VENDOR_ERROR',
            message: 'AiVendorError',
            details:
              'Provider rejected quality=auto for the requested size. api_key="private-key"\nRequest ID: req-browser-123',
          },
        });
      });
      try {
        await page.goto(`/${kind}`);
        const wall = page.locator('.img-wall');
        await expect(page.locator(kind === 'video' ? '#vd-draft' : '#img-draft')).toBeEnabled();
        await wall.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await expect.poll(() => wall.evaluate((element) => element.scrollTop)).toBeGreaterThan(150);
        await submit(page, 'Проверка причины отказа', kind);
        await expect.poll(() => sends).toBe(1);
        await expect.poll(() => wall.evaluate((element) => element.scrollTop)).toBe(0);
        await expect(page.locator('.image-result-pending').first()).toBeInViewport();
        release();
        const alert = page.getByRole('alert');
        await expect(alert).toContainText('HTTP 400');
        await expect(alert).toContainText('Provider rejected quality=auto');
        await expect(alert).toContainText('req-browser-123');
        await expect(alert).not.toContainText('private-key');
        await expect(page.locator(kind === 'video' ? '#vd-draft' : '#img-draft')).toHaveValue(
          'Проверка причины отказа',
        );
        await page.getByRole('button', { name: /Активные работы:/ }).click();
        const jobs = page.getByRole('dialog');
        await jobs.getByText('Причина ошибки', { exact: true }).click();
        await expect(jobs).toContainText('Provider rejected quality=auto');
        await expect(jobs).toContainText('req-browser-123');
        await expect(jobs).not.toContainText('private-key');
        await page.screenshot({ path: testInfo.outputPath(`provider-error-${width}.png`) });
        expect(sends).toBe(1);
      } finally {
        release();
      }
    });
  }

test('studio preserves the provider status and reason after reloading a saved conversation', async ({
  page,
}) => {
  const state = await mockApi(page);
  const conversation: IConversation = {
    ...savedConversation(),
    status: 'ERROR',
    error: {
      code: 'AI_VENDOR_ERROR',
      message: 'HTTP 429: Provider rate limit exceeded. Request ID: req-saved-123',
    },
  };
  state.conversations.push(conversation);
  state.messages.set(101, [{ id: 1, role: 'USER', text: 'Мой запрос', createdDate: file.createdDate }]);
  await page.goto('/chat?conversation=101');
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await expect(page.getByRole('alert')).toContainText('HTTP 429');
    await expect(page.getByRole('alert')).toContainText('Provider rate limit exceeded');
    await expect(page.getByRole('alert')).toContainText('req-saved-123');
  }
  expect(state.sends).toHaveLength(0);
});

test('background task notification keeps the provider reason in Works', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/image');
  await expect.poll(() => !!state.socket).toBe(true);
  const item = { id: 'task:background', model: 'OPEN_ROUTER_IMAGE', createdDate: file.createdDate };
  state.socket!.send(
    '42/gnosisai,' +
      JSON.stringify([
        'transportSocketEvent',
        {
          uid: crypto.randomUUID(),
          name: 'TaskFinishedEvent',
          data: {
            id: item.id,
            item,
            result: 'FAILED',
            error: {
              code: 'AI_VENDOR_ERROR',
              message: 'HTTP 422: Unsupported output size. Request ID: req-background-123',
            },
          },
        },
      ]),
  );
  await page.getByRole('button', { name: /Активные работы:/ }).click();
  const jobs = page.getByRole('dialog');
  await jobs.getByText('Причина ошибки', { exact: true }).click();
  await expect(jobs).toContainText('HTTP 422');
  await expect(jobs).toContainText('Unsupported output size');
  await expect(jobs).toContainText('req-background-123');
  expect(state.tasks).toHaveLength(0);
});

test('video clears sent references immediately, restores a failed draft and leaves the next draft intact', async ({
  page,
}) => {
  await mockApi(page);
  const requests: any[] = [];
  const releases: (() => void)[] = [];
  await page.route('**/api/task', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    requests.push(route.request().postDataJSON());
    await new Promise<void>((resolve) => releases.push(resolve));
    await route.fulfill({
      status: 400,
      json: { code: 'AI_VENDOR_ERROR', details: 'Unsupported video resolution' },
    });
  });
  try {
    await page.goto('/video');
    await page.getByRole('button', { name: 'Добавить кадр', exact: true }).click();
    await selectLibraryFile(page, 'Test result');
    await submit(page, 'Оживи лампу', 'video');
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].task.fileIds).toEqual([12]);
    expect(requests[0].options.frameImages).toBeUndefined();
    expect(requests[0].options.inputReferences).toBeUndefined();
    await expect(page.locator('#vd-draft')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Убрать Test result', exact: true })).toHaveCount(0);
    releases[0]();
    await expect(page.locator('#vd-draft')).toHaveValue('Оживи лампу');
    await expect(page.getByRole('button', { name: 'Убрать Test result', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Unsupported video resolution');
    await page.getByRole('button', { name: 'Собрать видео', exact: true }).click();
    await expect.poll(() => requests.length).toBe(2);
    await page.locator('#vd-draft').fill('Следующий видеозапрос');
    releases[1]();
    await expect(page.locator('.image-result-pending')).toHaveCount(0);
    await expect(page.locator('#vd-draft')).toHaveValue('Следующий видеозапрос');
    await expect(page.getByRole('button', { name: 'Убрать Test result', exact: true })).toHaveCount(0);
    expect(requests).toHaveLength(2);
  } finally {
    releases.forEach((release) => release());
  }
});

for (const width of [1440, 390]) {
  test(`all dialog headers share the visible title and file metadata stays filled without tags at ${width}px`, async ({
    page,
  }, testInfo) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width, height: 1000 });
    const savedImage = {
      ...file,
      name: 'Cloud S3 check_1794402779937.png',
      tags: ['cloud-s3-check', 'private-tag'],
    };
    let items = [
      savedImage,
      {
        ...file,
        id: 13,
        name: 'Видео без параметров.mp4',
        type: 'VIDEO',
        mime: 'video/mp4',
        path: '/test-video.mp4',
        tags: [],
      },
      {
        ...file,
        id: 14,
        name: 'Документ без параметров.txt',
        type: 'DOCUMENT',
        mime: 'text/plain',
        tags: [],
      },
      { ...file, id: 80, name: 'Папка проекта', type: 'DIRECTORY', tags: [] },
    ];
    await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination(items) }));
    await page.route('**/api/file/12', (route) => route.fulfill({ json: savedImage }));
    const header = async (title: string): Promise<void> => {
      const dialog = page.getByRole('dialog').last();
      await expect(dialog).toBeVisible();
      await expect(
        dialog.locator('.modal-head').getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
      await expect(dialog.locator('.modal-head h2')).toHaveCSS('font-size', '16px');
      await expect(dialog.locator('.modal-head h2')).toHaveCSS('text-overflow', 'ellipsis');
      await expect(dialog.locator('.modal-head')).toHaveCSS('border-bottom-style', 'solid');
      const titleBox = await dialog.locator('.modal-head h2').boundingBox();
      const closeBox = await dialog.getByRole('button', { name: 'Закрыть', exact: true }).boundingBox();
      expect(Math.abs(titleBox!.y + titleBox!.height / 2 - closeBox!.y - closeBox!.height / 2)).toBeLessThan(
        1,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    };
    await page.goto('/library');
    await expect(page.locator('.file-tag-chips')).toHaveCount(0);
    for (const [name, kind] of [
      [savedImage.name, 'Изображение'],
      ['Видео без параметров.mp4', 'Видео'],
      ['Документ без параметров.txt', 'Документ'],
      ['Папка проекта', 'Папка'],
    ]) {
      const card = page.locator('.library-card').filter({ has: page.locator('b', { hasText: name }) });
      await expect(card.locator(':scope > div:last-child > span')).toHaveText([kind, '01.11.2026']);
      await expect(card.locator('time')).toHaveCount(1);
    }
    const entry = page
      .locator('.file-entry')
      .filter({ has: page.locator('b', { hasText: savedImage.name }) });
    await entry.locator('.file-actions summary').click();
    await entry.getByRole('button', { name: 'Название и теги', exact: true }).click();
    await header('Название и теги');
    await expect(page.getByLabel('Теги через запятую')).toHaveValue('cloud-s3-check, private-tag');
    await page.screenshot({ path: testInfo.outputPath(`dialog-edit-${width}.png`) });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Новая папка', exact: true }).click();
    await header('Новая папка');
    await page.keyboard.press('Escape');
    await entry.locator('.library-card').click();
    await header(savedImage.name);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Активные работы:/ }).click();
    await header('Активные работы');
    await page.screenshot({ path: testInfo.outputPath(`dialog-jobs-${width}.png`) });
    await page.keyboard.press('Escape');
    await page.goto('/image');
    await page.getByRole('button', { name: 'Добавить изображение', exact: true }).click();
    await header('Библиотека');
    await page.screenshot({ path: testInfo.outputPath(`dialog-library-${width}.png`) });
    await page.keyboard.press('Escape');
    await page.locator('.ds-template-card').first().click();
    await header((await page.getByRole('dialog').locator('.modal-head h2').textContent())!);
    await page.screenshot({ path: testInfo.outputPath(`dialog-template-${width}.png`) });
    await page.keyboard.press('Escape');
    await page.goto('/video');
    await page.getByRole('button', { name: 'Модель', exact: true }).click();
    await page
      .getByRole('button', { name: /^О модели / })
      .first()
      .click();
    const infoTitle = await page.getByRole('dialog').locator('.modal-head h2').textContent();
    await header(infoTitle!);
    await page.keyboard.press('Escape');
    items = [{ ...savedImage, origin: { kind: 'GENERATION' } } as typeof savedImage];
    await page.goto('/image');
    const image = page.locator('.image-result-open').first();
    await image.focus();
    await image.press('Enter');
    await header(savedImage.name);
    await page.screenshot({ path: testInfo.outputPath(`dialog-image-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.tasks).toHaveLength(0);
    expect(state.sends).toHaveLength(0);
  });
}

for (const path of ['/library', '/history', '/artifacts']) {
  test(`large content lists batch socket refreshes without per-card API reads at ${path}`, async ({
    page,
  }) => {
    const state = await mockApi(page);
    state.conversations.push(...Array.from({ length: 24 }, (_, index) => savedConversation(101 + index)));
    const files = Array.from({ length: 24 }, (_, index) => ({
      ...file,
      id: 1000 + index,
      name: `Generated ${index}.png`,
    }));
    await page.route('**/api/file?*', (route) =>
      route.fulfill({
        json: {
          ...pagination(files),
          total: 6000,
          pages: 250,
        },
      }),
    );
    await page.route('**/api/artifact?*', (route) =>
      route.fulfill({
        json: {
          ...pagination(
            files.map((item) => ({
              ...item,
              type: 'FILE',
              fileType: 'IMAGE',
              activityDate: item.createdDate,
            })),
          ),
          total: 6000,
          pages: 250,
        },
      }),
    );
    const reads: string[] = [];
    let cancelled = 0;
    page.on('request', (request) => {
      if (request.method() === 'GET' && new URL(request.url()).pathname.startsWith('/api/'))
        reads.push(request.url());
    });
    page.on('requestfailed', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) cancelled++;
    });
    await page.goto(path);
    const selector = path === '/history' ? '.history-list .history-card' : '.file-entry';
    await expect(page.locator(selector)).toHaveCount(24);
    await expect.poll(() => !!state.socket).toBeTruthy();
    await page.waitForTimeout(600);
    const initial = [...reads];
    const count = (items: string[], endpoint: string): number =>
      items.filter((url) => new URL(url).pathname === endpoint).length;
    const endpoint =
      path === '/artifacts' ? '/api/artifact' : path === '/library' ? '/api/file' : '/api/conversation';
    const initialLists = count(initial, endpoint);
    expect(count(initial, '/api/init')).toBe(1);
    expect(count(initial, '/api/aimodels')).toBe(0);
    expect(initial.filter((url) => /\/api\/(file|conversation)\/\d+/.test(new URL(url).pathname))).toEqual(
      [],
    );
    reads.length = 0;
    cancelled = 0;
    for (let index = 0; index < 100; index++) {
      for (const [name, data] of [
        ['FileAddedEvent', { id: 1000 + index }],
        ['CoinBalanceChangedEvent', {}],
        ['TaskFinishedEvent', { id: `finished-${index}`, session: `image-${index}` }],
      ])
        state.socket!.send(
          '42/gnosisai,' + JSON.stringify(['transportSocketEvent', { uid: crypto.randomUUID(), name, data }]),
        );
    }
    await expect.poll(() => count(reads, endpoint)).toBeGreaterThan(0);
    await page.waitForTimeout(700);
    expect(count(reads, endpoint)).toBeLessThanOrEqual(initialLists);
    expect(count(reads, '/api/init')).toBe(1);
    expect(count(reads, '/api/task')).toBe(1);
    expect(count(reads, '/api/aimodels')).toBe(0);
    expect(reads.filter((url) => /\/api\/(file|conversation)\/\d+/.test(new URL(url).pathname))).toEqual([]);
    expect(cancelled).toBe(0);
    await expect(page.locator(selector)).toHaveCount(24);
    expect(state.tasks).toHaveLength(0);
  });
}

test('video duration dims as a whole while its studio conversation is running', async ({ page }) => {
  const state = await mockApi(page);
  const model = catalog.find(
    (item) =>
      item.reference.provider === 'OPEN_ROUTER_VIDEO' &&
      item.schema.properties?.options?.properties?.duration,
  )!;
  const conversation: IConversation = {
    ...savedConversation(),
    status: 'LOADING',
    options: {
      model: agent.reference.model,
      tools: [{ uid: 'VIDEO', settings: { model: model.reference, options: {} } }],
    },
  };
  state.conversations.push(conversation);
  await page.goto('/chat?conversation=101');
  const duration = page.getByRole('group', { name: 'Длительность видео', exact: true });
  await expect(duration).toBeVisible();
  await expect(duration).toHaveAttribute('aria-disabled', 'true');
  await expect(duration.getByRole('button', { name: 'Короче', exact: true })).toBeDisabled();
  await expect(duration.getByRole('button', { name: 'Длиннее', exact: true })).toBeDisabled();
  await expect(duration).toHaveCSS('opacity', '0.45');
  await expect.poll(() => !!state.socket).toBeTruthy();
  conversation.status = 'LOADED';
  state.socket!.send(
    '42/gnosisai,' +
      JSON.stringify([
        'transportSocketEvent',
        {
          uid: crypto.randomUUID(),
          name: 'ConversationChangedEvent',
          data: { id: 101, item: { status: 'LOADED' } },
        },
      ]),
  );
  await expect(duration).toHaveAttribute('aria-disabled', 'false');
  await expect(duration).toHaveCSS('opacity', '1');
  expect(state.sends).toHaveLength(0);
  expect(state.tasks).toHaveLength(0);
});
