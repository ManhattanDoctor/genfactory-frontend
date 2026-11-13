import type { IModelDescription } from '../../lib/types';
import { videoFrames } from '../workspace/videoFrames';

export interface ITemplate {
  id: string;
  kind: string;
  title: string;
  genre: string;
  addedAt?: string;
  prompt: string;
  model?: IModelDescription['reference'];
  duration?: number;
  src: string;
  previewSrc?: string;
  referenceVideoSrc?: string;
  ratio: string;
  references?: { min: number; max?: number };
}
export interface ITemplateVideoReference {
  templateId: string;
  fileId: number;
}

export async function templateVideoFile(template: ITemplate, signal?: AbortSignal): Promise<File> {
  if (template.kind !== 'video' || !template.referenceVideoSrc)
    throw new Error('У шаблона нет видеореференса.');
  const response = await fetch(template.referenceVideoSrc, { signal });
  if (!response.ok) throw new Error('Не удалось загрузить видео шаблона. Повторите выбор.');
  const blob = await response.blob();
  if (!blob.type.startsWith('video/')) throw new Error('Видео шаблона недоступно.');
  return new File([blob], `${template.title} — референс.mp4`, { type: blob.type });
}

/** A gallery preview is a reference only when explicitly selected for a frame slot. */
export async function templateFrame(template: ITemplate, slot: 'start' | 'end'): Promise<File> {
  if (!['image', 'video'].includes(template.kind))
    throw new Error('Для кадра выберите изображение или видео.');
  const response = await fetch(template.src);
  if (!response.ok) throw new Error('Не удалось загрузить материал шаблона. Повторите выбор.');
  const blob = await response.blob();
  if (template.kind === 'video' && !blob.type.startsWith('video/'))
    throw new Error('Видео шаблона недоступно.');
  if (template.kind === 'image' && !/^image\/(jpeg|png|webp)$/.test(blob.type))
    throw new Error('Изображение шаблона недоступно.');
  const file = new File(
    [blob],
    `${template.title}.${template.kind === 'video' ? 'mp4' : blob.type.split('/')[1]}`,
    { type: blob.type },
  );
  if (template.kind === 'image') return file;
  const [frame] = await videoFrames(file, [slot === 'start' ? 0 : 1]);
  return frame;
}

export function templateInstructions(templates: ITemplate[]): string {
  if (!templates.length) return '';
  return [
    'Используй следующие шаблоны как описание приёма. Изображения и ролики-примеры не являются вложениями пользователя. Переменные в фигурных скобках заполняй только из брифа, истории и переданных материалов; @Image1 означает первый переданный референс. Если существенных данных или требуемого референса нет, уточни их до генерации. Не выдумывай продукт, надписи и факты. Явные настройки текущего запуска важнее противоречащих им структуры, длительности, звука и формата в тексте шаблона.',
    ...templates.map((item) => `Шаблон «${item.title}»:\n${item.prompt}`),
  ].join('\n\n');
}
