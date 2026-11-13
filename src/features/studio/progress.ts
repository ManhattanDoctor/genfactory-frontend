import type { IToolProgress } from '../../lib/types';
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
export function readTools(value: unknown): IToolProgress[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (t): t is IToolProgress =>
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
const toolResultLabels: Record<string, string> = {
  IMAGE: 'Генерация изображения',
  VIDEO: 'Генерация видео',
  IMAGE_RECOGNITION: 'Анализ изображения',
  IMAGE_RESIZE: 'Изменение размера изображения',
  MEDIA_CONVERT: 'Обработка медиа',
  TTS: 'Озвучка',
  STT: 'Распознавание речи',
};

export function toolLabel(tool: IToolProgress): string {
  if (tool.status === 'ERRORED' || tool.status === 'FINISHED') {
    const uid = tool.uid.replace(/_OPEN_(AI|ROUTER)$/, '');
    const name = toolResultLabels[uid] || tool.name || 'Инструмент';
    return `${name}: ${tool.status === 'ERRORED' ? 'ошибка' : 'завершено'}`;
  }
  return toolLabels[tool.uid] || tool.name || 'Выполняем инструмент';
}
