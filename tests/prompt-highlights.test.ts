import { expect, it } from 'vitest';
import { PromptTemplate } from '../src/features/content-studio/PromptTemplate';
import { promptParts } from '../src/features/content-studio/PromptText';

it('highlights the inserted occurrence rather than matching all identical words', () => {
  const text = 'Корзина: {PRODUCT}';
  expect(promptParts(text, text, { PRODUCT: 'Корзина' })).toEqual([
    { text: 'Корзина: ', highlighted: false },
    { text: 'Корзина', highlighted: true },
  ]);
});
it('highlights manual additions while retaining unchanged text and substitutions', () => {
  const parts = promptParts('Фото {PRODUCT}. Мягкий свет.', 'Фото {PRODUCT}.', { PRODUCT: 'Чашка' });
  expect(parts.map((p) => p.text).join('')).toBe('Фото Чашка. Мягкий свет.');
  expect(
    parts
      .filter((p) => p.highlighted)
      .map((p) => p.text)
      .join(''),
  ).toContain('Мягкий свет.');
  expect(parts[0]).toEqual({ text: 'Фото ', highlighted: false });
});
it('renders a partial form, plurals and templates without variables', () => {
  const recipe = new PromptTemplate('{N, plural, one {# файл} few {# файла} other {# файлов}} для {PRODUCT}');
  expect(
    recipe
      .parts({ N: '2' })
      .map((p) => p.text)
      .join(''),
  ).toBe('2 файла для {PRODUCT}');
  expect(recipe.isNumeric('N')).toBe(true);
  expect(new PromptTemplate('{STYLE, select, light {Светло} other {Темно}}').choices.get('STYLE')).toEqual([
    'light',
    'other',
  ]);
  expect(promptParts('Готовый промт', 'Готовый промт', {})).toEqual([
    { text: 'Готовый промт', highlighted: false },
  ]);
});
it('preserves escaped source literally in the textarea backdrop', () => {
  const text = "'{PRODUCT}' and {PRODUCT}";
  expect(
    new PromptTemplate(text)
      .sourceParts()
      .map((p) => p.text)
      .join(''),
  ).toBe(text);
});
