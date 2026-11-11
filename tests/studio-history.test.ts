import { describe, expect, it, vi } from 'vitest';
import { studioHistoryFiles } from '../src/features/content-studio/studioHistory';
import type { IConversation, IConversationMessage, IGnosisFile } from '../src/lib/types';
const conversation = { id: 101, userId: 7, history: 32, isConsiderHistory: true } as IConversation;
const file = {
  id: 1602,
  userId: 7,
  name: 'chair.png',
  type: 'IMAGE',
  path: 'https://storage.example/secret-url',
} as IGnosisFile;
const message = (id: number, files: IGnosisFile[] = []): IConversationMessage => ({
  id,
  role: 'USER',
  files,
  createdDate: '2026-11-11T13:24:00Z',
});
const page = (items: IConversationMessage[], index = 0, pages = 1) => ({
  items,
  pages,
  pageIndex: index,
  pageSize: 20,
  total: 24,
});
describe('Studio historical file catalogue', () => {
  it('finds the original photo beyond the first page, excludes foreign files and never forwards storage URLs', async () => {
    const read = vi.fn(async (index: number) =>
      index === 0
        ? page(
            Array.from({ length: 20 }, (_, i) => message(100 - i)),
            0,
            2,
          )
        : page(
            [
              message(1, [file, { ...file, id: 9, userId: 8 }]),
              { ...message(2, [{ ...file, id: 4 }]), role: 'COMMAND' },
            ],
            1,
            2,
          ),
    );
    const files = await studioHistoryFiles(conversation, read);
    expect(read.mock.calls.map(([index]) => index)).toEqual([0, 1]);
    expect(files).toEqual([{ id: 1602, name: 'chair.png', type: 'IMAGE', role: 'USER', messageId: 1 }]);
    expect(JSON.stringify(files)).not.toContain('secret-url');
  });
  it('respects the backend history window including the next request itself', async () => {
    const read = vi.fn(async () => page([message(3), message(2, [file])]));
    expect(await studioHistoryFiles({ ...conversation, history: 2 }, read)).toEqual([]);
  });
  it.each([{ history: 0 }, { isConsiderHistory: false }])(
    'never reads history when disabled: %j',
    async (flags) => {
      const read = vi.fn();
      expect(await studioHistoryFiles({ ...conversation, ...flags }, read)).toEqual([]);
      expect(read).not.toHaveBeenCalled();
    },
  );
  it('respects a history reset and distinguishes original material from assistant output', async () => {
    const result = {
      ...message(5, [{ ...file, id: 20 }]),
      role: 'ASSISTANT' as const,
      createdDate: '2026-11-11T14:30:00Z',
    };
    const read = async () => page([result, message(1, [file])]);
    expect(
      await studioHistoryFiles({ ...conversation, historyResetDate: '2026-11-11T14:00:00Z' }, read),
    ).toEqual([{ id: 20, name: 'chair.png', type: 'IMAGE', role: 'ASSISTANT', messageId: 5 }]);
  });
  it('does not silently continue without context if reading history fails', async () => {
    await expect(
      studioHistoryFiles(conversation, async () => {
        throw Error('network');
      }),
    ).rejects.toThrow('network');
  });
});
