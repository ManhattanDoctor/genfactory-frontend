import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import type { Conversation, ToolProgress } from '../../lib/types';
import { readTools } from './progress';

// Existing gnosis socket transport; HTTP is the reconnect/fallback source.
export function useConversationProgress(conversation: Conversation) {
  const { session } = useAuth();
  const client = useQueryClient();
  const [live, setLive] = useState<ToolProgress[] | null>(null);
  const [connected, setConnected] = useState(false);
  const lastEventAt = useRef(0);
  const running = conversation.status === 'LOADING';
  const sessionName = `conversation${conversation.id}`;
  const progress = useQuery({
    queryKey: ['conversation-progress', conversation.userId, conversation.id],
    enabled: running && !!session,
    queryFn: async ({ signal }) => ({ value: await api.progress(sessionName, signal), at: Date.now() }),
    refetchInterval: 2000,
    retry: false,
  });
  useEffect(() => {
    if (!running) {
      setLive(null);
      lastEventAt.current = 0;
      client.setQueryData(['conversation-progress', conversation.userId, conversation.id], {
        value: null,
        at: Date.now(),
      });
    }
  }, [running, client, conversation.userId, conversation.id]);
  useEffect(() => {
    if (!session) return;
    const apiBase = new URL(import.meta.env.VITE_API_BASE || '/api', location.origin);
    const socket = io(`${apiBase.origin}/gnosisai`, {
      auth: { token: session },
      path: '/socket.io',
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ['conversation', conversation.userId, conversation.id] });
      void client.invalidateQueries({ queryKey: ['messages', conversation.userId, conversation.id] });
      void client.invalidateQueries({ queryKey: ['account'] });
      void client.invalidateQueries({ queryKey: ['files', conversation.userId] });
    };
    socket.on('transportSocketConnected', () => {
      setConnected(true);
      socket.emit('transportSocketCommandRequest', {
        id: crypto.randomUUID(),
        name: 'TransportSocketRoomCommand',
        request: { action: 'ADD', name: sessionName },
        isNeedReply: false,
      });
      void client.invalidateQueries({
        queryKey: ['conversation-progress', conversation.userId, conversation.id],
      });
      refresh();
    });
    socket.on('disconnect', () => {
      setConnected(false);
      setLive(null);
    });
    socket.on('connect_error', () => setConnected(false));
    socket.on(
      'transportSocketEvent',
      (event: { name?: string; data?: { session?: string; data?: { tools?: unknown }; id?: number } }) => {
        if (event?.data?.session === sessionName) {
          if (event.name === 'TaskProgressedEvent') {
            lastEventAt.current = Date.now();
            setLive(readTools(event.data.data?.tools));
          } else if (event.name === 'TaskStartedEvent') {
            setLive(null);
            refresh();
          } else if (event.name === 'TaskFinishedEvent') {
            setLive(null);
            refresh();
          }
        } else if (
          event?.data?.id === conversation.id &&
          ['ConversationMessageAddedEvent', 'ConversationChangedEvent', 'ConversationErroredEvent'].includes(
            event.name || '',
          )
        )
          refresh();
      },
    );
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [session, sessionName, client, conversation.userId, conversation.id]);
  const tools =
    live !== null && lastEventAt.current >= (progress.data?.at || 0)
      ? live
      : readTools(progress.data?.value?.data?.tools);
  return { tools: running ? tools : [], unavailable: running && !!progress.error && !connected };
}
