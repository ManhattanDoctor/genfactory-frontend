import { expect, test } from '@playwright/test';

test('startup timeout offers support and reload recovers', async ({ page }) => {
  const entry = /\/(?:src\/main\.tsx|assets\/index-[^/]+\.js)(?:\?.*)?$/;
  await page.route(entry, (route) => route.abort());
  await page.clock.install();
  await page.goto('/');
  const error = page.getByRole('main', { name: 'С этой сети GenFactory сейчас недоступен' });
  await expect(error).toBeHidden();
  await page.clock.fastForward(8000);
  await expect(error).toBeVisible();
  await expect(error.getByRole('link', { name: 'Написать в поддержку' })).toHaveAttribute(
    'href',
    'mailto:support@genfactory.ru?subject=GenFactory%20NET-TIMEOUT',
  );
  await page.unroute(entry);
  await error.getByRole('button', { name: 'Обновить страницу' }).click();
  await expect(page.locator('#home-title')).toBeVisible();
  await expect(error).toHaveCount(0);
});

test('a pending navigation icon cannot replace an interactive home page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let started!: () => void;
  const pending = new Promise<void>((resolve) => (started = resolve));
  await page.route('**/media/prototype/nav/home.webp', () => started());
  await page.clock.install();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await pending;
  await expect(page.locator('#home-title')).toBeVisible();
  await page.clock.fastForward(9000);
  await expect(page.locator('#startup-error')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Открыть студию', exact: true })).toBeVisible();
});
