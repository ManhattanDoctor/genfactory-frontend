import { conversationQueue, type ConversationQueue } from './ConversationQueue';
import { scheduleRefresh } from '../realtime/queryRefresh';
import type { StudioHistoryFile } from './studioHistory';
import { cachedStudioHistoryFiles } from './historyCache';
import { studioSystem } from './studioPrompt';
import { prepareStudioConversation } from './prepareStudioConversation';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  useMutation,
  useIsMutating,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { api, getSession, RequestOutcomeError } from '../../lib/api';
import type {
  IConversation,
  IConversationMessage,
  IPagination,
  IModelDescription,
  IMessageCreate,
  IToolConnection,
} from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';

export interface ContentConversation {
  thread: {
    page: number;
    setPage: (page: number) => void;
    messages: UseQueryResult<IPagination<IConversationMessage>, Error>;
  };
  historyFiles: () => Promise<Array<StudioHistoryFile>>;
  id: number | undefined;
  conversation: IConversation | undefined;
  isExecutionError: boolean;
  confirmSubmission: () => void;
  error: string;
  setError: (message: string, isExecution?: boolean) => void;
  busy: boolean;
  queue?: ConversationQueue;
  scope: object;
  submit: (
    body: IMessageCreate,
    title: string,
    tools: Array<IToolConnection>,
    agent?: IModelDescription,
    onCreated?: (id: number) => void,
  ) => Promise<boolean>;
  agents: Array<IModelDescription>;
  latestRequest: number;
}

