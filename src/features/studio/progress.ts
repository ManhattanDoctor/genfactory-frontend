import type { ToolProgress } from '../../lib/types';
export const toolLabels: Record<string, string> = {
  IMAGE: 'Создаём изображение',
  IMAGE_OPEN_AI: 'Создаём изображение',
  IMAGE_OPEN_ROUTER: 'Создаём изображение',
  VIDEO: 'Ожидаем готовое видео',
  VIDEO_OPEN_ROUTER: 'Ожидаем готовое видео',
  IMAGE_RECOGNITION: 'Анализируем изображение',
  IMAGE_RESIZE: 'Меняем размер изображения',
  MEDIA_CONVERT: 'Обрабатываем медиа',
  TTS: 'Создаём озвучку',
  STT: 'Распознаём речь',
};
export function readTools(value: unknown): ToolProgress[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (t): t is ToolProgress =>
        !!t &&
        typeof t.uid === 'string' &&
        (t.status === undefined || ['STARTED', 'FINISHED', 'ERRORED'].includes(t.status)),
    )
    .slice(0, 20)
    .map((t) => ({
      uid: t.uid,
      name: typeof t.name === 'string' ? t.name.slice(0, 120) : undefined,
      status: t.status,
    }));
}
export function toolLabel(tool: ToolProgress): string {
  const name = toolLabels[tool.uid] || tool.name || 'Выполняем инструмент';
  return tool.status === 'ERRORED'
    ? `${name}: ошибка инструмента`
    : tool.status === 'FINISHED'
      ? `${name}: завершено`
      : name;
}
