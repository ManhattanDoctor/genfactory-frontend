import type { IModelDescription } from '../../lib/types';
import { modelDescriptions } from './modelDescriptions';
export const modelKey = (model: IModelDescription) => `${model.reference.provider}:${model.reference.model}`;
/** Favorites affect display order only, never the default used to execute a request. */
export function favoritesFirst<T>(items: T[], favorites: string[], key: (item: T) => string): T[] {
  const selected = new Set(favorites);
  return [...items].sort((a, b) => Number(selected.has(key(b))) - Number(selected.has(key(a))));
}
export function modelTitle(model: Pick<IModelDescription, 'reference' | 'name'>): string {
  const words: Record<string, string> = {
    gpt: 'GPT',
    ai: 'AI',
    flux: 'FLUX',
    mai: 'MAI',
    hy: 'HY',
    o1: 'o1',
    o3: 'o3',
    o4: 'o4',
  };
  const raw =
    model.name === model.reference.model
      ? model.reference.model
          .split('/')
          .at(-1)!
          .split('-')
          .map((w) => words[w] || w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      : model.name;
  return raw
    .replace(/^[^:]+:\s*/, '')
    .replace(
      /^(?:Open\s?AI|Google|Black Forest Labs|Microsoft|ByteDance(?: Seed)?|Alibaba|Tencent|Sourceful|Meta|xAI)\s*[-–·]?\s+/i,
      '',
    )
    .trim();
}
/** Short use cases describe the task, without unsupported quality rankings. */
export function modelSummary(model: IModelDescription): string {
  const description = modelDescriptions[model.reference.model];
  if (description) return description;
  const id = model.reference.model.toLowerCase();
  if (id.startsWith('krea/krea-2-'))
    return 'Визуальные идеи и стилизация по фото. При правке форма предмета может измениться.';
  const cases: Array<[RegExp, string]> = [
    [/recraft.*vector/, 'Векторные иллюстрации, иконки и графика для масштабирования.'],
    [/recraft/, 'Иллюстрации, предметные изображения и графика для макетов.'],
    [/gpt.*image|image.*gpt/, 'Создание изображений по описанию и редактирование готового фото.'],
    [/qwen.*image/, 'Постеры, изображения с надписями и правка фото по описанию.'],
    [/seedream/, 'Предметные кадры, рекламные композиции и варианты готового изображения.'],
    [/flux/, 'Предметные изображения, визуальные концепции и редактирование по фото.'],
    [/riverflow/, 'Вариации изображений и правка отдельных деталей по описанию.'],
    [/mai.*image/, 'Новые визуальные идеи и изображения по вашему описанию.'],
    [/grok.*image/, 'Изображения по описанию и творческие варианты готового фото.'],
    [/gemini.*image|banana/, 'Создание и редактирование изображений с учётом загруженных фото.'],
    [/k3.*edit/, 'Редактирование загруженного фото по вашему описанию.'],
    [/wan/, 'Видео по сценарию или исходному фото, со звуком.'],
    [/seedance/, 'Видео по описанию, первому и последнему кадрам.'],
    [/runway/, 'Короткие видеосцены по описанию или исходному кадру.'],
    [/veo/, 'Видеосцены по описанию и фото с настройкой звука.'],
    [/grok.*video/, 'Короткие видеосцены и оживление фото со звуком.'],
  ];
  const match = cases.find(([pattern]) => pattern.test(id));
  if (match) return match[1];
  if (model.capabilities?.includes('IMAGE_OUTPUT')) return 'Создание изображений по вашему описанию.';
  if (model.capabilities?.includes('VIDEO_OUTPUT')) return 'Создание видео по сценарию и материалам проекта.';
  return 'Тексты, ответы на вопросы и подготовка материалов для вашего проекта.';
}
