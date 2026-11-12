import type { IModelDescription, IGnosisFile } from '../../lib/types';

export type VideoReferenceMode = 'frames' | 'references';
export function videoReferenceMode(
  model: IModelDescription,
  count: number,
  frames = false,
): VideoReferenceMode {
  const properties = model.schema.properties?.options?.properties;
  return !frames && count > 0 && properties?.inputReferences ? 'references' : 'frames';
}
export function videoInputOptions(
  model: IModelDescription,
  files: IGnosisFile[],
  mode: VideoReferenceMode,
): {
  inputReferences?: Array<{ url: string; type: 'image' }>;
  frameImages?: Array<{ url: string; type: 'first_frame' | 'last_frame' }>;
} {
  const properties = model.schema.properties?.options?.properties;
  const limit =
    mode === 'references'
      ? (properties?.inputReferences?.maxItems ?? 0)
      : (properties?.frameImages?.maxItems ?? 0);
  if (files.length > limit)
    throw new Error(`Модель поддерживает до ${limit} изображений в выбранном режиме.`);
  return mode === 'references'
    ? { inputReferences: files.length ? files.map((file) => ({ url: file.path, type: 'image' })) : undefined }
    : {
        frameImages: files.length
          ? files.map((file, index) => ({ url: file.path, type: index === 0 ? 'first_frame' : 'last_frame' }))
          : undefined,
      };
}
