import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { IConversation, IConversationMessage, IModelDescription } from '../../src/lib/types';
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
        { uid: 'IMAGE', settings: { model: catalog[0].reference, options: { quality: 'high' } } },
        { uid: 'VIDEO' },
      ],
    },
    tags: ['genfactory'],
    createdDate: file.createdDate,
  };
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
    forbidden: [] as string[],
    abortAfterAccept: false,
    uploads: 0,
    edits: [] as any[],
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
    else if (path.startsWith('/api/task/conversation')) body = state.progress;
    else if (path === '/api/aimodel/OPEN_AI_CONVERSATION')
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
        url.searchParams.get('provider') === 'OPEN_AI_CONVERSATION'
          ? [agent]
          : catalog.filter((m) => m.reference.provider === url.searchParams.get('provider'));
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
          (c) => c.userId === conditions.userId && (!conditions.status || c.status === conditions.status),
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
          text: data.text.startsWith('[Genfactory:')
            ? 'Точный промпт для генерации.'
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
    } else if (path === '/api/file' && method === 'GET') body = pagination([file]);
    else if (path === '/api/file' && method === 'POST') body = { ...file, id: 12 + state.uploads++ };
    else if (path === '/api/file/12') body = file;
    else if (/^\/api\/file\/\d+$/.test(path) && Number(path.split('/').pop()) < 12 + state.uploads)
      body = { ...file, id: Number(path.split('/').pop()) };
    else if (path === '/api/paymentTransaction') body = pagination([]);
    else if (path === '/api/logout') body = {};
    else {
      state.forbidden.push(path);
      status = 404;
      body = { message: 'Unexpected endpoint' };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return state;
}
async function submit(page: Page, prompt = 'A calm cinematic forest', kind = 'image') {
  await page.getByLabel('Ваша идея', { exact: true }).fill(prompt);
  await page
    .getByRole('button', { name: kind === 'image' ? 'Создать изображение' : 'Создать видео', exact: true })
    .click();
}
test('guest can explore and open a studio without fabricated models', async ({ page }) => {
  await mockApi(page, false);
  await page.goto('/');
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Изображения', exact: true }).click();
  await page.getByRole('button', { name: 'Войти и создать' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('image studio creates a configured conversation and sends tool preferences, never task or fileBuffer', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/image');
  await submit(page);
  await expect(page.getByText('Готово: результат сохранён.', { exact: true })).toBeVisible();
  expect(state.creates[0].model).toBe('OPEN_AI_CONVERSATION');
  expect(state.creates[0].options.tools.map((t: any) => t.uid)).toEqual(['IMAGE', 'VIDEO']);
  expect(state.sends[0].settings.tools[0].settings.model).toEqual(catalog[0].reference);
  expect(state.sends[0].settings.tools[0].settings.options).not.toHaveProperty('model');
  expect(state.forbidden).toEqual([]);
  await expect(page).toHaveURL(/conversation=101/);
  await page.screenshot({ path: 'test-results/studio-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Библиотека', exact: true }).click();
  await expect(page.getByRole('button', { name: /Test result/ })).toBeVisible();
});
test('invalid parameters do not create or execute a conversation', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/image');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page.getByLabel('Размер', { exact: true }).fill('invalid');
  await submit(page);
  await expect(page.getByRole('alert')).toContainText('pattern');
  expect(state.creates).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
});
test('video settings use VIDEO and server message attachments', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/video');
  await submit(page, 'City camera movement', 'video');
  await expect(page.getByText('Готово: результат сохранён.', { exact: true })).toBeVisible();
  expect(state.sends[0].settings.tools[0].uid).toBe('VIDEO');
  expect(state.sends[0].settings.tools[0].settings.model.provider).toBe('OPEN_ROUTER_VIDEO');
  await expect(page.locator('.result-grid video')).toHaveCount(1);
  expect(state.forbidden).toEqual([]);
});
test('accepted message with lost response recovers from server after reload without a second POST', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.abortAfterAccept = true;
  await page.goto('/image');
  await submit(page);
  await expect(page.getByRole('alert')).toContainText('Автоматического повтора нет');
  await page.reload();
  await expect(page.getByText('Готово: результат сохранён.', { exact: true })).toBeVisible();
  expect(state.sends).toHaveLength(1);
  expect(state.creates).toHaveLength(1);
  expect(
    await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('genfactory.jobs'))),
  ).toBe(false);
});
test('history opens server conversation on a fresh visit and continues it', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
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
  await page.getByRole('link', { name: 'Открыть изображения' }).click();
  await expect(page.getByText('Existing server result')).toBeVisible();
  await expect(page.getByLabel('Качество', { exact: true })).toHaveValue('"high"');
  await page.getByRole('button', { name: 'Создать с нуля', exact: true }).click();
  await submit(page, 'Another landscape');
  await expect(page.getByText('Готово: результат сохранён.', { exact: true })).toBeVisible();
  expect(state.creates).toHaveLength(0);
  expect(state.sends[0].id).toBe(101);
});
test('image to video keeps the same conversation and sends the chosen file ID', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/image');
  await submit(page);
  await page.getByRole('button', { name: 'Оживить', exact: true }).click();
  await expect(page).toHaveURL(/video\?conversation=101/);
  await expect(page.getByLabel('Ваша идея')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  await submit(page, 'Animate this image', 'video');
  await expect.poll(() => state.sends.length).toBe(2);
  expect(state.sends[1].id).toBe(101);
  expect(state.sends[1].files).toEqual([12]);
  expect(state.sends[1].settings.tools[0].uid).toBe('VIDEO');
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
  await expect(page.getByLabel('Модель', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Библиотека', exact: true }).click();
  await page.getByRole('button', { name: /Test result/ }).click();
  await openViewerActions(page);
  await page.getByRole('button', { name: 'Использовать как референс' }).click();
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  await submit(page, 'Use this reference');
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([12]);
});
test('running conversation survives page load and blocks a second send until server completion', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push({ ...savedConversation(), status: 'LOADING' });
  await page.goto('/image?conversation=101');
  await expect(page.getByText('Ассистент работает. Результат появится в этой беседе.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Создаём вашу идею' })).toBeDisabled();
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
  await expect(page.getByText('Recovered result')).toBeVisible({ timeout: 10000 });
  expect(state.sends).toHaveLength(0);
});
test('new work creates a new conversation while subsequent prompts reuse the current one', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/image');
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
test('mobile navigation and layout remain usable', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: 'Видео', exact: true })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Войти в аккаунт', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('genfactory.session'))).toBeNull();
});

