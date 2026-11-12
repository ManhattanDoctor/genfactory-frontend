import type { QueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { IConversation } from '../../lib/types';
import { studioHistoryFiles, type StudioHistoryFile } from './studioHistory';

export function cachedStudioHistoryFiles(
  client: QueryClient,
  conversation: IConversation,
  session: string,
): Promise<Array<StudioHistoryFile>> {
  return studioHistoryFiles(conversation, (page) =>
    client.fetchQuery({
      // Shared with ContentThread; socket and send invalidations also cover this cache.
      queryKey: ['messages', conversation.userId, conversation.id, page],
      staleTime: 30_000,
      queryFn: ({ signal }) => api.messages(conversation.id, page, signal, session),
    }),
  );
}
