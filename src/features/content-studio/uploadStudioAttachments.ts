import { api, type IUploadProgress } from '../../lib/api';
import type { IGnosisFile } from '../../lib/types';
import type { IAttachment } from './studioTypes';

interface UploadOptions {
  attachments: IAttachment[];
  session: string;
  userId: number;
  isCurrent: () => boolean;
  onProgress: (progress: IUploadProgress) => void;
  onSaved: (id: string, file: IGnosisFile) => void;
}
/** Keep frame order and reuse validated saved files, without uploading them again. */
export async function uploadStudioAttachments({
  attachments,
  session,
  userId,
  isCurrent,
  onProgress,
  onSaved,
}: UploadOptions): Promise<IGnosisFile[] | undefined> {
  const savedFiles: IGnosisFile[] = [];
  const ordered = [...attachments].sort(
    (a, b) =>
      (a.slot === 'start' ? -1 : a.slot === 'end' ? 1 : 0) -
      (b.slot === 'start' ? -1 : b.slot === 'end' ? 1 : 0),
  );
  for (const attachment of ordered) {
    let saved = attachment.saved;
    if (saved) {
      saved = await api.file(saved.id, session);
      if (saved.userId !== userId) throw new Error('Материал недоступен этому аккаунту.');
    } else {
      if (!attachment.file)
        throw new Error('Кадр из галереи пока не подключён как референс. Загрузите изображение файлом.');
      saved = await api.upload(attachment.file, session, undefined, (progress) => {
        if (isCurrent()) onProgress(progress);
      });
      if (!isCurrent()) return;
      onSaved(attachment.id, saved);
    }
    if (!isCurrent()) return;
    savedFiles.push(saved);
  }
  return savedFiles;
}
