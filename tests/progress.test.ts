import { describe, expect, it } from 'vitest';
import { readTools, toolLabel } from '../src/features/studio/progress';
describe('Tool progress presentation', () => {
  it('never passes raw arguments into presentation', () => {
    const tools = readTools([
      { uid: 'VIDEO', args: 'private prompt' },
      { uid: 'IMAGE', status: 'ERRORED' },
    ]);
    expect(tools).toEqual([
      { uid: 'VIDEO', name: undefined, status: undefined },
      { uid: 'IMAGE', name: undefined, status: 'ERRORED' },
    ]);
    expect(toolLabel(tools[0])).toBe('Ожидаем готовое видео');
    expect(toolLabel(tools[1])).toBe('Генерация изображения: ошибка');
  });
  it('uses terminal descriptions instead of waiting after a video failure or completion', () => {
    for (const uid of ['VIDEO', 'VIDEO_OPEN_ROUTER']) {
      expect(toolLabel({ uid, status: 'ERRORED' })).toBe('Генерация видео: ошибка');
      expect(toolLabel({ uid, status: 'FINISHED' })).toBe('Генерация видео: завершено');
    }
  });
  it('ignores malformed progress and does not invent percentages', () => {
    expect(readTools(null)).toEqual([]);
    expect(readTools([null, { uid: 3 }, { uid: 'IMAGE', status: 'made-up' }])).toEqual([]);
    expect(toolLabel({ uid: 'custom', name: 'Внешний инструмент' })).toBe('Внешний инструмент');
  });
});
