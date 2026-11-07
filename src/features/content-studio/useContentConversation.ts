import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getSession } from '../../lib/api';
import type { IModelDescription, IMessageCreate, IToolConnection } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';
import { videoModerationError } from '../../lib/errorMessages';

export function useContentConversation() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const raw = params.get('conversation');
  const id = raw && /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : undefined;
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const lock = useRef(false);
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
    queryFn: async ({ signal }) => {
      const value = await api.conversation(id!, signal);
      if (value.userId !== auth.user!.id) throw new Error('Беседа недоступна этому аккаунту.');
      return value;
    },
  });
  const agents = useQuery({
    queryKey: ['conversation-models', auth.user?.id],
    enabled: !!auth.user,
    staleTime: 300000,
    queryFn: ({ signal }) => api.catalog('OPEN_AI_CONVERSATION', signal),
  });
  const send = useMutation({
    mutationKey: ['send-message', auth.user?.id],
    retry: false,
    mutationFn: ({ id, body, sid }: { id: number; body: IMessageCreate; sid: string }) =>
      api.sendMessage(id, body, sid),
    onSettled: (_data, failure, variables) => {
      if (failure && getSession() === variables.sid)
        setError(
          failure.message === videoModerationError
            ? failure.message
            : `${failure.message} Проверьте сообщения перед повторной отправкой: запрос мог быть выполнен. Автоматического повтора нет.`,
        );
      for (const key of ['conversation', 'messages', 'conversations', 'account'])
        void client.invalidateQueries({ queryKey: [key] });
      window.dispatchEvent(new Event('genfactory:generation-finished'));
    },
  });
  const busy = preparing || send.isPending || detail.data?.status === 'LOADING';
  async function submit(
    body: IMessageCreate,
    title: string,
    tools: IToolConnection[],
    agent?: IModelDescription,
    onCreated?: (id: number) => void,
  ) {
    if (!auth.user || !auth.session || lock.current || busy || scope.current.token !== active) return false;
    if (raw && !detail.data) {
      setError('Дождитесь загрузки беседы.');
      return false;
    }
    if (!agent && !detail.data) {
      setError('Не удалось загрузить модель ассистента.');
      return false;
    }
    lock.current = true;
    setPreparing(true);
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
        // Discussion disables tools for this request without deleting saved connections.
        conversation = body.settings.isToolsDisabled
          ? fresh
          : await api.editConversation(fresh, { options: { ...fresh.options, tools } }, sid);
      } else {
        conversation = await api.createConversation(
          {
            name: title.trim().slice(0, 64) || 'Студия контента',
            model: agent!.reference.provider,
            options: { model: agent!.reference.model, tools },
            tags: ['genfactory', 'content-studio'],
            history: 32,
            isConsiderHistory: true,
            system:
              'Ты — творческий ассистент Genfactory. Сохраняй исходный бриф и учитывай историю проекта. Выполняй инструкции последнего сообщения. При подготовке сценария уточняй существенные детали и предлагай текст отдельно от брифа. При генерации используй выбранный инструмент и его настройки, точные fileIds в указанном порядке. Без явного указания не меняй модель и параметры. Создавай один результат. Не повторяй платный вызов после ошибки. Не выдумывай файлы и ссылки. Отвечай на языке пользователя.',
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
        setError(
          `${message}${sent && message !== videoModerationError ? ' Проверьте сообщения перед повторной отправкой: запрос мог быть выполнен. Автоматического повтора нет.' : ''}`,
        );
      }
      return false;
    } finally {
      lock.current = false;
      if (getSession() === sid) setPreparing(false);
    }
  }
  return {
    id,
    conversation: detail.data,
    error: error || detail.error?.message || (raw && !id ? 'Некорректный адрес беседы.' : ''),
    setError,
    busy,
    submit,
    agents: agents.data || [],
    latestRequest: send.submittedAt,
  };
}
