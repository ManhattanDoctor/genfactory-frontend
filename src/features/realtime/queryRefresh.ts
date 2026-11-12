import type { QueryClient } from '@tanstack/react-query';
import { getSession } from '../../lib/api';
import { matchesRefresh, refreshTargets, type RefreshTarget } from './refreshTargets';

interface IRefreshQueue {
  enqueue: (targets: RefreshTarget[]) => void;
  dispose: () => void;
}

// All event sources share one queue, so a completed task and its socket events
// cannot repeatedly cancel and restart the same list request.
export function createRefreshQueue(
  client: QueryClient,
  userId: number,
  isCurrent: () => boolean,
): IRefreshQueue {
  const pending = new Map<string, RefreshTarget>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let nextRefresh = 0;
  let disposed = false;
  const enqueue = (targets: RefreshTarget[]): void => {
    if (disposed || !isCurrent()) return;
    for (const target of targets) pending.set(`${target.resource}:${target.id ?? '*'}`, target);
    if (timer || !pending.size) return;
    timer = setTimeout(flush, Math.max(250, nextRefresh - Date.now()));
  };
  const flush = (): void => {
    timer = undefined;
    if (disposed || !isCurrent()) {
      pending.clear();
      return;
    }
    nextRefresh = Date.now() + 5000;
    const targets = [...pending.values()];
    pending.clear();
    const fetching = client.getQueryCache().findAll({
      predicate: (query) =>
        query.state.fetchStatus === 'fetching' && matchesRefresh(query.queryKey, targets, userId),
    });
    // A change received during a fetch must be reconciled after it finishes.
    // Do not cancel the fetch, or discard the event when that fetch succeeds.
    enqueue(
      targets.filter((target) => fetching.some((query) => matchesRefresh(query.queryKey, [target], userId))),
    );
    void client.invalidateQueries(
      {
        predicate: (query) => !fetching.includes(query) && matchesRefresh(query.queryKey, targets, userId),
      },
      { cancelRefetch: false },
    );
  };
  return {
    enqueue,
    dispose: (): void => {
      disposed = true;
      clearTimeout(timer);
      pending.clear();
    },
  };
}

const queues = new WeakMap<QueryClient, Map<string, IRefreshQueue>>();

export function scheduleRefresh(
  client: QueryClient,
  userId: number,
  session: string,
  keys: string[],
  conversationId?: unknown,
  fileId?: unknown,
): void {
  if (getSession() !== session) return;
  let sessions = queues.get(client);
  if (!sessions) queues.set(client, (sessions = new Map()));
  let queue = sessions.get(session);
  if (!queue) {
    queue = createRefreshQueue(client, userId, () => getSession() === session);
    sessions.set(session, queue);
  }
  const resources = keys.includes('files') || keys.includes('conversations') ? [...keys, 'artifacts'] : keys;
  queue.enqueue(refreshTargets(resources, conversationId, fileId));
}

export function disposeRefresh(client: QueryClient, session: string): void {
  const sessions = queues.get(client);
  sessions?.get(session)?.dispose();
  sessions?.delete(session);
}
