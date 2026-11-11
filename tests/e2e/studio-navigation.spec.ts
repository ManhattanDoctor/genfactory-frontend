import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const catalog = JSON.parse(readFileSync(new URL('../fixtures/catalog.json', import.meta.url), 'utf8'));
const agent = JSON.parse(readFileSync(new URL('../fixtures/agent.json', import.meta.url), 'utf8'));
import { catalogProvider, catalogResponse } from './modelCatalog';
const names = [
  'Рекламная серия для новой коллекции керамических чашек и сервировки',
  'Видео для запуска коллекции',
  'Предметная съёмка украшений',
  'Карточки товаров для каталога',
  'Сценарий ролика для кофейни',
  'Летняя кампания',
  'Обложки для соцсетей',
  'Идеи для новой съёмки',
];
const conversation = (i: number) => ({
  id: 101 + i,
  userId: 7,
  name: names[i],
  status: 'LOADED',
  model: agent.reference.provider,
  options: { model: agent.reference.model, tools: [] },
  tags: ['genfactory', 'content-studio'],
  createdDate: `2026-11-${String(11 - i).padStart(2, '0')}T10:00:00Z`,
});
async function setup(page: Page, signedIn = true) {
  if (signedIn) await page.addInitScript(() => localStorage.setItem('genfactory.session', 'navigation-test'));
  await page.routeWebSocket('**/socket.io/**', () => {});
  const requests: any[] = [];
  const writes: string[] = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (req.method() !== 'GET') writes.push(path);
    let body: any = {};
    if (path === '/api/init') body = { user: signedIn ? { id: 7 } : undefined, balances: { RUB: '1250' } };
    else if (path === '/api/aimodels')
      body =
        catalogProvider(url) === 'OPEN_ROUTER_CONVERSATION'
          ? [agent]
          : catalog.filter((m: any) => m.reference.provider === catalogProvider(url));
    else if (path === '/api/conversation') {
      const conditions = JSON.parse(url.searchParams.get('conditions') || '{}');
      requests.push({
        conditions,
        sort: JSON.parse(url.searchParams.get('sort') || '{}'),
        page: Number(url.searchParams.get('pageIndex')),
      });
      const tag = conditions.tags?.value?.[0];
      const index = Number(url.searchParams.get('pageIndex'));
      const items =
        tag === 'content-studio'
          ? index
            ? [conversation(5), conversation(6), conversation(7)]
            : [
                ...Array.from({ length: 6 }, (_, i) => conversation(i)),
                { ...conversation(0), id: 990, userId: 8, name: 'Чужой диалог' },
                { ...conversation(0), id: 991, isArchived: true, name: 'Архив' },
                { ...conversation(0), id: 992, tags: ['chat'], name: 'Другой раздел' },
              ]
          : tag === 'chat'
            ? [{ ...conversation(0), id: 201, name: 'Обсуждение стратегии', tags: ['chat'] }]
            : [];
      body = {
        items,
        total: tag === 'content-studio' ? 8 : items.length,
        pages: tag === 'content-studio' ? 2 : 1,
        pageIndex: index,
        pageSize: 24,
      };
    } else if (/^\/api\/conversation\/\d+$/.test(path))
      body = conversation(Number(path.split('/').pop()) - 101);
    else if (/\/message$/.test(path) || path === '/api/file' || path === '/api/fileTag')
      body = { items: [], total: 0, pages: 1, pageIndex: 0, pageSize: 24 };
    else if (path === '/api/task') body = [];
    await route.fulfill({ json: catalogResponse(req.url(), body) });
  });
  return { requests, writes };
}

test('studio navigation shows five recent dialogs, paginates, folds and opens the selected conversation', async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  await page.goto('/chat');
  const nav = page.getByRole('navigation', { name: 'Основное меню' });
  const list = nav.getByRole('group', { name: 'Диалоги Студии контента' });
  await expect(list.getByRole('link')).toHaveCount(5);
  await expect(nav.getByText('Чужой диалог')).toHaveCount(0);
  await expect(nav.getByText('Архив', { exact: true })).toHaveCount(0);
  await expect(nav.getByText('Другой раздел')).toHaveCount(0);
  expect(state.requests[0].conditions).toMatchObject({
    userId: 7,
    isArchived: false,
    tags: { condition: 'INCLUDES_ALL', value: ['content-studio'] },
  });
  expect(state.requests[0].sort).toEqual({ createdDate: false, id: false });
  const first = list.getByRole('link').first();
  await expect(first).toHaveCSS('font-size', '12px');
  await expect(first).toHaveCSS('min-height', '32px');
  expect(await first.locator('span').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await expect(page.locator('#cw-draft')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('studio-navigation-desktop.png') });
  await nav.getByRole('button', { name: 'Свернуть диалоги Студии контента' }).click();
  await expect(list).toHaveCount(0);
  await nav.getByRole('button', { name: 'Развернуть диалоги Студии контента' }).click();
  await expect(list.getByRole('link')).toHaveCount(5);
  await list.getByRole('button', { name: 'Ещё диалоги' }).click();
  await expect(list.getByRole('link')).toHaveCount(6);
  await list.getByRole('button', { name: 'Ещё диалоги' }).click();
  await expect(list.getByRole('link')).toHaveCount(8);
  await expect(list.getByRole('button')).toHaveCount(0);
  await list.getByRole('link', { name: names[1], exact: true }).click();
  await expect(page).toHaveURL(/\/chat\?conversation=102$/);
  await expect(list.getByRole('link', { name: names[1], exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await nav.getByRole('button', { name: 'Дополнительные инструменты' }).click();
  const agents = nav.getByRole('group', { name: 'Диалоги AI agent' });
  await expect(agents.getByRole('link', { name: 'Обсуждение стратегии' })).toBeVisible();
  await expect(agents.getByRole('link')).toHaveCSS('font-size', '12px');
  await page.screenshot({ path: testInfo.outputPath('studio-and-agent-navigation.png') });
  expect(state.writes).toEqual([]);
});

test('mobile studio navigation opens a conversation and closes the menu', async ({ page }, testInfo) => {
  const state = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Основное меню' });
  const list = nav.getByRole('group', { name: 'Диалоги Студии контента' });
  await expect(list.getByRole('link')).toHaveCount(5);
  await page.screenshot({ path: testInfo.outputPath('studio-navigation-mobile.png') });
  await list.getByRole('link', { name: names[2], exact: true }).click();
  await expect(page).toHaveURL(/conversation=103$/);
  await expect(page.getByRole('button', { name: 'Открыть меню', exact: true })).toBeVisible();
  await expect(list).not.toBeVisible();
  expect(state.writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('anonymous navigation does not request personal conversations', async ({ page }) => {
  const state = await setup(page, false);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Студия контента', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Диалоги Студии контента' })).toHaveCount(0);
  expect(state.requests).toEqual([]);
});
