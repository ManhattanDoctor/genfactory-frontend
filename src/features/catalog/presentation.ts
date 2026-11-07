import type { IModelDescription } from '../../lib/types';
import { referenceLimit, supportsReferences } from './schema';

export const modelKey = (model: IModelDescription) => `${model.reference.provider}:${model.reference.model}`;

/** Sort display copies only: favorites must not change Auto or the selected model. */
export function favoritesFirst<T>(
  items: Array<T>,
  favorites: Array<string>,
  key: (item: T) => string,
): Array<T> {
  const selected = new Set(favorites);
  return [...items].sort((a, b) => Number(selected.has(key(b))) - Number(selected.has(key(a))));
}

/** Presentation only: never change the provider/model identifiers sent to the API. */
export function modelTitle(model: Pick<IModelDescription, 'reference' | 'name'>): string {
  if (model.name !== model.reference.model) return model.name;
  const words: Record<string, string> = {
    gpt: 'GPT',
    ai: 'AI',
    o1: 'o1',
    o3: 'o3',
    o4: 'o4',
  };
  return model.name
    .split('/')
    .at(-1)!
    .split('-')
    .map((word) => words[word] || word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function modelSummary(model: IModelDescription): string {
  const properties = model.schema.properties?.options?.properties || {};
  const media =
    model.capabilities?.includes('VIDEO_OUTPUT') || model.reference.provider.includes('VIDEO')
      ? 'Видео'
      : model.capabilities?.includes('IMAGE_OUTPUT') || model.reference.provider.includes('IMAGE')
        ? 'Изображения'
        : 'Текст';
  const parts = [media];
  if (media !== 'Текст') {
    parts.push(
      supportsReferences(model)
        ? referenceLimit(model)
          ? `Референсы: до ${referenceLimit(model)}`
          : 'Поддерживает референсы'
        : 'Без референсов',
    );
  }
  const resolution = properties.resolution?.enum;
  if (resolution?.length) parts.push(resolution.join(' / '));
  const duration = properties.duration;
  if (duration?.enum?.length) {
    const values = duration.enum;
    const consecutive =
      values.length > 2 &&
      values.every((value, i) => typeof value === 'number' && (!i || value === Number(values[i - 1]) + 1));
    parts.push(`${consecutive ? `${values[0]}–${values.at(-1)}` : values.join(' / ')} с`);
  } else if (duration?.minimum !== undefined && duration.maximum !== undefined)
    parts.push(`${duration.minimum}–${duration.maximum} с`);
  return parts.join(' · ');
}
