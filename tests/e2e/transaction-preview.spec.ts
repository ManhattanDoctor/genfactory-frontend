import { test, expect } from '@playwright/test';
const date = '2026-11-05T12:00:00Z';
const file = {
  id: 12,
  userId: 7,
  uid: 'result',
  name: 'Результат.mp4',
  type: 'VIDEO',
  mime: 'video/mp4',
  path: '/original-result.mp4',
  createdDate: date,
  origin: { kind: 'GENERATION', operationId: 'task:exact' },
  preview: { image: { status: 'READY', url: '/media/gallery-1.jpg' } },
};
const pagination = (items: unknown[], pageIndex = 0, pages = 1) => ({
  items,
  pageIndex,
  pages,
  total: items.length,
  pageSize: 24,
});
for (const width of [390, 1440])
  test(`transaction preview uses server results without loading messages and opens only on click ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem('genfactory.session', 'test'));
    await page.routeWebSocket('**/socket.io/**', () => {});
    let originals = 0,
      sends = 0,
      messageReads = 0;
    await page.route('**/original-result.mp4', (route) => {
      originals++;
      return route.fulfill({ status: 404, body: '' });
    });
    await page.route('**/api/**', (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      if (req.method() === 'POST') sends++;
      let body: any = pagination([]);
      if (path === '/api/init') body = { user: { id: 7 }, balances: { RUB: '10000' } };
      if (path === '/api/paymentTransaction')
        body = pagination(
          ['task:exact', 'task:absent', null].map((operationId, i) => ({
            id: 100 + i,
            userId: 7,
            type: 'TASK_PURCHASE',
            credit: 'PR-00',
            debet: 'CO-00',
            coinId: 'RUB',
            amount: '100',
            createdDate: date,
            activatedDate: date,
            operationId,
            ...(i === 0
              ? { results: [file, { ...file, id: 13, name: 'Второй.mp4' }, { ...file, id: 14, userId: 8 }] }
              : i === 1
                ? { results: [] }
                : {}),
            details: { source: { type: 'CONVERSATION', id: 50 } },
          })),
        );
      if (path.endsWith('/message')) messageReads++;
      if (path === '/api/file/12') body = file;
      return route.fulfill({ json: body });
    });
    await page.goto('/account');
    const rows = page.locator('.transaction-row');
    await expect(rows).toHaveCount(3);
    const preview = rows
      .nth(0)
      .getByRole('button', { name: 'Открыть результат: Результат.mp4', exact: true });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('+1');
    await expect(rows.nth(1).locator('.transaction-preview')).toHaveCount(0);
    await expect(rows.nth(2).locator('.transaction-preview')).toHaveCount(0);
    expect(originals).toBe(0);
    expect(messageReads).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await preview.click();
    await expect(page.getByRole('dialog', { name: 'Результат.mp4', exact: true })).toBeVisible();
    expect(sends).toBe(0);
  });
