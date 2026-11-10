import { describe, expect, it } from 'vitest';
import { directMediaPrompt } from '../src/features/studio/directMediaPrompt';

describe('direct media prompt', () => {
  it('sends the image idea literally without a tool-calling wrapper', () => {
    expect(directMediaPrompt('image', 'Красная чашка на столе', '')).toBe('Красная чашка на столе');
  });
  it('preserves the template and user instructions and gives the idea priority', () => {
    const prompt = directMediaPrompt('image', 'Синий фон', 'Предмет на белом фоне [PRODUCT]');
    expect(prompt).toContain('Синий фон');
    expect(prompt).toContain('Предмет на белом фоне [PRODUCT]');
    expect(prompt).toContain('основной запрос имеет приоритет');
  });
  it('passes video structure to the provider without inventing a restriction on scene or clothes', () => {
    const prompt = directMediaPrompt('video', 'Перенеси героя на пляж', '', 'single');
    expect(prompt).toContain('Перенеси героя на пляж');
    expect(prompt).toContain('один непрерывный кадр');
    expect(prompt).not.toMatch(/сохрани.*(одежд|обстановк)|вызови|Genfactory/);
    expect(directMediaPrompt('video', '', '', 'sequence')).toContain('Оживи изображение.');
    expect(directMediaPrompt('video', '', '', 'sequence')).toContain('несколько сцен');
  });
});
