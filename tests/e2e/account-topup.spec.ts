import { expect, test } from '@playwright/test';
import { mockSession } from './session';

test('top-up accepts presets and custom amounts without submitting a payment', async ({ page }) => {
  await mockSession(page, 'topup-preview');
  await page.routeWebSocket('**/socket.io/**', () => {});
  const writes: string[] = [];
  await page.route('**/api/**', (route) => {
    const req = route.request();
    if (!['GET', 'OPTIONS', 'HEAD'].includes(req.method()))
      writes.push(req.method() + ' ' + new URL(req.url()).pathname);
    const path = new URL(req.url()).pathname;
    const body =
      path === '/api/init'
        ? { user: { id: 7 }, balances: { RUB: '100000' } }
        : path === '/api/task'
          ? []
          : { items: [], pages: 0, total: 0, pageSize: 20, pageIndex: 0 };
    return route.fulfill({ json: body });
  });
  await page.goto('/account');
  await page.getByRole('button', { name: 'Пополнить баланс' }).click();
  const dialog = page.getByRole('dialog', { name: 'Пополнить баланс' });
  await dialog.getByRole('button', { name: '3 000 GF' }).click();
  const amount = dialog.getByLabel('Сумма, GF');
  await expect(amount).toHaveValue('3000');
  await amount.fill('1700');
  await expect(dialog.getByRole('button', { name: '3 000 GF' })).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.getByRole('button', { name: 'Оплатить через ЮKassa' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.balance-row')).toContainText('1 000,00');
  expect(writes).toEqual([]);
});