test('OAuth callback rejects a mismatched state without exchanging the code', async ({ page }) => {
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
});

test('foreign conversation response is not displayed even to an administrator session', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push({ ...savedConversation(), userId: 8, name: 'Private foreign work' });
  state.messages.set(101, [
    {
      id: 1,
      role: 'ASSISTANT',
      text: 'Private foreign result',
      files: [file],
      createdDate: file.createdDate,
    },
  ]);
  await page.goto('/image?conversation=101');
  await expect(page.getByRole('alert')).toContainText('другому аккаунту');
  await expect(page.getByText('Private foreign result')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Создать изображение', exact: true })).toBeDisabled();
  expect(state.sends).toHaveLength(0);
});

test('conversation without a media tool remains read-only instead of changing its configuration', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push({ ...savedConversation(), options: { model: agent.reference.model, tools: [] } });
  await page.goto('/image?conversation=101');
  await expect(page.getByText(/В этой беседе не подключён инструмент изображений/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Создать изображение', exact: true })).toBeDisabled();
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
  await page.goto('/image');
  const started = page.waitForRequest(
    (r) => new URL(r.url()).pathname === '/api/conversation' && r.method() === 'POST',
  );
  await submit(page);
  await started;
  await page
    .getByRole('navigation', { name: 'Основное меню' })
    .getByRole('link', { name: 'Библиотека', exact: true })
    .click();
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
  await expect(page.getByRole('button', { name: 'Выйти из студии' })).not.toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('genfactory.session'))).toBeNull();
  await second.close();
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
  await expect(page.getByText('Создаём изображение: ошибка инструмента')).toBeVisible();
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

test('select arrows stay inside controls at desktop and mobile widths with long model names', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/image');
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

test('inspiration prompt survives a return to the cached image editor', async ({ page }) => {
  await mockApi(page);
  await page.goto('/image');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page.getByRole('link', { name: 'Обзор', exact: true }).click();
  await page.locator('.inspiration-card').first().click();
  await expect(page.getByLabel('Ваша идея', { exact: true })).not.toHaveValue('');
});

test('reference survives restoration of a different saved video model', async ({ page }) => {
  const state = await mockApi(page);
  const videoModels = catalog.filter((m) => m.reference.provider === 'OPEN_ROUTER_VIDEO');
  const conversation = savedConversation();
  conversation.options.tools = [
    { uid: 'IMAGE', settings: { model: catalog[0].reference } },
    { uid: 'VIDEO', settings: { model: videoModels[1].reference } },
  ];
  state.conversations.push(conversation);
  state.messages.set(101, [{ id: 1, role: 'ASSISTANT', files: [file], createdDate: file.createdDate }]);
  await page.goto('/image?conversation=101');
  await page.getByRole('button', { name: 'Оживить', exact: true }).click();
  await expect(page.getByLabel('Модель', { exact: true })).toHaveValue(
    `${videoModels[1].reference.provider}:${videoModels[1].reference.model}`,
  );
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  await submit(page, 'Animate the reference', 'video');
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([12]);
});

test('upload attaches a file, removal excludes it from the message', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/image');
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

test('upload rejects unsupported format and too many references before any upload', async ({ page }) => {
  await mockApi(page);
  let uploads = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/file' && r.method() === 'POST') uploads++;
  });
  await page.goto('/image');
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

test('a late upload does not attach to a new work', async ({ page }) => {
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
  await page.goto('/image');
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

test('invalid and missing conversations do not show an endless loading indicator', async ({ page }) => {
  await mockApi(page);
  for (const id of ['invalid', '999']) {
    await page.goto(`/image?conversation=${id}`);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Загружаем рабочую беседу…')).toHaveCount(0);
    await page.getByLabel('Ваша идея', { exact: true }).fill('Try generation');
    await expect(page.getByRole('button', { name: 'Создать изображение', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Новая работа' }).click();
    await expect(page).toHaveURL(/\/image$/);
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
    await page
      .getByLabel('Модель', { exact: true })
      .selectOption(`${model.reference.provider}:${model.reference.model}`);
    if (model.schema.properties?.task?.required?.includes('fileIds')) {
      await page
        .locator('input[type=file]')
        .setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from('test') });
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
  await page.getByRole('link', { name: 'Открыть изображения' }).click();
  await expect(page.getByText('Messages page 0')).toBeVisible();
  await page.getByRole('button', { name: 'Ранее', exact: true }).click();
  await expect(page.getByText('Messages page 1')).toBeVisible();
  await page.getByRole('button', { name: 'Новее', exact: true }).click();
  await expect(page.getByText('Messages page 0')).toBeVisible();
  await page.getByRole('button', { name: 'Ранее', exact: true }).click();
  await expect(page.getByText('Messages page 1')).toBeVisible();
  await page.getByRole('button', { name: 'Создать с нуля', exact: true }).click();
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
  await page.getByLabel('Ваша идея', { exact: true }).fill('A new idea');
  await expect(page.getByRole('button', { name: 'Создать изображение', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Загрузить снова' })).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Загрузить снова' }).click();
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await submit(page);
  await expect.poll(() => state.sends.length).toBe(1);
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
  await expect(page.getByRole('alert')).toContainText('Storage temporarily unavailable');
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
  await expect(page).toHaveURL(/sso\.example\.test.*openid-connect\/logout/);
  const state = await page.context().storageState();
  expect(
    state.origins
      .find((o) => o.origin === 'http://127.0.0.1:5173')
      ?.localStorage.some((item) => item.name === 'genfactory.session'),
  ).toBeFalsy();
});

test('valid OAuth callback exchanges the code once and removes it from the URL', async ({ page }) => {
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
  await expect(page).toHaveURL(/\/image$/);
  await expect(page.getByRole('link', { name: 'Открыть аккаунт' })).toBeVisible();
  expect(exchanges).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('genfactory.session'))).toBe('new-session');
});

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
  await page.getByRole('button', { name: 'Создать изображение', exact: true }).click();
  await expect(page).toHaveURL(/\/image$/);
  await page.getByRole('link', { name: 'История', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Каждая идея оставляет след' })).toBeVisible();
  await page.goto('/does-not-exist');
  await page.getByRole('link', { name: 'Вернуться в студию' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
});

test('edit-only models explain the required reference and never submit without it', async ({ page }) => {
  const state = await mockApi(page);
  const model = catalog.find((m) => m.reference.model === 'krea/k3-edit')!;
  await page.goto('/image');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page
    .getByLabel('Модель', { exact: true })
    .selectOption(`${model.reference.provider}:${model.reference.model}`);
  await expect(page.getByText(/Эта модель работает с исходными изображениями/)).toBeVisible();
  await submit(page, 'Change the image');
  await expect(page.getByRole('alert')).toContainText('Добавьте референсы');
  expect(state.creates).toHaveLength(0);
  expect(state.sends).toHaveLength(0);
});

test('unavailable image and video previews show a readable fallback', async ({ page }) => {
  await mockApi(page);
  await page.route('**/media/gallery-1.jpg', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/library');
  await expect(page.getByText('Предпросмотр недоступен')).toBeVisible();
  await page.getByRole('button', { name: /Test result/ }).click();
  await expect(page.getByRole('dialog').getByText('Предпросмотр недоступен')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.route('**/api/file?*', (route) =>
    route.fulfill({
      json: pagination([{ ...file, type: 'VIDEO', mime: 'video/mp4', path: '/missing-audit-video.mp4' }]),
    }),
  );
  await page.route('**/missing-audit-video.mp4', (route) => route.fulfill({ status: 404, body: '' }));
  await page.getByRole('button', { name: 'Видео', exact: true }).click();
  await expect(page.getByText('Предпросмотр недоступен')).toBeVisible();
});

test('workspace chat defaults to no tools, continues a server conversation and shows plain user text', async ({
  page,
}) => {
  const state = await mockApi(page);
  await page.goto('/chat');
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
  await page.getByRole('button', { name: 'Из библиотеки', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Test result/ })
    .click();
  await page.getByLabel('Язык промпта').selectOption('English');
  await page.getByLabel('Ваш запрос', { exact: true }).fill('Сохрани объект и замени фон');
  await openViewerActions(page);
  await page.getByRole('button', { name: 'Подготовить промпт', exact: true }).click();
  await expect(page.getByText('Точный промпт для генерации.', { exact: true })).toBeVisible();
  expect(state.sends[0].files).toEqual([12]);
  expect(state.sends[0].text).toContain('English');
  await page.getByRole('button', { name: 'В задачу изображения', exact: true }).last().click();
  await expect(page.getByLabel('Ваша идея', { exact: true })).toHaveValue('Точный промпт для генерации.');
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  expect(state.sends).toHaveLength(1);
  await submit(page, 'Готовый промпт с референсом');
  await expect.poll(() => state.sends.length).toBe(2);
  expect(state.sends[1].files).toEqual([12]);
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
  await expect(page).toHaveURL(/chat\?conversation=101/);
  await expect(page.getByRole('heading', { name: 'Обсудить идею' })).toBeVisible();
  await page.getByLabel('Ваш запрос', { exact: true }).fill('Измени концовку');
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
  await page.goto('/chat?conversation=101');
  await page.getByText('Инструменты · 0', { exact: true }).click();
  await page.getByLabel('Поиск в Яндексе', { exact: true }).check();
  await page.getByRole('button', { name: 'Сохранить инструменты' }).click();
  await expect(page.getByText('Инструменты сохранены.')).toBeVisible();
  expect(state.edits[0].files).toEqual([12]);
  expect(state.edits[0].options.tools).toEqual([{ uid: 'YANDEX' }]);
  expect(state.sends).toHaveLength(0);
});

test('workspace brand versions are opt-in, survive reload and enter generation instructions', async ({
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
  await page.getByRole('link', { name: 'Изображения', exact: true }).click();
  await page.getByLabel('Использовать правила бренда').check();
  await page.getByText('Съёмка и стиль', { exact: true }).click();
  await page.getByLabel('Свет', { exact: true }).fill('Мягкий боковой');
  await submit(page, 'Предметный кадр');
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].text).toContain('Только зелёный и белый');
  expect(state.sends[0].text).toContain('Мягкий боковой');
});

test('workspace custom templates restore prompt model and options', async ({ page }) => {
  await mockApi(page);
  await page.goto('/image');
  await expect(page.getByLabel('Модель', { exact: true })).toBeEnabled();
  await page.getByLabel('Ваша идея', { exact: true }).fill('Мой предметный кадр');
  await page.getByLabel('Качество', { exact: true }).selectOption('"high"');
  await page.getByText('Сохранить как шаблон', { exact: true }).click();
  await page.getByLabel('Название шаблона').fill('Мой сценарий');
  await page.getByRole('button', { name: 'Сохранить шаблон', exact: true }).click();
  await page.getByRole('link', { name: 'Шаблоны', exact: true }).click();
  await page.getByRole('button', { name: 'Мои', exact: true }).click();
  await page.getByRole('button', { name: 'Использовать шаблон', exact: true }).click();
  await expect(page.getByLabel('Ваша идея', { exact: true })).toHaveValue('Мой предметный кадр');
  await expect(page.getByLabel('Качество', { exact: true })).toHaveValue('"high"');
});

test('workspace library picker attaches a reference without leaving the image editor', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/image');
  await page.getByRole('button', { name: 'Из библиотеки', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Test result/ })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await submit(page, 'Use the selected image');
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([12]);
});

test('workspace history supports rename favorites local archive and a running filter', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push({ ...savedConversation(), files: [file] });
  await page.goto('/history');
  await page.getByRole('button', { name: 'Переименовать', exact: true }).click();
  await page.getByLabel('Новое название').fill('Новая кампания');
  await page.getByRole('button', { name: 'Сохранить название' }).click();
  await expect(page.getByRole('heading', { name: 'Новая кампания' })).toBeVisible();
  expect(state.edits[0].files).toEqual([12]);
  await page.getByRole('button', { name: '☆ В избранное', exact: true }).click();
  await page.getByRole('button', { name: 'Избранное', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Новая кампания' })).toBeVisible();
  await page.getByRole('button', { name: 'В архив', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Новая кампания' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Архив', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Новая кампания' })).toBeVisible();
  await page.getByRole('button', { name: 'Вернуть из архива', exact: true }).click();
  const request = page.waitForRequest(
    (r) =>
      new URL(r.url()).pathname === '/api/conversation' &&
      JSON.parse(new URL(r.url()).searchParams.get('conditions') || '{}').status === 'LOADING',
  );
  await page.getByRole('button', { name: 'В работе', exact: true }).click();
  await request;
});

test('workspace video prompt extracts three frames without uploading the source video', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/prompt');
  await expect(page.getByLabel('Ассистент', { exact: true })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .setInputFiles(new URL('../fixtures/preview.mp4', import.meta.url).pathname);
  await expect(
    page.getByText(
      'Из видео извлечены три кадра. Анализируется изображение, без звука и непрерывного движения.',
    ),
  ).toBeVisible();
  expect(state.uploads).toBe(3);
  await expect(page.locator('.reference')).toHaveCount(3);
  await page.getByLabel('Ваш запрос', { exact: true }).fill('Опиши визуальный стиль');
  await openViewerActions(page);
  await page.getByRole('button', { name: 'Подготовить промпт', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([12, 13, 14]);
});

test('workspace lost response reports the error after the new conversation navigation', async ({ page }) => {
  const state = await mockApi(page);
  state.abortAfterAccept = true;
  await page.goto('/chat');
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
  await page.goto('/chat');
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
  await page.route('**/api/init', (route) =>
    route.fulfill({ json: { user: { id: 8, preferences: { name: 'Other user' } }, balances: { RUB: '0' } } }),
  );
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
  await page.getByRole('link', { name: 'Шаблоны', exact: true }).click();
  await expect(page.getByText('PRIVATE TEMPLATE')).toHaveCount(0);
});

test('persists and restores media drafts with account-owned references', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/image');
  const modelKey = `${catalog[1].reference.provider}:${catalog[1].reference.model}`;
  await page.getByLabel('Модель', { exact: true }).selectOption(modelKey);
  await page.getByLabel('Качество', { exact: true }).selectOption('high');
  await page.getByLabel('Ваша идея', { exact: true }).fill('Сохранённая идея');
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
  await expect(page.getByLabel('Ваша идея', { exact: true })).toHaveValue('Сохранённая идея');
  await expect(page.getByLabel('Модель', { exact: true })).toHaveValue(modelKey);
  await expect(page.getByLabel('Качество', { exact: true })).toHaveValue(JSON.stringify('high'));
  await expect(page.getByRole('button', { name: 'Убрать Test result', exact: true })).toBeVisible();
  expect(state.sends).toHaveLength(0);
});

test('restores text draft after navigation without sending a message', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/prompt');
  await page.locator('.composer textarea').fill('Черновик промпта');
  await page
    .getByRole('navigation', { name: 'Основное меню' })
    .getByRole('link', { name: 'Библиотека' })
    .click();
  await page.goto('/prompt');
  await page.getByRole('button', { name: 'Восстановить черновик' }).click();
  await expect(page.locator('.composer textarea')).toHaveValue('Черновик промпта');
  expect(state.sends).toHaveLength(0);
});

test('searches models and keeps favorite models after reload', async ({ page }) => {
  await mockApi(page);
  await page.goto('/image');
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
  await page.goto('/library');
  await page.getByRole('button', { name: 'Активные работы: 1' }).click();
  await expect(page.getByRole('dialog').getByText('Saved creative work')).toBeVisible();
  c.status = 'ERROR';
  await page.getByRole('button', { name: 'Обновить статусы' }).click();
  await expect(page.getByRole('dialog').getByText('Нет выполняющихся работ.')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByText('Работа завершилась с ошибкой: Saved creative work')).toBeVisible();
});

test('pastes and reorders reference files and preserves order in the request', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/image');
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
  await page.getByRole('button', { name: 'Следующий файл' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Second image' })).toBeVisible();
  await openViewerActions(page);
  await page.getByRole('button', { name: 'Использовать как референс', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Убрать Second image', exact: true })).toBeVisible();
  await expect(page.getByLabel('Ваша идея')).toBeFocused();
});

test('mobile workspace and model browser stay within the viewport', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/image', '/video', '/prompt', '/brand', '/library']) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: 'Открыть аккаунт' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto('/image');
  await page.getByRole('button', { name: 'Поиск и избранные модели' }).click();
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('repeat restores the exact local run settings and never sends until confirmed', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/image');
  const key = `${catalog[1].reference.provider}:${catalog[1].reference.model}`;
  await page.getByLabel('Модель', { exact: true }).selectOption(key);
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
  await expect(page).toHaveURL(/\/image$/);
  await expect(page.getByLabel('Ваша идея', { exact: true })).toHaveValue('Вариант для повторения');
  await expect(page.getByLabel('Модель', { exact: true })).toHaveValue(key);
  await expect(page.getByLabel('Качество', { exact: true })).toHaveValue(JSON.stringify('high'));
  expect(state.sends).toHaveLength(1);
  expect(state.creates).toHaveLength(1);
  await submit(page, 'Изменённый вариант');
  await expect.poll(() => state.sends.length).toBe(2);
  expect(state.creates).toHaveLength(2);
  expect(state.sends[1].files).toEqual([12]);
});

test('old variants explain unknown settings instead of using conversation defaults as history', async ({
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
  await page.goto('/image?conversation=101');
  await page.getByText('История вариантов', { exact: true }).click();
  await expect(page.getByText('Исходные модель и настройки неизвестны.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Повторить с изменениями' }).click();
  await expect(page.getByLabel('Ваша идея', { exact: true })).toHaveValue('Старый запрос');
  await expect(page.getByText(/Исходные параметры запуска неизвестны/)).toBeVisible();
  expect(state.sends).toHaveLength(0);
});

test('expanded editor sections have consistent spacing on desktop and mobile', async ({ page }) => {
  await mockApi(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/image');
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

test('leaving during repeat attachment checks does not navigate back into the editor', async ({ page }) => {
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
  await page.goto('/image?conversation=101');
  await page.getByText('История вариантов', { exact: true }).click();
  await page.getByRole('button', { name: 'Повторить с изменениями' }).click();
  await expect.poll(() => requested).toBe(true);
  await page
    .getByRole('navigation', { name: 'Основное меню' })
    .getByRole('link', { name: 'Библиотека', exact: true })
    .click();
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
  await page.goto('/video?conversation=101');
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
  expect(state.edits).toHaveLength(1);
  expect(state.edits[0].system).toContain('Только при явном выборе');
  expect(state.edits[0].system).toContain('Custom suffix.');
  await expect(page.getByLabel('Ваша идея', { exact: true })).toHaveValue('');
  await submit(page, 'Теперь добавь свет', 'video');
  await expect.poll(() => state.sends.length).toBe(2);
  expect(state.sends[1].files).toEqual([12]);
  expect(state.edits).toHaveLength(1);
});

test('fresh choice and cancelling the chooser do not submit; choosing another uses the library', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  state.messages.set(101, [{ id: 1, role: 'ASSISTANT', files: [file], createdDate: file.createdDate }]);
  await page.goto('/image?conversation=101');
  await submit(page, 'Другой сюжет');
  const dialog = page.getByRole('dialog', { name: 'Использовать предыдущий результат?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  expect(state.sends).toHaveLength(0);
  await page.getByRole('button', { name: 'Создать изображение', exact: true }).click();
  await dialog.getByRole('button', { name: 'Выбрать другой' }).click();
  await page
    .getByRole('dialog', { name: 'Выбрать референс' })
    .getByRole('button', { name: /Test result/ })
    .click();
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  expect(state.sends).toHaveLength(0);
  await page.getByRole('button', { name: 'Создать с нуля', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Создать изображение', exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  expect(state.sends[0].files).toEqual([]);
  expect(state.sends[0].text).toContain('Создай с нуля');
});

test('missing reference blocks paid submission instead of silently generating from scratch', async ({
  page,
}) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  state.messages.set(101, [{ id: 1, role: 'ASSISTANT', files: [file], createdDate: file.createdDate }]);
  await page.route('**/api/file/12', (route) =>
    route.fulfill({ status: 404, json: { message: 'Reference unavailable' } }),
  );
  await page.goto('/image?conversation=101');
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
  await page.goto('/video?conversation=101');
  await page.getByRole('button', { name: 'Выбрать из беседы', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Использовать предыдущий результат?' });
  await expect(dialog.getByText(longFile.name)).toBeVisible();
  await page.screenshot({ path: 'test-results/reference-choice-mobile.png' });
  await dialog.getByRole('button', { name: 'Использовать', exact: true }).click();
  await expect(page.getByRole('button', { name: `Убрать ${longFile.name}` })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.sends).toHaveLength(0);
});

test('failed legacy instruction update blocks generation and keeps the chosen reference', async ({
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
  await page.goto('/image?conversation=101');
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await submit(page, 'Добавь свет');
  await expect(page.getByText(/Instruction update failed/)).toBeVisible();
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
    await page.getByRole('link', { name: 'Шаблоны', exact: true }).click();
    await page.getByRole('button', { name: 'Использовать шаблон', exact: true }).first().click();
    await expect(page.getByLabel('Ваша идея', { exact: true })).not.toHaveValue('');
    const generate = page.getByRole('button', { name: 'Создать изображение', exact: true });
    await expect(generate).toBeEnabled();
    expect(state.sends).toHaveLength(0);
    await generate.click();
    await expect.poll(() => state.sends.length).toBe(1);
    expect(state.sends[0].id).toBe(102);
  } finally {
    release();
  }
});

test('balance history shows exact costs and sends numeric date filters with owner scope and pagination', async ({
  page,
}) => {
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
                tools: [{ type: 'IMAGE', status: 'FINAL', amounts: [{ amount: '0.08219', coinId: 'USD' }] }],
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
  await history.getByText('Детализация операции', { exact: true }).click();
  await expect(history.getByText('9,6516 ₽', { exact: true })).toBeVisible();
  await expect(history.getByText('8,219 ₽', { exact: true })).toBeVisible();
  await expect(history.getByText('1,4326 ₽', { exact: true })).toBeVisible();
  await expect(history.getByRole('link', { name: 'Беседа №49' })).toHaveAttribute(
    'href',
    '/image?conversation=49',
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
  await history.getByLabel('Валюта', { exact: true }).selectOption('RUB');
  await expect.poll(() => requests.at(-1)?.conditions.coinId).toBe('RUB');
});

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
    expect(await card.evaluate((el) => getComputedStyle(el).rowGap)).toBe('16px');
    await card.getByRole('button', { name: 'Переименовать' }).click();
    await expect(card.getByLabel('Новое название')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/history-release-${width}.png`, fullPage: true });
  }
});

for (const withIdToken of [true, false]) {
  test(`logout ends Keycloak SSO ${withIdToken ? 'with ID token' : 'for a legacy session without ID token'}`, async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto('/account');
    if (withIdToken) await page.evaluate(() => sessionStorage.setItem('genfactory.idToken', 'test-id-token'));
    const logout = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/logout');
    await page.getByRole('button', { name: 'Выйти из студии' }).click();
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
  });
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
  await expect(page.getByText('Предпросмотр недоступен')).toBeVisible();
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

test('edit action focuses the prompt without sending another generation', async ({ page }) => {
  const state = await mockApi(page);
  state.conversations.push(savedConversation());
  state.messages.set(101, [{ id: 1, role: 'ASSISTANT', files: [file], createdDate: file.createdDate }]);
  await page.goto('/image?conversation=101');
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await expect(page.getByLabel('Ваша идея')).toBeFocused();
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
  await expect(page.getByText('Без превью', { exact: true })).toBeVisible();
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
  await expect(page.getByRole('link', { name: 'Открыть работу Saved creative work' })).toHaveAttribute(
    'href',
    '/image?conversation=101',
  );
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
  await expect(page.getByRole('button', { name: 'Создать изображение', exact: true })).toBeVisible();
});

test('history video cover opens video and a broken poster falls back', async ({ page }) => {
  const state = await mockApi(page);
  const conversation = savedConversation();
  conversation.preview = {
    image: { status: 'READY', url: '/missing-history-poster.webp' },
    video: { status: 'READY', url: '/test-video.mp4' },
  };
  state.conversations.push(conversation);
  await page.route('**/missing-history-poster.webp', (route) => route.fulfill({ status: 404 }));
  await page.goto('/history');
  const cover = page.getByRole('link', { name: 'Открыть работу Saved creative work' });
  await expect(cover).toHaveAttribute('href', '/video?conversation=101');
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
  await page.getByRole('button', { name: 'Project folder Папка', exact: true }).click();
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
  await page.getByRole('button', { name: 'Все файлы', exact: true }).click();
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
  await page.getByRole('button', { name: 'Из библиотеки', exact: true }).click();
  await page.getByRole('button', { name: /Reference alias/ }).click();
  await expect(page.getByRole('button', { name: `Убрать ${file.name}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Убрать ${file.name}`, exact: true }).click();
  await page.route('**/api/file/12', (route) =>
    route.fulfill({ status: 404, json: { message: 'Файл удалён' } }),
  );
  await page.getByRole('button', { name: 'Из библиотеки', exact: true }).click();
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

test('new conversation carries result folder and tags without changing reference IDs', async ({ page }) => {
  const state = await mockApi(page);
  const folder = { ...file, id: 80, uid: 'results-folder', name: 'Campaign results', type: 'DIRECTORY' };
  await page.route('**/api/file?*', (route) => route.fulfill({ json: pagination([folder]) }));
  await page.goto('/image');
  await page.getByText('Куда сохранять результаты', { exact: true }).click();
  await page.getByRole('button', { name: 'Папка результатов', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Campaign results Папка', exact: true }).click();
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
  await page.getByRole('heading', { name: 'Библиотека', exact: true }).click();
  await expect(entry.locator('details')).not.toHaveAttribute('open');
});

test('tag chips and suggestions filter the entire library with explicit all or any matching', async ({
  page,
}) => {
  await mockApi(page);
  const conditions: any[] = [];
  await page.route('**/api/file?*', (route) => {
    conditions.push(JSON.parse(new URL(route.request().url()).searchParams.get('conditions')!));
    return route.fulfill({ json: pagination([{ ...file, tags: ['Catalog'] }]) });
  });
  await page.route('**/api/fileTag?*', (route) =>
    route.fulfill({
      json: pagination([
        { tag: 'catalog', count: 5 },
        { tag: 'summer', count: 2 },
      ]),
    }),
  );
  await page.goto('/library');
  await page.getByRole('button', { name: 'Файлы с тегом Catalog', exact: true }).click();
  await expect.poll(() => conditions.at(-1)?.tags?.condition).toBe('INCLUDES_ALL');
  expect(conditions.at(-1).directory).toBeUndefined();
  expect(conditions.at(-1).tags.value).toEqual(['catalog']);
  await page.getByText('Фильтр по тегам (1)', { exact: true }).click();
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
    reference: { provider: `TEST_${kind}`, model: `test-${kind.toLowerCase()}` },
    name: `Catalog ${kind}`,
    schema: {
      type: 'object',
      required: ['model', 'task', 'options'],
      properties: {
        model: { const: `TEST_${kind}` },
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
  await page.route('**/api/aimodel/OPEN_AI_CONVERSATION', (route) =>
    route.fulfill({ json: { tools: ['TTS', 'STT'].map((uid) => ({ uid, providers: [`TEST_${uid}`] })) } }),
  );
  await page.route('**/api/aimodels?provider=TEST_*', (route) =>
    route.fulfill({
      json: models.filter(
        (m) => m.reference.provider === new URL(route.request().url()).searchParams.get('provider'),
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
    settings: { model: { provider: 'TEST_TTS' }, options: { voice: 'second-voice', format: 'flac' } },
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
  expect(state.sends[0].files).toEqual([12]);
  expect(state.sends[0].text).toContain('fileId=12');
  expect(state.sends[0].text).toContain('isFile=true');
  expect(state.sends[0].settings.tools[0]).toMatchObject({
    uid: 'STT',
    settings: { options: { language: 'ru' } },
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
  await page.goto('/chat?conversation=101');
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
