import { api } from '../../lib/api';
import type { IConversation, IGnosisFile } from '../../lib/types';

// Match the backend cover selection: latest assistant image/video, then greatest file id.
export async function historyResult(
  conversation: IConversation,
  sid: string,
  signal: AbortSignal,
): Promise<IGnosisFile> {
  if (conversation.previewMode === 'MANUAL' && conversation.previewFileId) {
    const file = await api.file(conversation.previewFileId, sid);
    if (file.userId !== conversation.userId) throw new Error('Файл недоступен.');
    return file;
  }
  for (let page = 0; ; page++) {
    signal.throwIfAborted();
    const messages = await api.messages(conversation.id, page, signal, sid);
    for (const message of messages.items) {
      if (message.role !== 'ASSISTANT') continue;
      const file = (message.files || [])
        .filter((file) => file.userId === conversation.userId && ['IMAGE', 'VIDEO'].includes(file.type))
        .sort((a, b) => b.id - a.id)[0];
      if (file) return file;
    }
    if (page + 1 >= messages.pages || !messages.items.length) break;
  }
  throw new Error('В этой беседе пока нет готового изображения или видео.');
}
