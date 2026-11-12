import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { cachedStudioHistoryFiles } from '../src/features/content-studio/historyCache';
import { api } from '../src/lib/api';
import type { IConversation, IConversationMessage, IGnosisFile } from '../src/lib/types';
const conversation = { id: 101, userId: 7, history: 32, isConsiderHistory: true } as IConversation;
const file = { id: 12, userId: 7, name: 'source.png', type: 'IMAGE' } as IGnosisFile;
const page = {
  items: [
    { id: 1, role: 'USER', files: [file], createdDate: '2026-11-11T10:00:00Z' } as IConversationMessage,
  ],
  total: 1,
  pages: 1,
  pageIndex: 0,
  pageSize: 20,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('reuses messages already shown by the thread, and revalidates after a socket/send invalidation', async () => {
  vi.useFakeTimers();
  const client = new QueryClient();
  const read = vi.spyOn(api, 'messages').mockResolvedValue(page);
  client.setQueryData(['messages', 7, 101, 0], page);
  vi.advanceTimersByTime(2000);
  expect(await cachedStudioHistoryFiles(client, conversation, 'session')).toHaveLength(1);
  expect(read).not.toHaveBeenCalled();
  await client.invalidateQueries({ queryKey: ['messages', 7, 101] });
  expect(await cachedStudioHistoryFiles(client, conversation, 'session')).toHaveLength(1);
  expect(read).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(30_001);
  await cachedStudioHistoryFiles(client, conversation, 'session');
  expect(read).toHaveBeenCalledTimes(2);
  client.clear();
});
it('keeps accounts isolated and honors a reset even when pages remain cached', async () => {
  const client = new QueryClient();
  client.setQueryData(['messages', 8, 101, 0], page);
  const read = vi.spyOn(api, 'messages').mockResolvedValue(page);
  await cachedStudioHistoryFiles(client, conversation, 'session');
  expect(read).toHaveBeenCalledTimes(1);
  expect(
    await cachedStudioHistoryFiles(
      client,
      { ...conversation, historyResetDate: '2026-11-11T11:00:00Z' },
      'session',
    ),
  ).toEqual([]);
  expect(read).toHaveBeenCalledTimes(1);
  client.clear();
});
