import type { IConversation, IConversationMessage, IPagination } from '../../lib/types';

export interface StudioHistoryFile {
  id: number;
  name: string;
  type: string;
  role: 'USER' | 'ASSISTANT';
  messageId: number;
}

/** Metadata only: keep the agent aware of files without reattaching them to the composer. */
export async function studioHistoryFiles(
  conversation: IConversation,
  readPage: (page: number) => Promise<IPagination<IConversationMessage>>,
): Promise<StudioHistoryFile[]> {
  if (conversation.isConsiderHistory === false) return [];
  // The next user message itself occupies one slot in the backend history window.
  const limit = Math.max(0, Math.min(256, (conversation.history ?? 32) - 1));
  if (!limit) return [];
  const reset = conversation.historyResetDate ? Date.parse(conversation.historyResetDate) : 0;
  const messages: IConversationMessage[] = [];
  for (let page = 0; messages.length < limit; page++) {
    const value = await readPage(page);
    // Match backend history: commands do not consume the message window.
    messages.push(
      ...value.items.filter(
        (message) => message.role !== 'COMMAND' && (!reset || Date.parse(message.createdDate) > reset),
      ),
    );
    // Pages are ordered newest first, so older pages cannot cross back over a reset.
    if (
      !value.items.length ||
      page + 1 >= value.pages ||
      (reset && value.items.some((message) => Date.parse(message.createdDate) <= reset))
    )
      break;
  }
  const files = new Map<number, StudioHistoryFile>();
  for (const message of messages.slice(0, limit)) {
    if (!['USER', 'ASSISTANT'].includes(message.role)) continue;
    if (reset && Date.parse(message.createdDate) <= reset) continue;
    for (const file of message.files || []) {
      if (
        file.userId !== conversation.userId ||
        !Number.isSafeInteger(file.id) ||
        file.id <= 0 ||
        files.has(file.id)
      )
        continue;
      if (!['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'].includes(file.type)) continue;
      files.set(file.id, {
        id: file.id,
        name: file.name.slice(0, 200),
        type: file.type,
        role: message.role as 'USER' | 'ASSISTANT',
        messageId: message.id,
      });
      if (files.size >= 128) return [...files.values()];
    }
  }
  return [...files.values()];
}
