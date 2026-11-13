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
  inputReferences?: Array<{ url: string; type: 'image' | 'video' }>;
  frameImages?: Array<{ url: string; type: 'first_frame' | 'last_frame' }>;
} {
  const issue = videoReferenceError(model, files, mode);
  if (issue) throw new Error(issue);
  return mode === 'references'
    ? {
        inputReferences: files.length
          ? files.map((file) => ({
              url: file.path,
              type: file.type === 'VIDEO' ? ('video' as const) : ('image' as const),
            }))
          : undefined,
      }
    : {
        frameImages: files.length
          ? files.map((file, index) => ({ url: file.path, type: index === 0 ? 'first_frame' : 'last_frame' }))
          : undefined,
      };
}

export function supportsVideoReferences(model?: IModelDescription): boolean {
  return !!model?.schema.properties?.options?.properties?.inputReferences?.items?.properties?.type?.enum?.includes(
    'video',
  );
}
export function videoReferenceError(
  model: IModelDescription,
  files: Array<Pick<IGnosisFile, 'type' | 'mime' | 'size'>>,
  mode: VideoReferenceMode = videoReferenceMode(model, files.length),
): string | undefined {
  const schema =
    model.schema.properties?.options?.properties?.[mode === 'references' ? 'inputReferences' : 'frameImages'];
  if (files.length > (schema?.maxItems ?? 0))
    return 'Модель не поддерживает выбранное количество референсов.';
  const types = mode === 'references' ? (schema?.items?.properties?.type?.enum ?? ['image']) : ['image'];
  const limits = schema?.['x-referenceLimits'];
  for (const file of files) {
    const type = file.type === 'IMAGE' ? 'image' : file.type === 'VIDEO' ? 'video' : '';
    if (!types.includes(type)) return 'Выбранная модель или режим не поддерживает этот тип вложения.';
    const limit = limits?.[type];
    if (limit?.maxBytes && (!file.size || file.size > limit.maxBytes))
      return `Размер видео должен быть не больше ${Math.round(limit.maxBytes / 1024 / 1024)} МБ.`;
    if (limit?.mimeTypes && !limit.mimeTypes.includes(file.mime)) return 'Для видео выберите MP4 или MOV.';
    if (limit?.maxItems && files.filter((item) => item.type === file.type).length > limit.maxItems)
      return `Можно добавить до ${limit.maxItems} ${type === 'video' ? 'видео' : 'изображений'}.`;
  }
}

/** Read the original video metadata before starting a paid request. Preview dimensions are derived and cannot be used here. */
export async function validateVideoReferenceDimensions(
  model: IModelDescription,
  files: IGnosisFile[],
): Promise<void> {
  const minimum =
    model.schema.properties?.options?.properties?.inputReferences?.['x-referenceLimits']?.video?.minPixels;
  if (!minimum) return;
  for (const file of files.filter((item) => item.type === 'VIDEO')) {
    const video = document.createElement('video');
    video.preload = 'metadata';
    try {
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error): void => {
          clearTimeout(timer);
          video.onloadedmetadata = null;
          video.onerror = null;
          error ? reject(error) : resolve();
        };
        const timer = setTimeout(
          () => finish(new Error('Не удалось проверить разрешение видео. Попробуйте ещё раз.')),
          15000,
        );
        video.onerror = () => finish(new Error('Не удалось прочитать исходное видео. Выберите другой файл.'));
        video.onloadedmetadata = () =>
          finish(
            video.videoWidth * video.videoHeight < minimum
              ? new Error(
                  `Слишком маленькое видео: ${video.videoWidth}×${video.videoHeight}. Модель требует минимум ${minimum} пикселей. Выберите видео большего разрешения.`,
                )
              : undefined,
          );
        video.src = file.path;
      });
    } finally {
      video.removeAttribute('src');
      video.load();
    }
  }
}
