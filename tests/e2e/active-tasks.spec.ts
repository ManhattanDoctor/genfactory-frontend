import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { catalogProvider, catalogResponse } from './modelCatalog';
const catalog = JSON.parse(readFileSync(new URL('../fixtures/catalog.json', import.meta.url), 'utf8'));
const pageOf = (items: unknown[]) => ({ items, total: items.length, pages: 1, pageSize: 24, pageIndex: 0 });
const task = (id: string, model: string, extra = {}) => ({
  id,
  model,
  createdDate: '2026-11-10T12:00:00Z',
  ...extra,
});

async function setup(page: Page) {
  const state = {
    active: [] as any[],
    files: [
      {
        id: 12,
        userId: 7,
        uid: 'reference',
        name: 'Референс.png',
        type: 'IMAGE',
        mime: 'image/png',
        path: '/media/gallery-1.jpg',
        createdDate: '2026-11-10T12:00:00Z',
      },
    ] as any[],
    conversations: [] as any[],
    messages: [] as any[],
    socket: undefined as WebSocketRoute | undefined,
    writes: [] as string[],
    taskReads: 0,
  };
  await page.addInitScript(() => localStorage.setItem('genfactory.session', 'active-tasks-test'));
  await page.routeWebSocket('**/socket.io/**', (socket) => {
    state.socket = socket;
    socket.send(
      '0' +
        JSON.stringify({
          sid: 'engine',
          upgrades: [],
          pingInterval: 25000,
          pingTimeout: 20000,
          maxPayload: 1000000,
        }),
    );
    socket.onMessage((message) => {
      const text = String(message);
      if (text.startsWith('40/gnosisai,')) {
        socket.send('40/gnosisai,' + JSON.stringify({ sid: 'namespace' }));
        socket.send('42/gnosisai,' + JSON.stringify(['transportSocketConnected']));
      } else if (text.startsWith('42/gnosisai,')) {
        const [name, command] = JSON.parse(text.slice(text.indexOf('[')));
        if (name === 'transportSocketCommandRequest' && command.isNeedReply)
          socket.send(
            '42/gnosisai,' +
              JSON.stringify([
                'transportSocketCommandResponse',
                { id: command.id, response: command.request.name },
              ]),
          );
      }
    });
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    if (request.method() !== 'GET') state.writes.push(path);
    let body: any = {};
    if (path === '/api/init') body = { user: { id: 7 }, balances: { RUB: '10000' } };
    else if (path === '/api/aimodels')
      body = catalog.filter((model: any) => model.reference.provider === catalogProvider(url));
    else if (path === '/api/task') {
      state.taskReads++;
      body = state.active;
    } else if (path === '/api/conversation') body = pageOf(state.conversations);
    else if (/^\/api\/conversation\/\d+\/message$/.test(path)) body = pageOf(state.messages);
    else if (/^\/api\/conversation\/\d+$/.test(path))
      body = state.conversations.find((item) => item.id === Number(path.split('/').pop())) || {
        id: Number(path.split('/').pop()),
        userId: 7,
        status: 'LOADED',
        options: {},
      };
    else if (path === '/api/file') body = pageOf(state.files);
    else if (/^\/api\/file\/\d+$/.test(path))
      body = state.files.find((item) => item.id === Number(path.split('/').pop()));
    else if (path === '/api/fileTag' || path === '/api/paymentTransaction') body = pageOf([]);
    await route.fulfill({ json: catalogResponse(request.url(), body) });
  });
  const emit = (name: string, data: any) =>
    state.socket!.send(
      '42/gnosisai,' + JSON.stringify(['transportSocketEvent', { uid: crypto.randomUUID(), name, data }]),
    );
  return { state, emit };
}

async function openJobs(page: Page, count: number) {
  const button = page.getByRole('button', { name: `Активные работы: ${count}`, exact: true }).first();
  await expect(button).toBeVisible();
  await button.click();
  return page.getByRole('dialog', { name: 'Активные работы' });
}

