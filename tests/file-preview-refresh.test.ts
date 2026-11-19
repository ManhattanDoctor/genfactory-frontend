import { afterEach, describe, expect, it, vi } from 'vitest';
import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { api } from '../src/lib/api';
import { applyFilePreview, refreshFilePreview } from '../src/features/realtime/filePreviewRefresh';
import { QueryRefreshService } from '../src/features/realtime/QueryRefreshService';
import { refreshTargets } from '../src/features/realtime/refreshTargets';
import type { IGnosisFile, IPagination } from '../src/lib/types';
const file = {
  id: 12,
  userId: 7,
  name: 'Original',
  preview: { image: { status: 'PENDING' } },
} as IGnosisFile;
const ready = {
  ...file,
  name: 'Old server name',
  preview: { image: { status: 'READY', url: '/poster.jpg' } },
} as IGnosisFile;
const page = (items: IGnosisFile[], pageIndex = 0): IPagination<IGnosisFile> => ({
  items,
  pageIndex,
  pageSize: 1,
  pages: 4,
  total: 4,
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('targeted preview updates', () => {
  it('updates a loaded file without refetching four gallery pages or replacing unrelated files', async () => {
    const client = new QueryClient();
    const queryFn = vi.fn(async ({ pageParam }: { pageParam: number }) =>
      page([{ ...file, id: 12 + pageParam }], pageParam),
    );
    const observer = new InfiniteQueryObserver(client, {
      queryKey: ['files', 7, 'image-wall'],
      initialPageParam: 0,
      queryFn,
      getNextPageParam: (last) => (last.pageIndex < 3 ? last.pageIndex + 1 : undefined),
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch();
    for (let i = 0; i < 3; i++) await observer.fetchNextPage();
    const before = observer.getCurrentResult().data!;
    queryFn.mockClear();
    const read = vi.spyOn(api, 'file').mockResolvedValue(ready);
    await refreshFilePreview(client, 7, 12, 'session', () => true);
    const after = observer.getCurrentResult().data!;
    expect(read).toHaveBeenCalledTimes(1);
    expect(queryFn).not.toHaveBeenCalled();
    expect(after.pages).toHaveLength(4);
    expect(after.pages[0].items[0]).toMatchObject({ name: 'Original', preview: ready.preview });
    expect(after.pages[1]).toBe(before.pages[1]);
    expect(after.pageParams).toBe(before.pageParams);
    unsubscribe();
    client.clear();
  });
  it('updates message attachments and linked files, preserving stale markers and other accounts', () => {
    const client = new QueryClient();
    const message = { id: 101, role: 'USER', files: [file] };
    client.setQueryData(['messages', 7, 1, 0], { ...page([]), items: [message] });
    client.setQueryData(['files', 7, 0], page([{ ...file, id: 15, linkTo: 12 }]));
    client.setQueryData(['files', 8, 0], page([{ ...file, userId: 8 }]));
    client.setQueryData(['files', 7, 'directory-name', 'folder'], { id: 90, name: 'Folder' });
    client.setQueryData(['files', 7, 'tags'], { items: ['tag'], pages: 1 });
    const other = client.getQueryData(['files', 8, 0]);
    const query = client.getQueryCache().find({ queryKey: ['files', 7, 0] })!;
    query.invalidate();
    const updatedAt = query.state.dataUpdatedAt;
    applyFilePreview(client, 7, ready);
    expect(client.getQueryData<any>(['messages', 7, 1, 0]).items[0].files[0].preview).toEqual(ready.preview);
    expect(client.getQueryData<any>(['files', 7, 0]).items[0]).toMatchObject({
      id: 15,
      linkTo: 12,
      preview: ready.preview,
    });
    expect(client.getQueryData(['files', 8, 0])).toBe(other);
    expect(query.state.isInvalidated).toBe(true);
    expect(query.state.dataUpdatedAt).toBe(updatedAt);
    client.clear();
  });
  it('does not apply a late response after logout or while a list can overwrite it', async () => {
    const client = new QueryClient();
    client.setQueryData(['files', 7, 0], page([file]));
    let finish!: (file: IGnosisFile) => void;
    vi.spyOn(api, 'file').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let current = true;
    const request = refreshFilePreview(client, 7, 12, 'session', () => current);
    current = false;
    finish(ready);
    await request;
    expect(client.getQueryData<any>(['files', 7, 0]).items[0].preview).toEqual(file.preview);
    current = true;
    const next = refreshFilePreview(client, 7, 12, 'session', () => current);
    let resolvePage!: (value: IPagination<IGnosisFile>) => void;
    const fetching = client.fetchQuery({
      queryKey: ['files', 7, 0],
      queryFn: () =>
        new Promise<IPagination<IGnosisFile>>((resolve) => {
          resolvePage = resolve;
        }),
    });
    finish(ready);
    expect(await next).toBe(false);
    resolvePage(page([file]));
    await fetching;
    client.clear();
  });
  it('coalesces preview events and reconciles another event received during the request', async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    client.setQueryData(['files', 7, 0], page([file]));
    const resolvers: Array<(file: IGnosisFile) => void> = [];
    const read = vi
      .spyOn(api, 'file')
      .mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const queue = new QueryRefreshService(client, 7, () => true, 'session');
    const target = refreshTargets(['file-preview-update'], undefined, 12);
    for (let i = 0; i < 100; i++) queue.enqueue(target);
    await vi.advanceTimersByTimeAsync(250);
    expect(read).toHaveBeenCalledTimes(1);
    queue.enqueue(target);
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).toHaveBeenCalledTimes(1);
    resolvers[0](file);
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).toHaveBeenCalledTimes(2);
    resolvers[1](ready);
    await vi.advanceTimersByTimeAsync(1);
    expect(client.getQueryData<any>(['files', 7, 0]).items[0].preview).toEqual(ready.preview);
    queue.dispose();
    client.clear();
  });
});
