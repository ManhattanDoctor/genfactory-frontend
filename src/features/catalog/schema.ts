import Ajv from 'ajv';
import type { ModelDescription, Schema, TaskRequest } from '../../lib/types';
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validators = new WeakMap<Schema, ReturnType<typeof ajv.compile>>();
export function defaults(schema?: Schema): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema?.properties || {})) {
    if (field.default !== undefined) values[key] = structuredClone(field.default);
    else if (field.const !== undefined) values[key] = field.const;
  }
  return values;
}
export const fieldNames: Record<string, string> = {
  size: 'Размер',
  aspectRatio: 'Формат кадра',
  resolution: 'Разрешение',
  quality: 'Качество',
  background: 'Фон',
  format: 'Формат файла',
  compression: 'Сжатие',
  moderation: 'Модерация',
  inputFidelity: 'Точность референса',
  duration: 'Длительность, сек.',
  generateAudio: 'Генерировать звук',
  seed: 'Seed',
};
export function optionFields(model: ModelDescription): [string, Schema][] {
  return Object.entries(model.schema.properties?.options?.properties || {}).filter(
    ([key, field]) =>
      !['model', 'provider', 'stream', 'partialImages', 'frameImages', 'prompt'].includes(key) &&
      ['string', 'integer', 'number', 'boolean'].includes(field.type || ''),
  );
}
export function validateRequest(model: ModelDescription, request: TaskRequest): string[] {
  let validate = validators.get(model.schema);
  if (!validate) {
    validate = ajv.compile(model.schema);
    validators.set(model.schema, validate);
  }
  if (validate(request)) return [];
  return (validate.errors || [])
    .filter((e) => !['if'].includes(e.keyword))
    .map((e) => `${e.instancePath || 'Запрос'}: ${e.message}`)
    .slice(0, 5);
}
export function supportsReferences(model?: ModelDescription): boolean {
  return !!(
    model?.schema.properties?.task?.properties?.fileIds ||
    model?.schema.properties?.options?.properties?.frameImages
  );
}
export function referenceLimit(model?: ModelDescription): number {
  return (
    model?.schema.properties?.task?.properties?.fileIds?.maxItems ??
    model?.schema.properties?.options?.properties?.frameImages?.maxItems ??
    0
  );
}