test('active task list survives reload and uses the library placeholders for text, sound, image and video', async ({
  page,
}) => {
  const { state } = await setup(page);
  state.active = [
    task('image', 'OPEN_ROUTER_IMAGE'),
    task('video', 'OPEN_ROUTER_VIDEO'),
    task('text', 'OPEN_AI_TEXT'),
    task('sound', 'OPEN_AI_TTS'),
  ];
  await page.goto('/image');
  let jobs = await openJobs(page, 4);
  await expect(jobs.locator('.job-card')).toHaveCount(4);
  await expect(jobs.getByRole('img', { name: /^Изображение:/ })).toBeVisible();
  await expect(jobs.getByRole('img', { name: /^Видео:/ })).toBeVisible();
  await expect(jobs.getByRole('img', { name: /^Документ:/ })).toBeVisible();
  await expect(jobs.getByRole('img', { name: /^Аудиозапись:/ })).toBeVisible();
  await page.reload();
  jobs = await openJobs(page, 4);
  await expect(jobs.locator('.job-card')).toHaveCount(4);
  expect(state.writes).toEqual([]);
});

test('an active generation hides its source and shows the result only on completion', async ({ page }) => {
  const { state, emit } = await setup(page);
  const item = task('image', 'OPEN_ROUTER_IMAGE', { sourceFileIds: [12] });
  const running = task('still-running', 'OPEN_ROUTER_VIDEO');
  state.active = [item, running];
  await page.goto('/image');
  const jobs = await openJobs(page, 2);
  await expect(jobs.locator('.job-card-preview .file-placeholder')).toHaveCount(2);
  await expect(jobs.locator('.job-card-preview img, .job-card-preview video')).toHaveCount(0);
  state.files.push({ ...state.files[0], id: 13, name: 'Результат.png', path: '/media/gallery-2.jpg' });
  state.active = [running];
  await expect.poll(() => !!state.socket).toBe(true);
  const data = { id: item.id, item, result: 'COMPLETED', fileIds: [13] };
  emit('TaskFinishedEvent', data);
  emit('TaskFinishedEvent', data);
  await expect(page.getByRole('button', { name: 'Активные работы: 1', exact: true }).first()).toBeVisible();
  await expect(jobs.locator('.completed-job')).toHaveCount(1);
  await expect(jobs.locator('.completed-job img')).toHaveAttribute('alt', 'Результат.png');
  await expect(jobs.getByText('Готово', { exact: true })).toBeVisible();
  expect(
    await jobs
      .locator('.jobs-grid')
      .evaluate(
        (active) =>
          !!(
            active.compareDocumentPosition(active.parentElement!.querySelector('.completed-jobs')!) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
  ).toBe(true);
  const clear = jobs
    .locator('.modal-head')
    .getByRole('button', { name: 'Очистить уведомления', exact: true });
  await expect(clear).toBeEnabled();
  await clear.click();
  await expect(jobs.locator('.completed-jobs')).toHaveCount(0);
  await expect(jobs.locator('.jobs-grid .job-card')).toHaveCount(1);
  await expect(clear).toBeDisabled();
  expect(state.writes).toEqual([]);
});

test('a finished parent leaves its independently running child visible', async ({ page }) => {
  const { state, emit } = await setup(page);
  const parent = task('parent', 'OPEN_AI_CONVERSATION');
  const child = task('child', 'OPEN_ROUTER_VIDEO', { parentTaskId: 'parent' });
  state.active = [parent, child];
  state.conversations = [
    {
      id: 101,
      userId: 7,
      name: 'Беседа',
      model: 'OPEN_AI_CONVERSATION',
      status: 'LOADING',
      options: {},
      tags: ['chat'],
      createdDate: parent.createdDate,
    },
  ];
  await page.goto('/image');
  const jobs = await openJobs(page, 1);
  await expect(jobs.locator('.jobs-grid .job-card')).toHaveCount(1);
  state.active = [child];
  state.conversations[0].status = 'LOADED';
  emit('TaskFinishedEvent', { id: parent.id, item: parent, result: 'COMPLETED' });
  await expect(jobs.locator('.jobs-grid .job-card')).toHaveCount(1);
  await expect(jobs.locator('.jobs-grid .job-card')).toContainText(['Создаём видео']);
});

for (const result of ['FAILED', 'CANCELLED'] as const) {
  for (const parentTaskId of [undefined, 'finished-parent']) {
    test(`${parentTaskId ? 'Orphaned child: ' : ''}${result} removes the execution and shows its terminal status without retry`, async ({
      page,
    }) => {
      const { state, emit } = await setup(page);
      const item = task('task', 'OPEN_AI_TTS', { parentTaskId });
      state.active = [item];
      await page.goto('/image');
      const jobs = await openJobs(page, 1);
      state.active = [];
      await expect.poll(() => !!state.socket).toBe(true);
      emit('TaskFinishedEvent', {
        id: item.id,
        item,
        result,
        error: { code: result, message: 'Task failed' },
      });
      await expect(
        page.getByRole('button', { name: 'Активные работы: 0', exact: true }).first(),
      ).toBeVisible();
      await expect(jobs.locator('.completed-job')).toContainText(
        result === 'CANCELLED' ? 'Отменено' : 'Проверьте результат',
      );
      await expect(jobs.locator('.jobs-grid .job-card')).toHaveCount(0);
      expect(state.writes).toEqual([]);
    });
  }
}

test('a missed socket completion is reconciled by refreshing the active list', async ({ page }) => {
  const { state } = await setup(page);
  state.active = [task('task', 'OPEN_ROUTER_VIDEO')];
  await page.goto('/image');
  const jobs = await openJobs(page, 1);
  state.active = [];
  await jobs.getByRole('button', { name: 'Обновить статусы', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Активные работы: 0', exact: true }).first()).toBeVisible();
  await expect(jobs.getByText('Нет выполняющихся работ.', { exact: true })).toBeVisible();
  await expect(jobs.locator('.completed-job')).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

for (const confirmed of [false, true]) {
  test(`balance details ${confirmed ? 'show a confirmed breakdown' : 'omit the exact-total block when no breakdown exists'}`, async ({
    page,
  }) => {
    await setup(page);
    await page.route('**/api/paymentTransaction?*', (route) =>
      route.fulfill({
        json: pageOf([
          {
            id: 242,
            type: 'TASK_PURCHASE',
            userId: 7,
            coinId: 'RUB',
            amount: '480',
            debet: 'CO-00',
            credit: 'PR-00',
            createdDate: '2026-11-10T12:00:00Z',
            activatedDate: '2026-11-10T12:00:00Z',
            details: {
              model: 'OPEN_AI_CONVERSATION',
              options: { model: 'test-model' },
              ...(confirmed
                ? {
                    amounts: [{ amount: '0.048', coinId: 'USD' }],
                    rates: [{ from: 'USD', to: 'RUB', value: '100' }],
                    consumption: {
                      tools: [
                        { type: 'IMAGE', status: 'FINAL', amounts: [{ amount: '0.02', coinId: 'USD' }] },
                      ],
                    },
                  }
                : {}),
            },
          },
        ]),
      }),
    );
    await page.goto('/account');
    await page.getByRole('button', { name: 'Детали операции' }).click();
    const details = page.locator('.transaction-details');
    if (confirmed) {
      await expect(details.getByText('Точная сумма операции', { exact: true })).toBeVisible();
      await expect(details.locator('.cost-breakdown .cost-line')).toHaveCount(2);
    } else {
      await expect(details.getByText(/Точная сумма/)).toHaveCount(0);
      await expect(
        details.getByText('Разбивка для этой операции не сохранена или не подтверждена.'),
      ).toHaveCount(0);
    }
  });
}

test('task cards keep their typed placeholders and fit desktop and mobile', async ({ page }) => {
  const { state } = await setup(page);
  state.active = [
    task('image', 'OPEN_ROUTER_IMAGE', { sourceFileIds: [12] }),
    task('video', 'OPEN_ROUTER_VIDEO'),
    task('text', 'OPEN_AI_TEXT'),
    task('audio', 'OPEN_AI_TTS'),
  ];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/image');
    const jobs = await openJobs(page, 4);
    await expect(jobs.locator('.job-card')).toHaveCount(4);
    await expect(jobs.locator('.job-card-preview .file-placeholder')).toHaveCount(4);
    await expect(jobs.locator('.job-card-preview img, .job-card-preview video')).toHaveCount(0);
    const rect = await jobs.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await jobs.screenshot({ path: test.info().outputPath(`task-cards-${width}.png`) });
  }
});

for (const brokenPoster of [false, true]) {
  test(`a finished video with ${brokenPoster ? 'a broken' : 'no'} poster shows its own first frame as preview`, async ({
    page,
  }) => {
    const { state, emit } = await setup(page);
    await page.route('**/test-video.mp4', (route) =>
      route.fulfill({
        contentType: 'video/mp4',
        body: readFileSync(new URL('../fixtures/preview.mp4', import.meta.url)),
      }),
    );
    await page.route('**/broken-poster.jpg', (route) => route.fulfill({ status: 404 }));
    const item = task('video', 'OPEN_ROUTER_VIDEO');
    state.active = [item];
    state.files.push({
      ...state.files[0],
      id: 14,
      name: 'Видео.mp4',
      type: 'VIDEO',
      mime: 'video/mp4',
      path: '/test-video.mp4',
      ...(brokenPoster ? { preview: { image: { status: 'READY', url: '/broken-poster.jpg' } } } : {}),
    });
    await page.goto('/video');
    const jobs = await openJobs(page, 1);
    state.active = [];
    await expect.poll(() => !!state.socket).toBe(true);
    emit('TaskFinishedEvent', { id: item.id, item, result: 'COMPLETED', fileIds: [14] });
    const preview = jobs.locator('.completed-job video');
    await expect(preview).toHaveCount(1);
    await expect
      .poll(() =>
        preview.evaluate((video: HTMLVideoElement) => video.readyState >= 2 && video.videoWidth > 0),
      )
      .toBe(true);
    expect(await preview.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  });
}

test('every file type uses the library placeholder when real previews are missing or fail', async ({
  page,
}) => {
  const { state } = await setup(page);
  const cases = [
    ['Сломанное.png', 'IMAGE', 'image/png', 'Изображение'],
    ['Сломанное.mp4', 'VIDEO', 'video/mp4', 'Видео'],
    ['Запись.wav', 'AUDIO', 'audio/wav', 'Аудиозапись'],
    ['Документ.pdf', 'DOCUMENT', 'application/pdf', 'PDF-документ'],
    [
      'Таблица.xlsx',
      'DOCUMENT',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Таблица',
    ],
    ['Архив.zip', 'BINARY', 'application/zip', 'Архив'],
    ['Данные.bin', 'BINARY', 'application/octet-stream', 'Файл'],
  ];
  state.files = cases.map(([name, type, mime], index) => ({
    ...state.files[0],
    id: 20 + index,
    name,
    type,
    mime,
    path: `/missing-preview/${index}`,
    ...(index === 0 ? { preview: { image: { status: 'READY', url: '/missing-preview/thumbnail' } } } : {}),
  }));
  const requests: Record<string, number> = {};
  await page.route('**/missing-preview/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    requests[path] = (requests[path] || 0) + 1;
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('/library');
  for (const [name, , , label] of cases)
    await expect(page.getByRole('img', { name: `${label}: ${name}`, exact: true })).toBeVisible();
  await expect(page.locator('.library-grid .file-placeholder')).toHaveCount(cases.length);
  expect(requests['/missing-preview/thumbnail']).toBe(1);
  expect(requests['/missing-preview/0']).toBe(1);
  await page
    .getByRole('button', { name: /Запись.wav/ })
    .first()
    .click();
  await expect(
    page.getByRole('dialog').getByRole('img', { name: 'Аудиозапись: Запись.wav', exact: true }),
  ).toBeVisible();
});

for (const status of ['LOADED', 'ERROR'] as const) {
  test(`conversation work uses a placeholder until completion and ${status === 'LOADED' ? 'shows its result' : 'does not show an old result after failure'}`, async ({
    page,
  }) => {
    const { state, emit } = await setup(page);
    const conversation = {
      id: 101,
      userId: 7,
      name: 'Генерация в беседе',
      model: 'OPEN_ROUTER_CONVERSATION',
      status: 'LOADING',
      options: {},
      tags: ['image'],
      createdDate: state.files[0].createdDate,
    };
    state.conversations.push(conversation);
    state.messages = [
      {
        id: 2,
        role: 'USER',
        text: 'Новый запрос',
        files: [state.files[0]],
        createdDate: conversation.createdDate,
      },
      {
        id: 1,
        role: 'ASSISTANT',
        text: 'Старый результат',
        files: [state.files[0]],
        createdDate: conversation.createdDate,
      },
    ];
    await page.goto('/image');
    const jobs = await openJobs(page, 1);
    await expect(jobs.locator('.job-card-preview .file-placeholder')).toHaveCount(1);
    await expect(jobs.locator('.job-card-preview img, .job-card-preview video')).toHaveCount(0);
    if (status === 'LOADED') {
      const result = { ...state.files[0], id: 13, name: 'Новый результат.png', path: '/media/gallery-2.jpg' };
      state.messages.unshift({
        id: 3,
        role: 'ASSISTANT',
        text: 'Готово',
        files: [result],
        createdDate: conversation.createdDate,
      });
    }
    conversation.status = status;
    await expect.poll(() => !!state.socket).toBe(true);
    emit('ConversationChangedEvent', { id: 101, item: { status } });
    await expect(jobs.locator('.completed-job')).toHaveCount(1);
    if (status === 'LOADED')
      await expect(jobs.locator('.completed-job img')).toHaveAttribute('alt', 'Новый результат.png');
    else {
      await expect(jobs.locator('.completed-job .file-placeholder')).toHaveCount(1);
      await expect(jobs.locator('.completed-job img, .completed-job video')).toHaveCount(0);
    }
    expect(state.writes).toEqual([]);
  });
}

test('saved non-router tool settings are checked before sending', async ({ page }) => {
  const { state } = await setup(page);
  state.conversations = [
    {
      id: 134,
      userId: 7,
      name: 'Existing',
      status: 'LOADED',
      model: 'OPEN_ROUTER_CONVERSATION',
      options: {
        model: 'anthropic/claude-opus-5.5',
        tools: [
          {
            uid: 'IMAGE',
            settings: {
              model: { provider: 'OPEN_AI_IMAGE_GPT', model: 'gpt-image-1' },
              isLockSelection: true,
            },
          },
        ],
      },
    },
  ];
  await page.goto('/image');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/lib/api.ts';
    const { api } = await import(modulePath);
    try {
      await api.sendMessage(
        134,
        { role: 'USER', text: 'Сделай картинку', settings: { tools: [] } },
        'active-tasks-test',
      );
      return 'sent';
    } catch (error) {
      return String(error);
    }
  });
  expect(result).toContain('OpenRouter');
  expect(state.writes).not.toContain('/api/conversation/134/message');
});

test('completed video appears once through its conversation after the parent finishes', async ({ page }) => {
  const { state, emit } = await setup(page);
  const parent = task('parent', 'OPEN_ROUTER_CONVERSATION', { session: 'conversation134' });
  const child = task('child', 'OPEN_ROUTER_VIDEO', { parentTaskId: 'parent' });
  state.active = [parent, child];
  state.conversations = [
    {
      id: 134,
      userId: 7,
      name: 'Сохранение картинки',
      model: 'OPEN_ROUTER_CONVERSATION',
      status: 'LOADING',
      options: {},
      tags: ['genfactory', 'image'],
      createdDate: parent.createdDate,
    },
  ];
  await page.goto('/image');
  const jobs = await openJobs(page, 1);
  await expect.poll(() => !!state.socket).toBe(true);
  state.active = [parent];
  const reads = state.taskReads;
  emit('TaskFinishedEvent', { id: child.id, item: child, result: 'COMPLETED', fileIds: [12] });
  await expect.poll(() => state.taskReads).toBeGreaterThan(reads);
  await expect(jobs.locator('.jobs-grid .job-card')).toHaveCount(1);
  await expect(jobs.locator('.completed-job')).toHaveCount(0);
  state.active = [];
  state.conversations[0].status = 'LOADED';
  emit('TaskFinishedEvent', { id: parent.id, item: parent, result: 'COMPLETED' });
  emit('ConversationChangedEvent', { id: 134, item: state.conversations[0] });
  await expect(jobs.locator('.jobs-grid .job-card')).toHaveCount(0);
  await expect(jobs.locator('.completed-job')).toHaveCount(1);
  await expect(jobs.locator('.completed-job')).toHaveAttribute('href', /conversation=134/);
  await jobs.getByRole('button', { name: 'Обновить статусы' }).click();
  await expect(jobs.locator('.completed-job')).toHaveCount(1);
});

test('new generic image tools are pinned to OpenRouter and preserve required-call overrides', async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.goto('/image');
  const created = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/api/conversation' && request.method() === 'POST',
  );
  await page.evaluate(async () => {
    const modulePath = '/src/lib/api.ts';
    const { api } = await import(modulePath);
    await api.createConversation(
      {
        name: 'Test',
        model: 'OPEN_ROUTER_CONVERSATION',
        options: { model: 'anthropic/claude-opus-5.5', tools: ['IMAGE'] },
      },
      'active-tasks-test',
    );
  });
  const body = (await created).postDataJSON();
  expect(body.options.tools[0]).toMatchObject({
    uid: 'IMAGE',
    settings: { model: { provider: 'OPEN_ROUTER_IMAGE' }, isLockSelection: true },
  });
  state.conversations.push({ ...body, id: 134, userId: 7, status: 'LOADED' });
  const sent = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/api/conversation/134/message' && request.method() === 'POST',
  );
  await page.evaluate(async () => {
    const modulePath = '/src/lib/api.ts';
    const { api } = await import(modulePath);
    await api.sendMessage(
      134,
      { role: 'USER', text: 'Create', settings: { tools: [{ uid: 'IMAGE', isRequired: true }] } },
      'active-tasks-test',
    );
  });
  expect((await sent).postDataJSON().settings.tools[0]).toMatchObject({
    ...body.options.tools[0],
    isRequired: true,
  });
});

test('a restored generation keeps its elapsed time after reload and shows it in Works', async ({ page }) => {
  const { state } = await setup(page);
  const started = new Date(Date.now() - 65000).toISOString();
  state.active = [task('restore-timer', 'OPEN_ROUTER_IMAGE', { createdDate: started })];
  await page.goto('/image');
  const timer = page.locator('.image-result-pending').getByLabel('Время генерации');
  await expect(timer).toBeVisible();
  const seconds = () => timer.innerText().then((value) => Number(value.split(' ')[0]));
  await expect.poll(seconds).toBeGreaterThanOrEqual(65);
  await page.reload();
  await expect.poll(seconds).toBeGreaterThanOrEqual(65);
  await page.getByRole('button', { name: 'Активные работы: 1', exact: true }).first().click();
  await expect(page.getByRole('dialog').getByLabel('Время генерации')).toBeVisible();
});
