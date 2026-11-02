import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TransportSocket, TransportSocketClient } from '@ts-core/socket-client';
import type { ILogger } from '@ts-core/common';
import { useAuth } from '../auth/AuthProvider';

interface IRealtime {
  connected: boolean;
  join: (room: string) => () => void;
}
const Context = createContext<IRealtime>({ connected: false, join: () => () => {} });
const resources = [
  'account',
  'conversation',
  'conversations',
  'messages',
  'active-jobs',
  'files',
  'file-preview',
  'transactions',
  'conversation-progress',
];

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth();
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<TransportSocket | null>(null);
  const rooms = useRef(new Map<string, number>());
  const roomCommand = useCallback((name: string, action: 'ADD' | 'REMOVE') => {
    const transport = socketRef.current;
    if (!transport) return;
    void (action === 'ADD' ? transport.roomAdd(name) : transport.roomRemove(name)).catch(() =>
      setConnected(false),
    );
  }, []);
  const join = useCallback(
    (room: string) => {
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const dirty = new Set<string>();
    const refresh = (keys = resources) => {
      keys.forEach((key) => dirty.add(key));
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (!alive) return;
        const selected = new Set(dirty);
        dirty.clear();
        void client.invalidateQueries({ predicate: (query) => selected.has(String(query.queryKey[0])) });
      }, 100);
    };
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
          refresh();
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
    ];
    const receive = (event: { name?: string; data?: any }) => {
      if (!alive) return;
      const { name = '', data = {} } = event || {};
      if (name === 'TaskProgressedEvent' && /^conversation[1-9]\d*$/.test(data.session || '')) {
        const id = Number(data.session.slice('conversation'.length));
        client.setQueryData(['conversation-progress', user.id, id], { value: data, at: Date.now() });
        return;
      }
      if (name.startsWith('Conversation'))
        refresh(['conversation', 'conversations', 'messages', 'active-jobs']);
      else if (name.startsWith('File'))
        refresh(['files', 'file-preview', 'messages', 'conversation', 'conversations']);
      else if (name === 'CoinBalanceChangedEvent') refresh(['account', 'transactions']);
      else if (name === 'TaskStartedEvent' || name === 'TaskFinishedEvent') {
        refresh([
          'conversation',
          'conversations',
          'messages',
          'active-jobs',
          'conversation-progress',
          ...(name === 'TaskFinishedEvent' ? ['account', 'transactions', 'files'] : []),
        ]);
      }
    };
    subscriptions.push(...events.map((name) => transport.getDispatcher<any>(name).subscribe(receive)));
    void transport.connect().catch(() => {
      if (alive) setConnected(false);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      socketRef.current = null;
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      connection.disconnect();
      transport.destroy();
      connection.destroy();
    };
  }, [session, user?.id, client, roomCommand]);

  useEffect(() => {
    if (connected || !user || !session) return;
    // One fallback timer for the application, only while the socket is unavailable.
    const timer = setInterval(() => {
      void client.invalidateQueries({ predicate: (query) => resources.includes(String(query.queryKey[0])) });
    }, 15000);
    return () => clearInterval(timer);
  }, [connected, user?.id, session, client]);

  return <Context.Provider value={{ connected, join }}>{children}</Context.Provider>;
}
export function useRealtime() {
  return useContext(Context);
}
export function useConversationRoom(id?: number) {
  const { join } = useRealtime();
  useEffect(() => (id ? join(`conversation${id}`) : undefined), [id, join]);
}
