import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { useConversationRoom, useRealtime } from '../realtime/RealtimeProvider';
import type { IConversation } from '../../lib/types';
import { readTools } from './progress';

export function useConversationProgress(conversation: IConversation) {
  const { session } = useAuth();
  const { connected } = useRealtime();
  useConversationRoom(conversation.id);
  const running = conversation.status === 'LOADING';
  const progress = useQuery({
    queryKey: ['conversation-progress', conversation.userId, conversation.id],
    enabled: running && !!session,
    queryFn: async ({ signal }) => ({
      value: await api.progress(`conversation${conversation.id}`, signal),
      at: Date.now(),
    }),
    retry: false,
  });
  return {
    tools: running ? readTools(progress.data?.value?.data?.tools) : [],
    unavailable: running && !!progress.error && !connected,
  };
}
