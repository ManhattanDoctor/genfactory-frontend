import type { IGnosisFile } from '../../lib/types';
export const promptTasks = {
  image: 'Изображение',
  video: 'Видео',
  presentation: 'Презентация',
  other: 'Другая задача',
};
export const promptTargets = {
  universal: 'Для всех',
  image: 'Для изображения',
  video: 'Для видео',
  presentation: 'Для презентации',
  banana: 'Для Nano Banana',
};
export const promptAspects = ['Общая идея', 'Стиль', 'Композиция', 'Объект или персонаж'];
export interface PromptInput {
  task: keyof typeof promptTasks;
  target: keyof typeof promptTargets;
  language: 'English' | 'Русский';
  aspects: string[];
  note: string;
}
export const initialPromptInput: PromptInput = {
  task: 'image',
  target: 'universal',
  language: 'English',
  aspects: [...promptAspects],
  note: '',
};
export interface PromptResult {
  status: 'ready' | 'needs_clarification' | 'blocked';
  title: string;
  prompt: string | null;
  observations: { fileId: number; text: string }[];
  clarifications: string[];
  limitations: string[];
}
export function promptRequest(input: PromptInput, files: IGnosisFile[]): string {
  return (
    '[Genfactory:prompt]\n' +
    (files.some((f) => f.type === 'VIDEO')
      ? 'Для каждого приложенного видео вызови VIDEO_RECOGNITION с его fileId ровно один раз. Попроси описать последовательность событий, движение камеры и выбранные аспекты. Изображения анализируй непосредственно. На основании анализа подготовь текстовый промпт. При ошибке инструмента верни blocked, не повторяй вызов. Не обещай анализ звука без подтверждения. '
      : 'Проанализируй только приложенные изображения и подготовь текстовый промпт. Не вызывай инструменты. ') +
    'Не генерируй медиа. Не восстанавливай якобы точный исходный промпт. Не выдумывай содержимое недоступных файлов. ' +
    'Отделяй увиденное от пожеланий пользователя. Не добавляй новые объекты, движение или текст без основания. Если данных достаточно, сразу подготовь промпт; иначе задай только необходимые уточнения. ' +
    'Верни ровно один JSON-объект без markdown, дополнительных объектов и текста после него по структуре: {"status":"ready|needs_clarification|blocked","title":"Краткое название на русском","prompt":"Готовый промпт или null","observations":[{"fileId":123,"text":"Наблюдение на русском"}],"clarifications":[],"limitations":[]}. ' +
    'Для ready нужен непустой prompt. Для уточнений не выдавай готовый промпт. Используй только указанные fileId. Язык самого промпта задан в language; пояснения на русском. ' +
    'task задаёт вид результата, target — целевой генератор. Презентация означает слайды, а не видео. Nano Banana означает неподвижное изображение. Сохраняй только выбранные aspects.\n' +
    '[Genfactory:prompt-input] ' +
    JSON.stringify(input) +
    '\n' +
    'Исходники: ' +
    JSON.stringify(files.map((f) => ({ id: f.id, name: f.name, type: f.type }))) +
    '\n\nЗапрос пользователя:\n' +
    (input.note.trim() || 'Подготовь промпт по приложенным материалам и выбранным настройкам.')
  );
}
export function readPromptInput(text: string): PromptInput | undefined {
  const line = text.split('\n').find((line) => line.startsWith('[Genfactory:prompt-input] '));
  if (!line) return;
  try {
    const value = JSON.parse(line.slice('[Genfactory:prompt-input] '.length));
    if (
      !Object.hasOwn(promptTasks, value.task) ||
      !Object.hasOwn(promptTargets, value.target) ||
      !['English', 'Русский'].includes(value.language) ||
      typeof value.note !== 'string' ||
      !Array.isArray(value.aspects) ||
      !value.aspects.every((v: unknown) => typeof v === 'string' && promptAspects.includes(v))
    )
      return;
    return value;
  } catch {
    return;
  }
}
export function readPromptResult(text: string, fileIds: number[]): PromptResult | undefined {
  try {
    const json = text
      .trim()
      .replace(/^```(?:json)?\s*\n?/, '')
      .replace(/\n?```$/, '');
    let value;
    try {
      value = JSON.parse(json);
    } catch {
      // Some answers append a redundant status object. Accept only this unambiguous
      // shape; never silently discard another result, an error, or conflicting status.
      const parts = JSON.parse(`[${json}]`);
      if (
        parts.length !== 2 ||
        !parts[0] ||
        !parts[1] ||
        Object.keys(parts[1]).length !== 1 ||
        parts[1].status !== parts[0].status
      )
        return;
      value = parts[0];
    }
    const strings = (v: unknown) =>
      Array.isArray(v) && v.length <= 20 && v.every((x) => typeof x === 'string' && x.length <= 4000);
    if (
      !['ready', 'needs_clarification', 'blocked'].includes(value.status) ||
      typeof value.title !== 'string' ||
      value.title.length > 300 ||
      (value.prompt !== null && typeof value.prompt !== 'string') ||
      (value.status === 'ready' && !value.prompt?.trim()) ||
      (value.prompt?.length || 0) > 24000 ||
      !strings(value.clarifications) ||
      !strings(value.limitations) ||
      !Array.isArray(value.observations) ||
      value.observations.length > 20 ||
      !value.observations.every(
        (o: any) => fileIds.includes(o.fileId) && typeof o.text === 'string' && o.text.length <= 4000,
      )
    )
      return;
    return { ...value, prompt: value.status === 'ready' ? value.prompt : null };
  } catch {
    return;
  }
}
