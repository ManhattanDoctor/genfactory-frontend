import type { QueryClient } from '@tanstack/react-query';
import { getSession } from '../../lib/api';
import { QueryRefreshService } from './QueryRefreshService';

// Mutations and sockets share the same service and event queue for each session.
const services = new WeakMap<QueryClient, Map<string, QueryRefreshService>>();

export function getQueryRefreshService(
  client: QueryClient,
  userId: number,
  session: string,
): QueryRefreshService {
  let sessions = services.get(client);
  if (!sessions) services.set(client, (sessions = new Map()));
  let service = sessions.get(session);
  if (!service) {
    service = new QueryRefreshService(client, userId, () => getSession() === session, session);
    sessions.set(session, service);
  }
  return service;
}

export function scheduleRefresh(
  client: QueryClient,
  userId: number,
  session: string,
  keys: string[],
  conversationId?: unknown,
  fileId?: unknown,
): void {
  if (getSession() !== session) return;
  getQueryRefreshService(client, userId, session).schedule(keys, conversationId, fileId);
}

export function disposeRefresh(client: QueryClient, session: string): void {
  const sessions = services.get(client);
  sessions?.get(session)?.dispose();
  sessions?.delete(session);
}
