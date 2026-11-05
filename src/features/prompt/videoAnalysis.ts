import type { IGnosisFile, IModelDescription, IToolConnection } from '../../lib/types';

export function videoAnalysisError(file: Pick<IGnosisFile, 'type' | 'mime' | 'size'>): string | undefined {
  if (file.type !== 'VIDEO') return;
  if (!['video/mp4', 'video/webm'].includes(file.mime)) return 'Для анализа выберите видео MP4 или WebM.';
  if (
    typeof file.size !== 'number' ||
    !Number.isFinite(file.size) ||
    file.size <= 0 ||
    file.size > 12 * 1024 * 1024
  )
    return 'Для анализа выберите видео размером до 12 МБ.';
}

export function videoAnalysisTool(model: IModelDescription): IToolConnection {
  return {
    uid: 'VIDEO_RECOGNITION',
    settings: { model: model.reference, options: { maxTokens: 4096 }, isLockSelection: true },
  };
}

export const promptSystem =
  'Подготавливай текстовые промпты по приложенным материалам и настройкам последнего запроса. Видео анализируй только через VIDEO_RECOGNITION, каждое не более одного раза за запрос. Не генерируй медиа. При ошибке анализа не повторяй платный вызов, не выдумывай содержимое материалов, верни blocked с пояснением. Возвращай запрошенный формат ответа.';
