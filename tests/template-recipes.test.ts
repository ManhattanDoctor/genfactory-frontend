import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import cards from '../src/features/content-studio/templates.json';
import { loadTemplate } from '../src/features/content-studio/templateCatalog';
const templates = await Promise.all(cards.map(loadTemplate));
import fields from '../src/features/content-studio/templateFields.json';
import {
  templateVariables,
  templateReference,
  fillTemplate,
  templateDuration,
  adaptTemplateDuration,
} from '../src/features/content-studio/templateRecipe';

describe('Complete designer template catalog', () => {
  it.each(templates)('$id has usable media, known fields and a fillable recipe', (item) => {
    expect(item.prompt.trim()).not.toBe('');
    expect(existsSync(new URL('../public' + item.src, import.meta.url))).toBe(true);
    const keys = templateVariables(item.prompt);
    for (const key of keys) expect(fields).toHaveProperty(key);
    const ready = fillTemplate(item.prompt, Object.fromEntries(keys.map((key) => [key, 'User value'])));
    expect(templateVariables(ready)).toEqual([]);
    if (item.kind === 'video' && (!item.id.startsWith('video:2026-11-13:') || templateDuration(ready))) {
      expect(templateDuration(ready)).toBeGreaterThan(0);
      for (const seconds of [1, 4, 6, 15]) {
        const adapted = adaptTemplateDuration(ready, seconds);
        expect(templateDuration(adapted)).toBe(seconds);
        for (const range of adapted.matchAll(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s*(seconds|s)\b/g)) {
          expect(Number(range[1])).toBeLessThan(Number(range[2]));
          expect(Number(range[2])).toBeLessThanOrEqual(seconds);
        }
      }
    }
  });
  it('distinguishes optional scene references from mandatory identity references', () => {
    const get = (id: string) => templates.find((item) => item.id === id)!;
    expect(templateReference(get('image:66'))).toBe('required');
    expect(templateReference(get('image:16'))).toBe('required');
    expect(templateReference(get('image:10'))).toBe('optional');
    expect(templateReference(get('image:12'))).toBe('optional');
    expect(templateReference(get('video:media/creatives/19.mp4'))).toBe('optional');
    expect(templateReference(get('presentation:startup'))).toBe('none');
  });
});

describe('ts-core language prompt rendering', () => {
  it('keeps templates without variables usable and preserves their text', () => {
    const text = 'Создай фотографию леса. Не добавляй надписи.';
    expect(templateVariables(text)).toEqual([]);
    expect(fillTemplate(text, {})).toBe(text);
  });

  it.each([
    [1, '1 корзина'],
    [2, '2 корзины'],
    [5, '5 корзин'],
    [21, '21 корзина'],
  ])('renders Russian plurals for %s', (count, expected) => {
    const text = '{COUNT, plural, one {# корзина} few {# корзины} many {# корзин} other {# корзины}}';
    expect(templateVariables(text)).toEqual(['COUNT']);
    expect(fillTemplate(text, { COUNT: count })).toBe(expected);
  });

  it('renders select branches and repeated variables together', () => {
    const text = '{STYLE, select, light {Белый фон для {PRODUCT}} other {Тёмный фон для {PRODUCT}}}';
    expect(templateVariables(text)).toEqual(['STYLE', 'PRODUCT']);
    expect(fillTemplate(text, { STYLE: 'light', PRODUCT: 'Корзина' })).toBe('Белый фон для Корзина');
  });

  it('does not compile inserted user text as another message', () => {
    expect(
      fillTemplate('{PRODUCT} / {BACKGROUND}', {
        PRODUCT: '{COUNT, plural, other {hello}} {BRAND} $&',
        BACKGROUND: 'white',
      }),
    ).toBe('{COUNT, plural, other {hello}} {BRAND} $& / white');
  });

  it('keeps unfinished templates intact instead of inserting undefined or NaN', () => {
    const text = '{COUNT, plural, one {# файл} other {# файлов}} для {PRODUCT}';
    expect(fillTemplate(text, { PRODUCT: 'Корзина' })).toBe(text);
    expect(fillTemplate('{PRODUCT}', { PRODUCT: '   ' })).toBe('{PRODUCT}');
    expect(fillTemplate('{COUNT}', { COUNT: 0 })).toBe('0');
  });

  it('reports malformed ICU syntax for the editor to handle', () => {
    expect(() => templateVariables('{COUNT, plural, other {files}')).toThrow();
  });
});

it('rejects nonnumeric plural inputs instead of rendering NaN', () => {
  expect(() => fillTemplate('{COUNT, plural, other {# файлов}}', { COUNT: 'abc' })).toThrow();
});

it('uses Wan 3.0 for every video template without prescribing an image model', () => {
  const videos = templates.filter((item) => item.kind === 'video');
  expect(videos).toHaveLength(56);
  for (const item of videos)
    expect(item).toHaveProperty('model', { provider: 'OPEN_ROUTER_VIDEO', model: 'alibaba/wan-3.0' });
  for (const item of templates.filter((item) => item.kind !== 'video'))
    expect(item).not.toHaveProperty('model');
});

it('gives every video a recommendation consistent with its complete canonical timeline', () => {
  for (const item of templates.filter((item) => item.kind === 'video')) {
    expect(item.recommendedDuration).toBeGreaterThanOrEqual(2);
    expect(item.recommendedDuration).toBeLessThanOrEqual(30);
    expect(item).not.toHaveProperty('duration');
    expect(templateDuration(item.prompt)).toBe(item.recommendedDuration);
    const ranges = [...item.prompt.matchAll(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?) seconds/g)];
    if (ranges.length)
      expect(Math.max(...ranges.map((range) => Number(range[2])))).toBe(item.recommendedDuration);
  }
});

it('declares explicit video inputs only for templates that need a source video', () => {
  const inputs = templates.filter((item) => 'referenceVideoSrc' in item);
  expect(inputs.map((item) => item.id)).toEqual([
    'video:2026-11-13:03',
    'video:2026-11-13:05',
    'video:2026-11-13:08',
  ]);
  for (const item of inputs) {
    expect(item.prompt).toMatch(/@video1/i);
    expect(item.referenceVideoSrc).not.toBe(item.previewSrc);
    expect(existsSync(new URL('../public' + item.referenceVideoSrc, import.meta.url))).toBe(true);
  }
});

it('keeps prompt bodies out of card metadata and rejects unknown references', async () => {
  expect(cards.every((card) => !('prompt' in card))).toBe(true);
  await expect(loadTemplate({ ...cards[0], id: 'missing' })).rejects.toThrow('текст шаблона');
});
