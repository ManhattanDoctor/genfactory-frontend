import { catalogResponse } from './modelCatalog';
import { test, expect } from '@playwright/test';
const pagination = { items: [], total: 0, pages: 0, pageSize: 24, pageIndex: 0 };
for (const [tag, target] of [
  ['image', 'image'],
  ['video', 'video'],
  ['chat', 'agent'],
  ['prompt', 'prompt'],
  ['script', 'script'],
])
  test(`billing opens saved ${tag} workspace without sending`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('genfactory.session', 'test'));
    await page.routeWebSocket('**/socket.io/**', () => {});
    let sends = 0;
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'POST') sends++;
      const body =
        path === '/api/init'
          ? { user: { id: 7 }, balances: { RUB: '1000' } }
          : path === '/api/conversation/50'
            ? {
                id: 50,
                userId: 7,
                name: 'Работа',
                status: 'LOADED',
                model: 'OPEN_AI_CONVERSATION',
                options: { model: 'gpt-4o-mini', tools: [] },
                tags: [tag],
              }
            : path === '/api/aimodels'
              ? []
              : pagination;
      return route.fulfill({ json: catalogResponse(route.request().url(), body) });
    });
    await page.goto('/open?conversation=50');
    await expect(page).toHaveURL(new RegExp(`/${target}\\?conversation=50$`));
    expect(sends).toBe(0);
  });
test('resolver does not open a foreign conversation', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('genfactory.session', 'test'));
  await page.routeWebSocket('**/socket.io/**', () => {});
  await page.route('**/api/**', (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).pathname === '/api/init'
          ? { user: { id: 7 }, balances: {} }
          : new URL(route.request().url()).pathname === '/api/conversation/50'
            ? { id: 50, userId: 8, tags: ['image'], options: {} }
            : pagination,
    }),
  );
  await page.goto('/open?conversation=50');
  await expect(page.getByRole('alert')).toContainText('Беседа недоступна');
  await expect(page).toHaveURL(/\/open\?conversation=50$/);
});
