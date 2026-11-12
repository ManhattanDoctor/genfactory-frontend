import type { ReactElement } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TransportSocket } from '@ts-core/socket-client';
import { taskConversationId } from './refreshTargets';
import { disposeRefresh, scheduleRefresh } from './queryRefresh';
import type { ILogger } from '@ts-core/common';
import { useAuth } from '../auth/AuthProvider';
import type { ITaskExecution, ITaskFinished } from '../../lib/types';
import { apiErrorMessage } from '../../lib/errorMessages';

interface IRealtimeEvent {
  name?: string;
  data?: {
    id?: number | string;
    session?: string;
    item?: Partial<ITaskExecution> & { status?: string };
    result?: string;
    fileIds?: number[];
    error?: ITaskFinished['error'] & { status?: number };
  };
}

function isTaskExecution(item: Partial<ITaskExecution> | undefined): item is ITaskExecution {
  return (
    typeof item?.id === 'string' && typeof item.model === 'string' && typeof item.createdDate === 'string'
  );
}

interface IRealtime {
  connected: boolean;
  join: (room: string) => () => void;
}
const Context = createContext<IRealtime>({ connected: false, join: () => () => {} });
const modelResources = [
  'models',
  'conversation-models',
  'video-analysis-models',
  'content-studio-models',
  'generation-models',
  'audio-models',
  'audio-tools',
  'retained-model',
];
const resources = [
  ...modelResources,
  'account',
  'conversation',
  'conversations',
  'messages',
  'agent-messages',
  'active-jobs',
  'active-tasks',
  'files',
  'artifacts',
  'file-preview',
  'transactions',
  'transaction-results',
  'conversation-progress',
];

