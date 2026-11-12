import type { StudioMode } from './studioTypes';

// Temporarily hidden by user request. Remove the mode entirely later; see docs/IMPLEMENTATION-DIFFERENCES.md.
export const SCRIPT_WRITER_ENABLED = false;

export const modes: [StudioMode, string][] = [
  ['image', 'Изображение'],
  ['video', 'Видео'],
];
export const fields = [
  {
    id: 'format',
    label: 'Формат',
    options: [
      'Не задано',
      'UGC, съёмка на телефон',
      'Премиум, студийный свет',
      'Минимализм, чистый фон',
      'Динамичный, быстрый ритм',
    ],
  },
  {
    id: 'idea',
    label: 'Идея',
    options: ['Не задано', 'Начать с проблемы', 'Начать с вопроса', 'Сразу показать товар', 'Резкий старт'],
  },
  {
    id: 'place',
    label: 'Обстановка',
    options: ['Не задано', 'Дома', 'На улице', 'В студии', 'В кафе', 'На природе'],
  },
  {
    id: 'camera',
    label: 'Камера',
    options: ['Авто', 'Статичная', 'С телефона', 'С рук', 'Низкий угол', 'Сверху'],
  },
  { id: 'move', label: 'Движение', options: ['Нет', 'Наезд', 'Отъезд', 'Объезд', 'Слежение'] },
  { id: 'lens', label: 'Линза', options: ['Авто', '24 мм', '35 мм', '50 мм', '85 мм', 'Макро'] },
  { id: 'light', label: 'Свет', options: ['Авто', 'Дневной', 'Студия', 'Золотой час', 'Ночь'] },
  { id: 'quality', label: 'Качество', options: ['480p', '720p', '1080p'] },
];
