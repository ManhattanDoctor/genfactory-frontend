import { useSyncExternalStore } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Generation, ImageResult, MediaKind, ModelDescription, TaskRequest } from '../../lib/types';
const snapshots = new Map<number, Generation[]>();
const listeners = new Set<() => void>();
const busy = new Set<number>();
const pendingImages = new Map<string, ImageResult[]>();
const EMPTY: Generation[] = [];
export function recoverJobs(jobs: Generation[]): Generation[] {
  return jobs.map((j) =>
    ['running', 'saving'].includes(j.status)
      ? {
          ...j,
          status: 'unknown',
          error:
            'Соединение прервалось. Проверьте библиотеку перед новым запуском: генерация могла завершиться.',
        }
      : j,
  );
}
function key(userId: number) {
  return `genfactory.jobs.v1.${userId}`;
}
function get(userId: number): Generation[] {
  if (!snapshots.has(userId)) {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(key(userId)) || '[]');
      snapshots.set(
        userId,
        recoverJobs(
          Array.isArray(stored)
            ? stored.filter((j) => j.userId === userId && j.request && Array.isArray(j.files)).slice(0, 100)
            : [],
        ),
      );
    } catch {
      snapshots.set(userId, []);
    }
  }
  return snapshots.get(userId)!;
}
function update(userId: number, id: string, patch: Partial<Generation>) {
  const next = get(userId).map((j) => (j.id === id ? { ...j, ...patch } : j));
  snapshots.set(userId, next);
  try {
    localStorage.setItem(key(userId), JSON.stringify(next.slice(0, 100)));
  } catch {
    /* Current tab retains results when storage is full. */
  }
  listeners.forEach((l) => l());
}
function add(job: Generation) {
  snapshots.set(job.userId, [job, ...get(job.userId)].slice(0, 100));
  update(job.userId, job.id, {});
}
export function useGenerations(userId?: number) {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    () => (userId === undefined ? EMPTY : get(userId)),
  );
}
export function canRetrySave(id: string) {
  return pendingImages.has(id);
}
async function saveImages(job: Generation, sid: string) {
  const images = pendingImages.get(job.id) || [];
  const files = [...(get(job.userId).find((j) => j.id === job.id)?.files || [])];
  const failed: ImageResult[] = [];
  for (let i = 0; i < images.length; i++) {
    try {
      files.push(
        await api.saveImage(
          images[i].source,
          images[i].mime,
          `Genfactory ${job.createdAt.slice(0, 10)} ${files.length + 1}`,
          job.id,
          sid,
        ),
      );
    } catch {
      failed.push(images[i]);
    }
  }
  if (failed.length) pendingImages.set(job.id, failed);
  else pendingImages.delete(job.id);
  update(job.userId, job.id, {
    files,
    status: failed.length ? 'save_failed' : 'completed',
    error: failed.length
      ? 'Генерация готова, но не все файлы удалось сохранить. Повторите сохранение, не запуская генерацию заново.'
      : undefined,
  });
}
export async function retrySave(job: Generation, sid: string) {
  if (busy.has(job.userId) || !pendingImages.has(job.id)) return;
  busy.add(job.userId);
  update(job.userId, job.id, { status: 'saving' });
  try {
    await saveImages(job, sid);
  } finally {
    busy.delete(job.userId);
    update(job.userId, job.id, {});
    window.dispatchEvent(new Event('genfactory:generation-finished'));
  }
}
export function activeForUser(userId: number) {
  return busy.has(userId);
}
export async function generate(
  userId: number,
  sid: string,
  kind: MediaKind,
  model: ModelDescription,
  request: TaskRequest,
): Promise<void> {
  if (busy.has(userId)) throw new Error('Дождитесь завершения текущей генерации.');
  busy.add(userId);
  const job: Generation = {
    id: request.task.session,
    userId,
    kind,
    modelName: model.name,
    request,
    createdAt: new Date().toISOString(),
    status: 'running',
    files: [],
  };
  add(job);
  try {
    const response = await api.generate(request, sid);
    update(userId, job.id, { cost: response.cost, status: 'saving' });
    if (Array.isArray(response.result)) {
      if (!response.result.length) throw new Error('Empty generation response');
      pendingImages.set(job.id, response.result);
      await saveImages(job, sid);
    } else {
      try {
        const file = await api.file(response.result.fileId, sid);
        update(userId, job.id, { files: [file], status: 'completed' });
      } catch {
        update(userId, job.id, {
          status: 'unknown',
          error: `Видео готово (файл ${response.result.fileId}), но его не удалось загрузить. Откройте библиотеку.`,
        });
      }
    }
  } catch (e) {
    const definite = e instanceof ApiError && e.status >= 400 && e.status < 500;
    update(userId, job.id, {
      status: definite ? 'failed' : 'unknown',
      error: definite
        ? e.message
        : 'Ответ не получен. Генерация могла продолжиться на сервере. Проверьте библиотеку; повторный запуск будет новой платной операцией.',
    });
  } finally {
    busy.delete(userId);
    update(userId, job.id, {});
    window.dispatchEvent(new Event('genfactory:generation-finished'));
  }
}
export function updateCost(job: Generation, cost: Generation['cost']) {
  update(job.userId, job.id, { cost });
}
