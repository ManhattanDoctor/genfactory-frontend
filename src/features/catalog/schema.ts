import Ajv from 'ajv';
import type { IModelDescription, ISchema, ITaskRequest } from '../../lib/types';
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validators = new WeakMap<ISchema, ReturnType<typeof ajv.compile>>();
export function defaults(schema?: ISchema): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema?.properties || {})) {
    if (field.default !== undefined) values[key] = structuredClone(field.default);
    else if (field.const !== undefined) values[key] = field.const;
  }
  return values;
}
export const fieldNames: Record<string, string> = {
  voice: 'Голос',
  speed: 'Скорость речи',
  language: 'Язык (код, например ru)',
  temperature: 'Вариативность',
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
export function optionFields(model: IModelDescription): [string, ISchema][] {
  return Object.entries(model.schema.properties?.options?.properties || {}).filter(
    ([key, field]) =>
      !['model', 'provider', 'stream', 'partialImages', 'frameImages', 'prompt'].includes(key) &&
      ['string', 'integer', 'number', 'boolean'].includes(field.type || ''),
  );
}
export function validateRequest(model: IModelDescription, request: ITaskRequest): string[] {
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
export function supportsReferences(model?: IModelDescription): boolean {
  return !!(
    model?.schema.properties?.task?.properties?.fileIds ||
    model?.schema.properties?.options?.properties?.frameImages
  );
}
export function referenceLimit(model?: IModelDescription): number {
  return (
    model?.schema.properties?.task?.properties?.fileIds?.maxItems ??
    model?.schema.properties?.options?.properties?.frameImages?.maxItems ??
    0
  );
}

export function referenceMinimum(model?: IModelDescription): number {
  const task = model?.schema.properties?.task;
  const options = model?.schema.properties?.options;
  if (task?.required?.includes('fileIds')) return Math.max(1, task.properties?.fileIds?.minItems ?? 1);
  if (options?.required?.includes('frameImages'))
    return Math.max(1, options.properties?.frameImages?.minItems ?? 1);
  return 0;
}

/** Grok Lite and Wan follow the first frame's aspect ratio in the verified integration. */
export function followsReferenceRatio(model: IModelDescription | undefined, count: number): boolean {
  return (
    count > 0 &&
    model?.reference.provider === 'OPEN_ROUTER_VIDEO' &&
    ['x-ai/grok-imagine-video-1.5-lite', 'alibaba/wan-3.0'].includes(model.reference.model)
  );
}