export function RealtimeProvider({ children }: { children: ReactNode }): ReactElement {
  const { user, session } = useAuth();
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<TransportSocket | null>(null);
  const rooms = useRef(new Map<string, number>());
  const roomCommand = useCallback((name: string, action: 'ADD' | 'REMOVE'): void => {
    const transport = socketRef.current;
    if (!transport) return;
    void (action === 'ADD' ? transport.roomAdd(name) : transport.roomRemove(name)).catch(() =>
      setConnected(false),
    );
  }, []);
  const join = useCallback(
    (room: string): (() => void) => {
      rooms.current.set(room, (rooms.current.get(room) || 0) + 1);
      if (socketRef.current && rooms.current.get(room) === 1) roomCommand(room, 'ADD');
      return () => {
        const remaining = (rooms.current.get(room) || 1) - 1;
        if (remaining) rooms.current.set(room, remaining);
        else {
          rooms.current.delete(room);
          if (socketRef.current) roomCommand(room, 'REMOVE');
        }
      };
    },
    [roomCommand],
  );

  useEffect(() => {
    setConnected(false);
    if (!user || !session) return;
    let alive = true;
    let hasConnected = false;
    const refresh = (keys = resources, conversationId?: unknown, fileId?: unknown): void => {
      scheduleRefresh(client, user.id, session, keys, conversationId, fileId);
    };
    let dispose = () => {};
    const connect = async (): Promise<void> => {
      const { TransportSocket, TransportSocketClient } = await import('./socketTransport');
      if (!alive) return;
      const apiBase = new URL(import.meta.env.VITE_API_BASE || '/api', location.origin);
      const logger: ILogger = {
        log: () => {},
        warn: (message) =>
          console.warn(
            '[Realtime]',
            String(message?.message || message).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'),
          ),
        error: (message) =>
          console.error(
            '[Realtime]',
            String(message?.message || message).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'),
          ),
        debug: () => {},
        verbose: () => {},
      };
      const connection = new TransportSocketClient(logger, {
        url: apiBase.origin,
        namespace: 'gnosisai',
        auth: { token: session },
        path: '/socket.io',
        transports: ['websocket'],
        reconnectionAttempts: 100,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });
      const transport = new TransportSocket(
        logger,
        { timeout: 10000, isRestoreRoomsOnConnect: true },
        connection,
      );
      socketRef.current = transport;
      rooms.current.forEach((_, room) => roomCommand(room, 'ADD'));
      const subscriptions = [
        connection.connected.subscribe(() => {
          if (alive) {
            setConnected(true);
            if (hasConnected) refresh();
            hasConnected = true;
          }
        }),
        connection.disconnected.subscribe(() => {
          if (alive) setConnected(false);
        }),
        connection.connectedError.subscribe(() => {
          if (alive) setConnected(false);
        }),
        connection.reconnectedFailed.subscribe(() => {
          if (alive) setConnected(false);
        }),
      ];
      const events = [
        'TaskProgressedEvent',
        'TaskStartedEvent',
        'TaskFinishedEvent',
        'ConversationAddedEvent',
        'ConversationChangedEvent',
        'ConversationRemovedEvent',
        'ConversationErroredEvent',
        'ConversationClearedEvent',
        'ConversationMessageAddedEvent',
        'ConversationMessageRemovedEvent',
        'FileAddedEvent',
        'FileChangedEvent',
        'FileRemovedEvent',
        'FilePreviewChangedEvent',
        'CoinBalanceChangedEvent',
        'AiModelChangedEvent',
      ];
      const receive = (event: IRealtimeEvent): void => {
        if (!alive) return;
        const { name = '', data = {} } = event || {};
        if (
          name === 'ConversationErroredEvent' &&
          typeof data.id === 'number' &&
          Number.isSafeInteger(data.id) &&
          data.id > 0
        ) {
          client.setQueryData(
            ['conversation-error', user.id, data.id],
            apiErrorMessage(data.error, data.error?.status || 500),
          );
        }
        if (
          (name === 'ConversationChangedEvent' && ['LOADING', 'LOADED'].includes(data.item?.status || '')) ||
          name === 'ConversationClearedEvent' ||
          name === 'ConversationRemovedEvent'
        ) {
          client.setQueryData(['conversation-error', user.id, data.id], '');
        }
        const progressId = name === 'TaskProgressedEvent' ? taskConversationId(data.session) : undefined;
        if (progressId) {
          client.setQueryData(['conversation-progress', user.id, progressId], {
            value: data,
            at: Date.now(),
          });
          return;
        }
        const item = data.item;
        if (name === 'TaskStartedEvent' && isTaskExecution(item) && item.id === data.id) {
          client.setQueryData<ITaskExecution[]>(['active-tasks', user.id], (previous) => [
            ...(previous || []).filter((previousItem) => previousItem.id !== data.id),
            item,
          ]);
        }
        if (name === 'TaskFinishedEvent' && typeof data.id === 'string') {
          client.setQueryData<ITaskExecution[]>(['active-tasks', user.id], (previous) =>
            (previous || []).filter((item) => item.id !== data.id),
          );
          const result = data.result;
          if (
            isTaskExecution(item) &&
            item.id === data.id &&
            (result === 'COMPLETED' || result === 'FAILED' || result === 'CANCELLED')
          ) {
            const notice: ITaskFinished = {
              id: data.id,
              item,
              result,
              fileIds: data.fileIds,
              error: data.error,
            };
            client.setQueryData<ITaskFinished[]>(['task-notices', user.id], (previous) =>
              [notice, ...(previous || []).filter((previousItem) => previousItem.id !== notice.id)].slice(
                0,
                8,
              ),
            );
          }
        }
        if (name === 'AiModelChangedEvent') refresh(modelResources);
        else if (name.startsWith('Conversation'))
          refresh(['conversation', 'conversations', 'messages', 'agent-messages', 'active-jobs'], data.id);
        else if (name.startsWith('File'))
          refresh(['files', 'file-preview', 'conversations'], undefined, data.id);
        else if (name === 'CoinBalanceChangedEvent') refresh(['account', 'transactions']);
        else if (name === 'TaskStartedEvent' || name === 'TaskFinishedEvent') {
          const conversationId = taskConversationId(data.session ?? data.item?.session);
          refresh(
            [
              ...(conversationId
                ? ['conversation', 'messages', 'agent-messages', 'conversation-progress']
                : []),
              'conversations',
              'active-jobs',
              'active-tasks',
              ...(name === 'TaskFinishedEvent'
                ? ['account', 'transactions', 'transaction-results', 'files']
                : []),
            ],
            conversationId,
          );
        }
      };
      subscriptions.push(
        ...events.map((name) => transport.getDispatcher<IRealtimeEvent>(name).subscribe(receive)),
      );
      void transport.connect().catch(() => {
        if (alive) setConnected(false);
      });
      dispose = () => {
        socketRef.current = null;
        subscriptions.forEach((subscription) => subscription.unsubscribe());
        connection.disconnect();
        transport.destroy();
        connection.destroy();
      };
    };
    void connect().catch(() => {
      if (alive) setConnected(false);
    });
    return () => {
      alive = false;
      disposeRefresh(client, session);
      dispose();
    };
  }, [session, user?.id, client, roomCommand]);

  useEffect(() => {
    if (connected || !user || !session) return;
    // One fallback timer for the application, only while the socket is unavailable.
    const timer = setInterval(() => {
      scheduleRefresh(
        client,
        user.id,
        session,
        resources.filter((key) => !modelResources.includes(key)),
      );
    }, 15000);
    return () => clearInterval(timer);
  }, [connected, user?.id, session, client]);

  return <Context.Provider value={{ connected, join }}>{children}</Context.Provider>;
}
export function useRealtime(): IRealtime {
  return useContext(Context);
}
export function useConversationRoom(id?: number): void {
  const { join } = useRealtime();
  useEffect(() => (id ? join(`conversation${id}`) : undefined), [id, join]);
}
