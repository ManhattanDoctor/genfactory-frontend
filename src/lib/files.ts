import { api, request } from './api';
import type { IGnosisFile, IPagination } from './types';
export const directoryPath = (file: IGnosisFile) => [file.directory, file.uid].filter(Boolean).join('/');
export function mediaType(file: IGnosisFile): string {
  if (file.type !== 'LINK') return file.type;
  if (file.mime?.startsWith('image/')) return 'IMAGE';
  if (file.mime?.startsWith('video/')) return 'VIDEO';
  if (file.mime?.startsWith('audio/')) return 'AUDIO';
  return 'DOCUMENT';
}
// Resolve before using a reference: generation receives the original ID, never a broken alias.
export async function resolveFile(file: IGnosisFile): Promise<IGnosisFile> {
  const visited = new Set<number>();
  while (file.type === 'LINK') {
    if (!file.linkTo || visited.has(file.id) || visited.size >= 16)
      throw new Error('Ссылка на файл недоступна.');
    visited.add(file.id);
    file = await api.file(file.linkTo);
  }
  if (file.type === 'DIRECTORY') throw new Error('Выберите файл, а не папку.');
  return file;
}

export async function folderTrail(file: IGnosisFile): Promise<IGnosisFile[]> {
  const uids = (file.directory || '').split('/').filter(Boolean);
  const ancestors = await Promise.all(
    uids.map(async (uid) => {
      const page = await request<IPagination<IGnosisFile>>(
        `/file?${new URLSearchParams({ pageSize: '1', pageIndex: '0', conditions: JSON.stringify({ uid, type: 'DIRECTORY' }) })}`,
      );
      if (!page.items[0]) throw new Error('Родительская папка недоступна. Обновите библиотеку.');
      return page.items[0];
    }),
  );
  return [...ancestors, file];
}
