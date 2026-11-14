import type { IModelDescription } from '../../lib/types';
import { isSchemaValue } from '../catalog/schema';
import type { ITemplate } from './materials';
import { adaptTemplateDuration, templateTimingError } from './templateRecipe';

/** Explicit form value wins; only an unset value uses the template recommendation. */
export function resolveTemplateDuration(
  item: ITemplate,
  selected: unknown,
  model: IModelDescription | undefined,
): number | undefined {
  if (item.kind !== 'video') return;
  if (!model) throw new Error('Модель шаблона недоступна. Обновите каталог моделей.');
  const field = model.schema.properties?.options?.properties?.duration;
  if (!field) throw new Error('Модель шаблона не поддерживает выбор длительности видео.');
  const duration = selected ?? item.recommendedDuration ?? field.default ?? field.const;
  if (
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !isSchemaValue(field, duration)
  )
    throw new Error(
      `Длительность ${String(duration ?? '')} с не поддерживается моделью «${model.name}». Выберите другое время в форме.`,
    );
  return duration;
}

export function fitTemplateDuration(
  item: ITemplate,
  selected: unknown,
  model: IModelDescription | undefined,
): ITemplate {
  const duration = resolveTemplateDuration(item, selected, model);
  if (duration === undefined) return item;
  const prompt = adaptTemplateDuration(item.prompt, duration);
  const error = templateTimingError(prompt, duration);
  if (error) throw new Error(error);
  return { ...item, prompt };
}
