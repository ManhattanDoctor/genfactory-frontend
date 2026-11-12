import type { ITaskExecution } from '../../lib/types';

export function taskView(item: ITaskExecution): { path: string; title: string; type: string; mime: string } {
  if (item.model.includes('IMAGE'))
    return { path: '/image', title: 'Создаём изображение…', type: 'IMAGE', mime: 'image/png' };
  if (item.model.includes('VIDEO'))
    return { path: '/video', title: 'Создаём видео…', type: 'VIDEO', mime: 'video/mp4' };
  if (item.model.endsWith('_TTS'))
    return { path: '/audio', title: 'Создаём аудио…', type: 'AUDIO', mime: 'audio/mpeg' };
  if (item.model.endsWith('_STT'))
    return { path: '/audio', title: 'Распознаём аудио…', type: 'DOCUMENT', mime: 'text/plain' };
  return { path: '/text', title: 'Создаём текст…', type: 'DOCUMENT', mime: 'text/plain' };
}

/** The existing conversation card represents its active children until the parent finishes. */
export function visibleTasks(
  items: ITaskExecution[],
  localSessions: Array<string | undefined>,
): ITaskExecution[] {
  const ids = new Set(items.map((item) => item.id));
  const sessions = new Set(localSessions.filter(Boolean));
  return items.filter(
    (item) =>
      !item.model.includes('CONVERSATION') &&
      (!item.parentTaskId || !ids.has(item.parentTaskId)) &&
      (!item.session || !sessions.has(item.session)),
  );
}