export function useContentConversation(): ContentConversation {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const raw = params.get('conversation');
  const id = raw && /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : undefined;
  const client = useQueryClient();
  const [preparing, setPreparing] = useState<object>();
  const lock = useRef<object | undefined>(undefined);
  const route = `${auth.session}:${location.key}:${raw}`;
  const scope = useRef({ route, token: {} });
  const pendingCreation = useRef<{ from: string; session: string; id: number } | undefined>(undefined);
  if (scope.current.route !== route) {
    const pending = pendingCreation.current;
    const ownNavigation =
      pending?.from === scope.current.route && pending.session === auth.session && pending.id === id;
    if (!ownNavigation) scope.current.token = {};
    scope.current.route = route;
    pendingCreation.current = undefined;
  }
  // Own creation keeps its token through intermediate renders and the new route.
  // Any other navigation, including the same URL with another history key, cancels it.
  const active = scope.current.token;
  const [scopedFailure, setFailure] = useState<{
    scope: object;
    message: string;
    isExecution: boolean;
    unconfirmed: boolean;
  }>();
  const failure = scopedFailure?.scope === active ? scopedFailure : undefined;
  const submissionConfirmed = useRef(false);
  function setError(message: string, isExecution = false, unconfirmed = false): void {
    setFailure(message ? { scope: active, message, isExecution, unconfirmed } : undefined);
  }
  function confirmSubmission(): void {
    submissionConfirmed.current = true;
    setFailure((value) => (value?.scope === active && value.unconfirmed ? undefined : value));
  }

  useEffect(
    () => () => {
      scope.current.token = {};
      pendingCreation.current = undefined;
    },
    [],
  );
  const detail = useQuery({
    queryKey: ['conversation', auth.user?.id, id],
    enabled: !!auth.user && !!id,
    retry: false,
    queryFn: ({ signal }) => api.conversation(id!, signal),
  });
  const [pagination, setPagination] = useState({ scope: active, page: 0 });
  const page = pagination.scope === active ? pagination.page : 0;
  const messages = useQuery({
    queryKey: ['messages', auth.user?.id, id, page],
    enabled: !!auth.user && !!id,
    queryFn: ({ signal }) => api.messages(id!, page, signal),
  });
  const agents = useQuery({
    queryKey: ['conversation-models', auth.user?.id],
    enabled: !!auth.user,
    staleTime: 300000,
    queryFn: ({ signal }) => api.conversationModels(signal),
  });
  const send = useMutation({
    mutationKey: ['send-message', auth.user?.id],
    retry: false,
    mutationFn: ({ id, body, sid }: { id: number; body: IMessageCreate; sid: string }) =>
      api.sendMessage(id, body, sid),
    onSettled: (_data, failure, variables) => {
      if (getSession() !== variables.sid) return;
      if (failure && auth.user)
        conversationQueue(client, auth.user.id, variables.id, variables.sid).pauseAfterFailure();
      if (!auth.user) return;
      scheduleRefresh(
        client,
        auth.user.id,
        variables.sid,
        ['conversation', 'messages', 'conversations', 'files', 'account', 'active-jobs', 'active-tasks'],
        variables.id,
      );
    },
  });
  const pending = useIsMutating({
    mutationKey: ['send-message', auth.user?.id],
    predicate: (mutation) => {
      const variables = mutation.state.variables as { id?: number; sid?: string } | undefined;
      return !!id && variables?.id === id && variables.sid === auth.session;
    },
  });
  const busy = preparing === active || pending > 0 || detail.data?.status === 'LOADING';
  async function submit(
    body: IMessageCreate,
    title: string,
    tools: IToolConnection[],
    agent?: IModelDescription,
    onCreated?: (id: number) => void,
  ): Promise<boolean> {
    if (!auth.user || !auth.session || lock.current === active || busy || scope.current.token !== active)
      return false;
    if (raw && !detail.data) {
      setError('Дождитесь загрузки беседы.');
      return false;
    }
    if (!agent && !detail.data) {
      setError('Не удалось загрузить модель ассистента.');
      return false;
    }
    submissionConfirmed.current = false;
    lock.current = active;
    setPreparing(active);
    setError('');
    const sid = auth.session;
    const userId = auth.user.id;
    const currentScope = active;
    const current = () => getSession() === sid && scope.current.token === currentScope;
    let sent = false;
    try {
      let conversation = detail.data;
      if (conversation) {
        const fresh = await api.conversation(conversation.id, undefined, sid);
        if (!current()) return false;
        if (fresh.userId !== userId || fresh.status === 'LOADING')
          throw new Error('Беседа недоступна или уже выполняет запрос.');
        conversation = await prepareStudioConversation(fresh, body, tools, sid);
      } else {
        conversation = await api.createConversation(
          {
            name: title.trim().slice(0, 64) || 'Студия контента',
            model: agent!.reference.provider,
            options: { model: agent!.reference.model, tools },
            tags: ['genfactory', 'content-studio'],
            history: 32,
            isConsiderHistory: true,
            system: studioSystem(),
          },
          sid,
        );
      }
      if (!current()) return false;
      client.setQueryData(['conversation', userId, conversation.id], conversation);
      if (!id) {
        onCreated?.(conversation.id);
        pendingCreation.current = { from: route, session: sid, id: conversation.id };
        setParams({ conversation: String(conversation.id) }, { replace: true });
      }
      sent = true;
      await send.mutateAsync({ id: conversation.id, body, sid });
      return current();
    } catch (e) {
      if (current()) {
        const message = e instanceof Error ? e.message : 'Запрос не выполнен.';
        const unconfirmed = sent && e instanceof RequestOutcomeError;
        if (!unconfirmed || !submissionConfirmed.current) setError(message, sent, unconfirmed);
      }
      return false;
    } finally {
      if (lock.current === currentScope) lock.current = undefined;
      setPreparing((value) => (value === currentScope ? undefined : value));
    }
  }
  async function historyFiles(): Promise<Array<StudioHistoryFile>> {
    const conversation = detail.data;
    if (!conversation || !auth.user || !auth.session || conversation.userId !== auth.user.id) return [];
    const sid = auth.session;
    return cachedStudioHistoryFiles(client, conversation, sid);
  }
  return {
    thread: { page, setPage: (page) => setPagination({ scope: active, page }), messages },
    historyFiles,
    confirmSubmission,
    scope: active,
    id,
    conversation: detail.data,
    isExecutionError: !!failure?.isExecution,
    error: failure?.message || detail.error?.message || (raw && !id ? 'Некорректный адрес беседы.' : ''),
    setError,
    busy,
    queue:
      id && auth.user && auth.session ? conversationQueue(client, auth.user.id, id, auth.session) : undefined,
    submit,
    agents: agents.data || [],
    latestRequest: send.submittedAt,
  };
}
