import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { catalogProvider, catalogResponse } from './modelCatalog';
const catalog = JSON.parse(readFileSync(new URL('../fixtures/catalog.json', import.meta.url), 'utf8'));
const agent = JSON.parse(readFileSync(new URL('../fixtures/agent.json', import.meta.url), 'utf8'));
const file = {
  id: 12,
  uid: 'photo',
  userId: 7,
  name: 'Фото.jpg',
  path: '/media/gallery-1.jpg',
  type: 'IMAGE',
  mime: 'image/jpeg',
  createdDate: '2026-11-10T10:00:00Z',
  tags: [],
};
const work = {
  id: 101,
  userId: 7,
  name: 'Красная чашка',
  model: 'OPEN_AI_CONVERSATION',
  options: { model: 'gpt-4o-mini', tools: [{ uid: 'IMAGE' }] },
  status: 'LOADED',
  tags: ['genfactory', 'image'],
  createdDate: file.createdDate,
  previewMode: 'MANUAL',
  previewFileId: 12,
};
const pageOf = (items: unknown[]) => ({ items, total: items.length, pages: 1, pageSize: 20, pageIndex: 0 });
async function setup(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('genfactory.session', 'visual-test'));
  await page.routeWebSocket('**/socket.io/**', () => {});
  const writes: string[] = [];
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/api/task' && route.request().method() === 'GET')
      return route.fulfill({ json: [] });
    const r = route.request(),
      url = new URL(r.url()),
      p = url.pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes.push(r.method() + ' ' + p);
    let body: any = {};
    if (p === '/api/init') {
      await new Promise((resolve) => setTimeout(resolve, 100));
      body = {
        user: { id: 7, preferences: { name: 'Demo', email: 'demo@example.test' } },
        balances: { RUB: '100000' },
      };
    } else if (p === '/api/aimodels')
      body =
        catalogProvider(url) === 'OPEN_AI_CONVERSATION'
          ? [agent]
          : catalog.filter((m: any) => m.reference.provider === catalogProvider(url));
    else if (p === '/api/conversation') {
      const c = JSON.parse(url.searchParams.get('conditions') || '{}');
      body = pageOf(c.status === 'LOADING' ? [] : [work]);
    } else if (p === '/api/conversation/101') body = work;
    else if (p === '/api/conversation/101/message')
      body = pageOf([{ id: 1, role: 'ASSISTANT', text: 'Готово', files: [file] }]);
    else if (p === '/api/file/12') body = file;
    else if (p === '/api/file')
      body = pageOf(JSON.parse(url.searchParams.get('conditions') || '{}').type === 'DOCUMENT' ? [] : [file]);
    else if (p === '/api/fileTag' || p === '/api/paymentTransaction') body = pageOf([]);
    await route.fulfill({ json: catalogResponse(r.url(), body) });
  });
  return writes;
}
test('home removes search/history and folded navigation keeps centered icons', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.locator('.home-task,.home-stories')).toHaveCount(0);
  await expect(page.locator('.home-signs')).toHaveCSS('border-top-width', '0px');
  await expect(page.getByRole('link', { name: 'Generate Prompt', exact: true }).first()).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Дополнительные инструменты', exact: true })).toHaveCount(0);
  await expect(
    page
      .getByRole('navigation', { name: 'Основное меню' })
      .getByRole('link', { name: 'Generate Prompt', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Свернуть меню', exact: true }).click();
  await page.waitForTimeout(650);
  const geometry = await page.locator('.shell-nav-item.active').evaluate((el) => {
    const icon = el.querySelector('img')!.getBoundingClientRect(),
      row = el.getBoundingClientRect();
    return { dx: Math.abs(icon.x + icon.width / 2 - (row.x + row.width / 2)), width: icon.width };
  });
  expect(geometry.width).toBe(18);
  expect(geometry.dx).toBeLessThan(2);
});
test('image/video template editors have an explicit finish action and overlays stay on the thumbnail', async ({
  page,
}) => {
  test.setTimeout(90000);
  const writes = await setup(page);
  for (const route of ['/image', '/video']) {
    await page.goto(route);
    await page.locator('.ds-template-card').first().click();
    await page.getByRole('button', { name: 'Редактировать шаблон', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Текст шаблона', exact: true })).toBeVisible();
    const editor = page.getByRole('dialog', { name: 'Редактировать текст шаблона', exact: true });
    await expect(editor).toBeVisible();
    const field = editor.getByRole('textbox', { name: 'Текст шаблона', exact: true });
    const original = await field.inputValue();
    await field.fill('Черновик для отмены');
    const centered = await editor.getByRole('button', { name: 'Закрыть', exact: true }).evaluate((el) => {
      const button = el.getBoundingClientRect(),
        icon = el.querySelector('svg')!.getBoundingClientRect();
      return Math.max(
        Math.abs(button.x + button.width / 2 - icon.x - icon.width / 2),
        Math.abs(button.y + button.height / 2 - icon.y - icon.height / 2),
      );
    });
    expect(centered).toBeLessThan(1);
    await editor.getByRole('button', { name: 'Отмена', exact: true }).click();
    await page.getByRole('button', { name: 'Редактировать шаблон', exact: true }).click();
    await expect(field).toHaveValue(original);
    await field.fill('Обновлённый текст шаблона');

    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Текст шаблона', exact: true })).toHaveCount(0);
    const overlay = page.getByRole('button', { name: 'Редактировать шаблон', exact: true });
    const box = await overlay.boundingBox(),
      thumb = await page.locator('.img-file.is-template .img-thumb').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(thumb!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(thumb!.x + thumb!.width);
    expect(box!.width).toBeLessThanOrEqual(28);
  }
  expect(writes).toEqual([]);
});
test('library icon filters have accessible names, no audio/link creation, and rename survives refresh', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/library');
  await expect(page.locator('[aria-label="Тип файлов"] button')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Аудио', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Документы', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Создать изображение', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Все', exact: true }).click();
  await page.getByLabel('Действия с «Фото.jpg»', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Создать ссылку', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Название и теги', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Название', exact: true });
  await input.fill('Новое название.jpg');
  await page.evaluate(() => window.dispatchEvent(new Event('genfactory:generation-finished')));
  await expect(input).toHaveValue('Новое название.jpg');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('history opens the file without navigation and only shows relevant actions', async ({ page }) => {
  await setup(page);
  await page.goto('/history');
  await page.getByRole('button', { name: 'Открыть результат Красная чашка', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Фото.jpg', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/history$/);
  await page.keyboard.press('Escape');
  await page.getByLabel('Действия работы Красная чашка', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Скачать', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Студия изображений', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'В избранное', exact: true })).toHaveCount(0);
});
test('balance refresh reports completion, company is populated, and no generation is sent', async ({
  page,
}) => {
  const writes = await setup(page);
  await page.goto('/account');
  await page.getByRole('button', { name: 'Обновить баланс', exact: true }).click();
  await expect(page.getByText('Баланс обновлён', { exact: true })).toBeVisible();
  await expect(page.locator('.account-refresh-notice')).toHaveCSS('position', 'fixed');
  await page.getByRole('button', { name: 'Закрыть уведомление', exact: true }).click();
  await expect(page.getByText('Баланс обновлён', { exact: true })).toHaveCount(0);
  await page.goto('/company');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('AI-КОНТЕНТ');
  await expect
    .poll(() => page.locator('.company-hero > img').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath('company-desktop.png'), fullPage: true });
  expect(writes).toEqual([]);
});
test('mobile screens fit, template/model panels open above the composer, and galleries use two columns', async ({
  page,
}) => {
  test.setTimeout(90000);
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/image', '/video', '/history', '/library', '/company', '/chat']) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route).toBe(
      true,
    );
    if (route === '/image' || route === '/video')
      await expect(page.locator('.masonry-cards')).toHaveAttribute('data-columns', '2');
  }
  await page.screenshot({
    path: test.info().outputPath('mobile-before.png'),
  });
  await page.getByRole('button', { name: 'Шаблоны и настройки', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Галерея шаблонов' })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('mobile-templates.png'),
  });
  await page.getByRole('button', { name: 'Закрыть шаблоны и настройки', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Галерея шаблонов' })).not.toBeVisible();
  await page.getByRole('button', { name: /^Модель:/ }).click();
  const choices = page.locator('[data-menu-above="true"]');
  await expect(choices).toBeVisible();
  const menuBox = await choices.boundingBox(),
    formBox = await page.locator('#cw-compose').boundingBox();
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(formBox!.y - 5);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Меню', exact: true })).toBeVisible();
  expect(
    await page.getByRole('dialog', { name: 'Меню' }).evaluate((el) => el.getBoundingClientRect().left),
  ).toBeGreaterThanOrEqual(0);
});

test('model names are unbranded and alphabetical, favorites keep their priority', async ({ page }) => {
  await setup(page);
  await page.goto('/image');
  await page.getByRole('button', { name: 'Модель', exact: true }).click();
  const menu = page.getByRole('listbox', { name: 'Модель', exact: true });
  await expect(menu.getByRole('option').first()).toBeVisible();
  const names = await menu
    .getByRole('option')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label')!));
  const centering = await menu
    .locator('.image-model-row')
    .first()
    .evaluate((el) => {
      const row = el.getBoundingClientRect(),
        mark = el.querySelector('.image-choice-mark')!.getBoundingClientRect();
      return Math.abs(row.y + row.height / 2 - mark.y - mark.height / 2);
    });
  expect(centering).toBeLessThan(1);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true })));
  expect(names.every((n) => !n.includes(':') && !n.startsWith('OpenAI '))).toBe(true);
  await expect(menu.getByRole('button', { name: 'Избранные', exact: true })).toHaveCount(0);
  const picked = names.at(-1)!;
  await menu.getByRole('button', { name: 'В избранные: ' + picked, exact: true }).click();
  await expect(menu.getByRole('option').first()).toHaveAttribute('aria-label', picked);
});
test('content templates promote favorites and hide empty decorative controls', async ({ page }) => {
  await setup(page);
  await page.goto('/chat');
  const cards = page.locator('#cw-gallery > article');
  await expect(cards.nth(2)).toBeVisible();
  const title = await cards.nth(2).locator('.cw-card-label strong').innerText();
  await cards
    .nth(2)
    .getByRole('button', { name: /В избранное:/ })
    .click();
  await expect(cards.first().locator('.cw-card-label strong')).toHaveText(title);
  await expect(page.getByText('Поле внизу.', { exact: false })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await expect(page.getByText('Дизайн-система', { exact: true })).toHaveCount(0);
});

test('visible video previews loop with motion allowed', async ({ page }) => {
  await setup(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/video');
  const clip = page.locator('.video-template-media video').first();
  await expect(clip).toBeAttached();
  await expect
    .poll(
      () =>
        clip.evaluate(
          (v: HTMLVideoElement) => v.readyState >= 2 && Number.isFinite(v.duration) && v.duration > 0,
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  const looped = await clip.evaluate(async (v: HTMLVideoElement) => {
    v.playbackRate = 4;
    v.currentTime = Math.max(0, v.duration - 0.2);
    await v.play();
    await new Promise((resolve) => setTimeout(resolve, 600));
    return v.loop && v.currentTime < v.duration - 0.2 && !v.paused;
  });
  expect(looped).toBe(true);
});
