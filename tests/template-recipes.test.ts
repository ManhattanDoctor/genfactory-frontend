import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import templates from '../src/features/content-studio/templates.json';
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

it('records explicit video durations including timelines and preserves unspecified durations', () => {
  const get = (n: number) =>
    templates.find((item) => item.id === `video:2026-11-13:${String(n).padStart(2, '0')}`)!;
  for (const [n, duration] of [
    [1, 18],
    [2, 12],
    [5, 15],
    [9, 30],
    [12, 20],
    [13, 15],
    [23, 15],
  ])
    expect(get(n)).toHaveProperty('duration', duration);
  expect(get(3)).not.toHaveProperty('duration');
  for (const item of templates.filter(
    (item) => item.kind === 'video' && !item.id.startsWith('video:2026-11-13:'),
  ))
    expect(item).toHaveProperty('duration', templateDuration(item.prompt));
});
