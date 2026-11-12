import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { matchesRefresh, refreshTargets, taskConversationId } from '../src/features/realtime/refreshTargets';

describe('scoped socket refresh', () => {
  it('invalidates only the changed conversation, all its cached pages, and shared lists', async () => {
    const client = new QueryClient();
    for (const key of [
      ['messages', 7, 101, 0],
      ['messages', 7, 101, 1],
      ['messages', 7, 102, 0],
      ['messages', 8, 101, 0],
      ['conversation', 7, 101],
      ['conversations', 7, 'navigation'],
    ])
      client.setQueryData(key, {});
    const targets = refreshTargets(['messages', 'conversation', 'conversations'], 101);
    await client.invalidateQueries({ predicate: (q) => matchesRefresh(q.queryKey, targets, 7) });
    expect(client.getQueryState(['messages', 7, 101, 0])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['messages', 7, 101, 1])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['messages', 7, 102, 0])?.isInvalidated).toBe(false);
    expect(client.getQueryState(['messages', 8, 101, 0])?.isInvalidated).toBe(false);
    expect(client.getQueryState(['conversations', 7, 'navigation'])?.isInvalidated).toBe(true);
    client.clear();
  });
  it('retains changes from multiple conversations in the same event batch', () => {
    const targets = [...refreshTargets(['messages'], 101), ...refreshTargets(['messages'], 102)];
    expect(matchesRefresh(['messages', 7, 101, 0], targets, 7)).toBe(true);
    expect(matchesRefresh(['messages', 7, 102, 0], targets, 7)).toBe(true);
    expect(matchesRefresh(['messages', 7, 103, 0], targets, 7)).toBe(false);
  });
  it('falls back to broad refresh for old events without a valid id and reconnects', () => {
    for (const id of [undefined, 0, -1, '101', NaN])
      expect(matchesRefresh(['messages', 7, 102, 0], refreshTargets(['messages'], id), 7)).toBe(true);
  });
  it('scopes preview details without suppressing shared covers and file lists', () => {
    const targets = refreshTargets(['file-preview', 'conversations', 'files'], undefined, 12);
    expect(matchesRefresh(['file-preview', 7, 12], targets, 7)).toBe(true);
    expect(matchesRefresh(['file-preview', 7, 13], targets, 7)).toBe(false);
    expect(matchesRefresh(['conversations', 7, 0], targets, 7)).toBe(true);
  });
  it('recognizes only conversation task sessions', () => {
    expect(taskConversationId('conversation101')).toBe(101);
    for (const session of [
      'image101',
      'conversation0',
      'conversation01',
      'conversation999999999999999999999',
      undefined,
    ])
      expect(taskConversationId(session)).toBeUndefined();
  });
});
