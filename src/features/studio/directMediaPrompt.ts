import type { MediaKind } from '../../lib/types';

/** Compose the provider prompt directly; no instructions for a tool-calling assistant. */
export function directMediaPrompt(kind: MediaKind, idea: string, template: string, shape = 'single'): string {
  const brief = idea.trim();
  const pattern = template.trim();
  const prompt =
    brief && pattern
      ? `Основной запрос:\n${brief}\n\nШаблон:\n${pattern}\n\nПри противоречии основной запрос имеет приоритет над шаблоном.`
      : brief || pattern || (kind === 'video' ? 'Оживи изображение.' : 'Создай изображение.');
  if (kind === 'image') return prompt;
  return `${prompt}\n\n${shape === 'sequence' ? 'Структура: несколько сцен с монтажными переходами.' : 'Структура: один непрерывный кадр без монтажных склеек.'}`;
}
