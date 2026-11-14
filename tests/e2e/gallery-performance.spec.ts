import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`long masonry keeps geometry focus and bounded mounted cards at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/fixture-image.svg', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"/>',
      }),
    );
    await page.goto('/tests/fixtures/gallery-performance.html');
    await page.waitForFunction(() => (window as any).setGalleryCount);
    await page.evaluate(() => (window as any).setGalleryCount(1000));
    const first = page.getByRole('button', { name: 'File 0', exact: true });
    await expect(first).toBeVisible();
    await first.focus();
    await expect.poll(() => page.locator('[data-masonry-mounted=true]').count()).toBeLessThan(80);
    const height = await page.locator('#gallery-scroll').evaluate((el) => el.scrollHeight);
    await page.evaluate(() => {
      (window as any).firstCard = document.querySelector('[data-masonry-key="file:0"] button');
    });
    await page.locator('#gallery-scroll').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.getByRole('button', { name: 'File 999', exact: true })).toBeVisible();
    await expect.poll(() => page.locator('[data-masonry-mounted=true]').count()).toBeLessThan(80);
    await expect(first).toBeFocused();
    expect(await page.locator('#gallery-scroll').evaluate((el) => el.scrollHeight)).toBe(height);
    await page.locator('#gallery-scroll').evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(first).toBeVisible();
    await page.evaluate(() => (window as any).setGalleryCount(1001));
    await expect(page.locator('[data-masonry-key]')).toHaveCount(1001);
    expect(
      await page.evaluate(
        () => (window as any).firstCard === document.querySelector('[data-masonry-key="file:0"] button'),
      ),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`gallery-${width}.png`) });
  });
}

test('keyboard navigation can advance beyond the first virtual window', async ({ page }) => {
  await page.route('**/fixture-image.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"/>',
    }),
  );
  await page.goto('/tests/fixtures/gallery-performance.html');
  await page.waitForFunction(() => (window as any).setGalleryCount);
  await page.evaluate(() => (window as any).setGalleryCount(1000));
  await page.getByRole('button', { name: 'File 0', exact: true }).focus();
  for (let index = 1; index <= 40; index++) {
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: `File ${index}`, exact: true })).toBeFocused();
  }
});
