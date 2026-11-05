import { describe, it, expect } from 'vitest';
import { conversationUrl } from '../src/lib/conversationUrl';
import type { IConversation } from '../src/lib/types';
describe('saved conversation workspace', () => {
  for (const [tags, expected] of [
    [['image'], '/image?conversation=10'],
    [['video'], '/video?conversation=10'],
    [['chat'], '/agent?conversation=10'],
    [['prompt'], '/prompt?conversation=10'],
    [['script'], '/script?conversation=10'],
    [['audio', 'stt'], '/audio?mode=stt&conversation=10'],
    [[], '/chat?conversation=10'],
  ] as [string[], string][])
    it(expected, () =>
      expect(conversationUrl({ id: 10, tags, options: {} } as IConversation)).toBe(expected),
    );
  it('preserves access to tools in advanced agent', () =>
    expect(
      conversationUrl({ id: 10, tags: ['chat'], options: { tools: [{ uid: 'IMAGE' }] } } as IConversation),
    ).toBe('/agent?conversation=10&studio=advanced'));
});
