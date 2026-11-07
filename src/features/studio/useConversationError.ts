import { useQuery } from '@tanstack/react-query';
import type { IConversation } from '../../lib/types';
import { apiErrorMessage } from '../../lib/errorMessages';

/** The saved error is authoritative; keep socket-only support for older API versions. */
export function useConversationError(conversation?: IConversation) {
  const error = useQuery<string>({
    queryKey: ['conversation-error', conversation?.userId, conversation?.id],
    queryFn: async () => '',
    enabled: false,
  });
  if (conversation?.status !== 'ERROR') return undefined;
  return conversation.error ? apiErrorMessage(conversation.error, 400) : error.data;
}
