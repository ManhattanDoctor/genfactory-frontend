import { describe, it, expect } from 'vitest';
import { textInstruction, creativePrompt } from '../src/features/workspace/prompt';
import { displayMessageText } from '../src/features/studio/conversations';
import { templates } from '../src/features/workspace/presetCatalog';
describe('Workspace instructions', () => {
  it('keeps discussion and preparation distinct from media execution', () => {
    for (const mode of ['chat', 'prompt', 'script'] as const) {
      const text = textInstruction(mode, 'Моя идея', {
        language: 'English',
        target: 'video',
        aspects: ['Свет'],
        brand: 'Зелёный фон',
      });
      expect(displayMessageText(text)).toBe('Моя идея');
      expect(text).toContain('Зелёный фон');
      expect(text).toMatch(/Не запускай|Не генерируй/);
    }
  });
  it('only adds selected creative instructions and leaves plain prompts intact', () => {
    expect(creativePrompt('Идея', '', {})).toBe('Идея');
    expect(creativePrompt('Идея', 'Наш стиль', { Свет: 'Мягкий', Камера: '' })).toContain('Свет: Мягкий');
    expect(creativePrompt('Идея', 'Наш стиль', { Камера: '' })).not.toContain('Камера:');
    expect(displayMessageText('Обычный ответ\n\nЗапрос пользователя:\nТекст')).toContain('Обычный ответ');
  });
  it('ships uniquely identified templates without fabricated provider IDs', () => {
    expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length);
    expect(templates.every((t) => t.prompt.trim() && t.name.trim() && !t.model)).toBe(true);
  });
});
