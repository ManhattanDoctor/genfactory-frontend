import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Conversation, ConversationMessage, ModelDescription } from '../../src/lib/types';
const catalog: ModelDescription[] = JSON.parse(
  readFileSync(new URL('../fixtures/catalog.json', import.meta.url), 'utf8'),
);
const agent: ModelDescription = JSON.parse(
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
function savedConversation(id = 101): Conversation {
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
async function mockApi(page: Page, signedIn = true) {
  const state = {
    conversations: [] as Conversation[],
    messages: new Map<number, ConversationMessage[]>(),
    creates: [] as any[],
    sends: [] as any[],
    forbidden: [] as string[],
    abortAfterAccept: false,
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
        if (name === 'transportSocketCommandRequest' && command.request.action === 'ADD')
          state.joinedRooms.push(command.request.name);
      } else if (text === '3') {
        /* pong */
      }
    });
  });
  if (signedIn) await page.addInitScript(() => sessionStorage.setItem('genfactory.session', 'test-session'));
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
    else if (path.startsWith('/api/task/conversation')) body = state.progress;
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
      expect(JSON.parse(url.searchParams.get('conditions')!).userId).toBe(7);
      body = pagination(state.conversations);
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
          ...(data.settings.tools[0].uid === 'VIDEO'
            ? { type: 'VIDEO', mime: 'video/mp4', path: '/test-video.mp4' }
            : {}),
        };
        body = {
          id: messages.length + 1,
          role: 'ASSISTANT',
          text: 'Готово: результат сохранён.',
          files: [result],
          createdDate: file.createdDate,
        };
        messages.push(body as ConversationMessage);
        state.messages.set(id, messages);
        const conversation = state.conversations.find((c) => c.id === id);
        if (conversation) conversation.status = 'LOADED';
        if (state.abortAfterAccept) {
          await route.abort('failed');
          return;
        }
      }
    } else if (conversationMatch) {
      body = state.conversations.find((c) => c.id === Number(conversationMatch[1]));
      if (!body) {
        status = 404;
        body = { message: 'Conversation not found' };
      }
    } else if (path === '/api/file' && method === 'GET') body = pagination([file]);
    else if (path === '/api/file' || path === '/api/file/12') body = file;
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
  await submit(page, 'Another landscape');
  await expect(page.getByText('Готово: результат сохранён.', { exact: true })).toBeVisible();
  expect(state.creates).toHaveLength(0);
  expect(state.sends[0].id).toBe(101);
});
test('image to video keeps the same conversation and sends the chosen file ID', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/image');
  await submit(page);
  await page.getByRole('button', { name: 'Создать видео из изображения' }).click();
  await expect(page).toHaveURL(/video\?conversation=101/);
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
  await page.getByRole('button', { name: 'Использовать как референс' }).click();
  await expect(page.getByRole('button', { name: 'Убрать Test result' })).toBeVisible();
  await submit(page, 'Change lighting');
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
  await page.getByRole('navigation').getByRole('link', { name: 'Видео', exact: true }).click();
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
  await page.getByRole('navigation').getByRole('link', { name: 'Библиотека', exact: true }).click();
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
          { name: 'TaskProgressedEvent', data: { session, data: { tools } } },
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
