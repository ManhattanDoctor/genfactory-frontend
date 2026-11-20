import { api } from '../../lib/api';
import type { IConversation, IMessageCreate, IToolConnection } from '../../lib/types';
import { studioSystem } from './studioPrompt';

export function prepareStudioConversation(
  conversation: IConversation,
  body: IMessageCreate,
  tools: IToolConnection[],
  session: string,
): Promise<IConversation> {
  return api.editConversation(
    conversation,
    {
      system: studioSystem(conversation.system),
      ...(body.settings.isToolsDisabled ? {} : { options: { ...conversation.options, tools } }),
    },
    session,
  );
}
