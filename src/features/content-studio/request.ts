import '../../lib/transport-polyfills';
import { ObjectUtil } from '@ts-core/common';
import { videoInputOptions, videoReferenceMode, type VideoReferenceMode } from '../catalog/videoInputs';
import { ratioSizes } from './controls';
import type { IGnosisFile, IModelDescription, ITaskRequest, MediaKind } from '../../lib/types';
import {
  followsReferenceRatio,
  defaults,
  referenceLimit,
  referenceMinimum,
  supportsReferences,
  validateRequest,
} from '../catalog/schema';

/** Validate the actual payload before creating a paid conversation message. */
export function mediaOptions(
  model: IModelDescription,
  kind: MediaKind,
  prompt: string,
  files: IGnosisFile[],
  values: Record<string, unknown>,
  referenceMode?: VideoReferenceMode,
): Record<string, unknown> {
  const schema = model.schema.properties?.options;
  const properties = schema?.properties || {};
  const options = defaults(schema);
  for (const [key, value] of Object.entries(values)) {
    if (key === 'frameImages' || key === 'inputReferences') continue;
    if (properties[key]) options[key] = value;
    else if (key === 'aspectRatio') {
      const size = ratioSizes(model).get(String(value));
      if (!size) throw new Error('Выбранный формат не поддерживается моделью. Выберите доступный формат.');
      options.size = size;
    } else if (key === 'generateAudio' && value === true)
      throw new Error('Эта модель не поддерживает настройку звука.');
  }
  if (
    followsReferenceRatio(
      model,
      files.length,
      referenceMode || (kind === 'video' ? videoReferenceMode(model, files.length) : undefined),
    )
  )
    delete options.aspectRatio;
  if (files.some((file) => file.type !== 'IMAGE'))
    throw new Error('Для этой генерации доступны только изображения-референсы.');
  if (files.length && (!supportsReferences(model) || files.length > referenceLimit(model)))
    throw new Error('Модель не поддерживает выбранное количество референсов.');
  if (files.length < referenceMinimum(model))
    throw new Error('Добавьте обязательные референсы выбранной модели.');
  const request: ITaskRequest = {
    model: model.reference.provider,
    task: { prompt, session: crypto.randomUUID() },
    options: { ...options, model: model.reference.model },
  };
  if (files.length && kind === 'image') request.task.fileIds = files.map((file) => file.id);
  if (files.length && kind === 'video')
    ObjectUtil.copyPartial(
      videoInputOptions(model, files, referenceMode || videoReferenceMode(model, files.length)),
      request.options,
    );
  if (request.options.inputReferences && model.reference.model === 'google/veo-3.1' && options.duration !== 8)
    throw new Error('Для референсов Veo выберите длительность 8 секунд.');
  const errors = validateRequest(model, request);
  if (errors.length) throw new Error(`Настройки не подходят выбранной модели. ${errors.join(' ')}`);
  return options;
}
