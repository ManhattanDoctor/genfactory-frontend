import { describe, it, expect } from 'vitest';
import { variantGroups, requestKind } from '../src/features/studio/variants';
import type { ConversationMessage, GnosisFile } from '../src/lib/types';
const file = { id: 12, userId: 7, type: 'IMAGE' } as GnosisFile;
const message = (
  id: number,
  role: ConversationMessage['role'],
  text = '',
  files: GnosisFile[] = [],
): ConversationMessage => ({ id, role, text, files, createdDate: '2026-11-01' });
describe('variant provenance', () => {
  it('does not attribute an orphaned response to a later request', () => {
    const groups = variantGroups(
      [
        message(1, 'ASSISTANT', '', [file]),
        message(2, 'USER', 'Создай изображение с помощью IMAGE.\nЗапрос'),
        message(3, 'ASSISTANT', '', [{ ...file, id: 13 }]),
      ],
      7,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].outputs.map((f) => f.id)).toEqual([13]);
  });
  it('stops relationships at another user request and excludes foreign files', () => {
    const groups = variantGroups(
      [
        message(1, 'USER', 'Создай видео с помощью VIDEO.\nЗапрос', [file]),
        message(2, 'ASSISTANT', '', [{ ...file, id: 13, userId: 8 }]),
        message(3, 'USER', 'Вопрос'),
        message(4, 'ASSISTANT', '', [file]),
      ],
      7,
    );
    expect(groups[0].inputs).toEqual([file]);
    expect(groups[0].outputs).toEqual([]);
    expect(groups[0].responses.map((m) => m.id)).toEqual([2]);
  });
  it('does not infer a media generation from ordinary text', () => {
    expect(requestKind('Можешь создать изображение?')).toBeUndefined();
  });
});
