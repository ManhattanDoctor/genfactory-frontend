import type { IConversation } from './types';

/** Use the saved workspace, not the kind of the latest billed tool. */
export function conversationUrl(c: IConversation): string {
  const tags = c.tags || [];
  const query = `conversation=${c.id}`;
  if (tags.includes('audio')) return `/audio?mode=${tags.includes('stt') ? 'stt' : 'tts'}&${query}`;
  if (tags.includes('prompt')) return `/prompt?${query}`;
  if (tags.includes('script')) return `/script?${query}`;
  if (tags.includes('chat')) return `/agent?${query}${c.options.tools?.length ? '&studio=advanced' : ''}`;
  if (tags.includes('image')) return `/image?${query}${tags.includes('banana') ? '&studio=banana' : ''}`;
  if (tags.includes('video')) return `/video?${query}${tags.includes('seedance') ? '&studio=seedance' : ''}`;
  return `/chat?${query}`;
}
