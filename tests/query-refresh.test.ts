import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { createRefreshQueue } from '../src/features/realtime/queryRefresh';
import { refreshTargets } from '../src/features/realtime/refreshTargets';
import { ApiError, retryQuery } from '../src/lib/api';

describe('generation refresh queue', () => {
  const cleanup: Array<() => void> = [];
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup.splice(0).forEach((dispose) => dispose());
    vi.useRealTimers();
  });
  function observe(client: QueryClient, key: readonly unknown[], queryFn = vi.fn(async () => 'fresh')) {
    client.setQueryData(key, 'initial');
    const observer = new QueryObserver(client, { queryKey: key, queryFn, staleTime: Infinity });
    cleanup.push(observer.subscribe(() => {}));
    return queryFn;
  }
  function setup(isCurrent = (): boolean => true) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queue = createRefreshQueue(client, 7, isCurrent);
    cleanup.push(() => {
      queue.dispose();
      client.clear();
    });
    return { client, queue };
  }
  it('merges hundreds of events and all completion sources into one refresh per query', async () => {
    const { client, queue } = setup();
    const files = observe(client, ['files', 7, 0]);
    const artifacts = observe(client, ['artifacts', 7, 0]);
    for (let i = 0; i < 300; i++) queue.enqueue(refreshTargets(['files', 'artifacts']));
    await vi.advanceTimersByTimeAsync(250);
    expect(files).toHaveBeenCalledTimes(1);
    expect(artifacts).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 300; i++) queue.enqueue(refreshTargets(['files', 'artifacts']));
    await vi.advanceTimersByTimeAsync(4999);
    expect(files).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(files).toHaveBeenCalledTimes(2);
    expect(artifacts).toHaveBeenCalledTimes(2);
  });
  it('preserves changes to different conversations without fetching unrelated messages', async () => {
    const { client, queue } = setup();
    const first = observe(client, ['messages', 7, 101]);
    const second = observe(client, ['messages', 7, 102]);
    const unrelated = observe(client, ['messages', 7, 103]);
    queue.enqueue(refreshTargets(['messages'], 101));
    queue.enqueue(refreshTargets(['messages'], 102));
    await vi.advanceTimersByTimeAsync(250);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(unrelated).not.toHaveBeenCalled();
  });
  it('keeps a slow request alive and reconciles events received while it was fetching', async () => {
    const { client, queue } = setup();
    let resolve!: (value: string) => void;
    let aborted = false;
    const queryFn = vi.fn(({ signal }: { signal: AbortSignal }): Promise<string> => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
      return new Promise<string>((done) => {
        resolve = done;
      });
    });
    client.setQueryData(['files', 7], 'old');
    const observer = new QueryObserver(client, { queryKey: ['files', 7], queryFn });
    cleanup.push(observer.subscribe(() => {}));
    queue.enqueue(refreshTargets(['files']));
    await vi.advanceTimersByTimeAsync(250);
    expect(aborted).toBe(false);
    expect(queryFn).toHaveBeenCalledTimes(1);
    resolve('snapshot before event');
    await vi.advanceTimersByTimeAsync(5000);
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(aborted).toBe(false);
    resolve('snapshot after event');
    await vi.advanceTimersByTimeAsync(5000);
    expect(client.getQueryData(['files', 7])).toBe('snapshot after event');
    expect(queryFn).toHaveBeenCalledTimes(2);
  });
  it('marks inactive pages stale without loading them in the background', async () => {
    const { client, queue } = setup();
    client.setQueryData(['files', 7, 1], 'cached page');
    const files = observe(client, ['files', 7, 0]);
    queue.enqueue(refreshTargets(['files']));
    await vi.advanceTimersByTimeAsync(250);
    expect(files).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(['files', 7, 1])?.isInvalidated).toBe(true);
    expect(client.isFetching()).toBe(0);
  });
  it('drops queued refreshes on logout and disposal', async () => {
    let current = true;
    const { client, queue } = setup(() => current);
    const files = observe(client, ['files', 7]);
    queue.enqueue(refreshTargets(['files']));
    current = false;
    await vi.advanceTimersByTimeAsync(250);
    expect(files).not.toHaveBeenCalled();
    current = true;
    queue.enqueue(refreshTargets(['files']));
    queue.dispose();
    await vi.advanceTimersByTimeAsync(10000);
    expect(files).not.toHaveBeenCalled();
  });
  it('does not retry rate limits or access errors and keeps one retry for transient read errors', () => {
    for (const status of [401, 403, 429])
      expect(retryQuery(0, new ApiError('unavailable', status))).toBe(false);
    expect(retryQuery(0, new ApiError('unavailable', 503))).toBe(true);
    expect(retryQuery(1, new ApiError('unavailable', 503))).toBe(false);
  });
});
