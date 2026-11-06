import { describe, expect, it } from 'vitest';
import { isReadyScript, scriptReferences } from '../src/features/content-studio/script';
const script =
  '**Длительность:** 8 секунд\n**Камера:** Один неподвижный план.\n**Действие:** Рыцарь поднимает меч.';
describe('script approval', () => {
  it('recognizes legacy markdown scripts but not clarifications or refusals', () => {
    expect(isReadyScript(script)).toBe(true);
    expect(isReadyScript('Какая длительность? Какая камера?')).toBe(false);
    expect(isReadyScript('Я не могу создать видео непосредственно.')).toBe(false);
  });
  it('restores the latest user image set before the chosen script, preserving order', () => {
    const photo = (id: number) => ({ id, type: 'IMAGE', name: String(id) }) as any;
    const messages = [
      { id: 1, role: 'USER', files: [photo(11)], createdDate: '' },
      { id: 2, role: 'USER', files: [photo(21), photo(22), photo(21)], createdDate: '' },
      { id: 3, role: 'ASSISTANT', files: [photo(31)], createdDate: '' },
      { id: 4, role: 'USER', text: 'Пусть будет ночью', createdDate: '' },
      { id: 5, role: 'ASSISTANT', text: script, createdDate: '' },
      { id: 6, role: 'USER', files: [photo(61)], createdDate: '' },
    ] as any;
    expect(scriptReferences(messages, 5)?.map((f) => f.id)).toEqual([21, 22]);
    expect(scriptReferences(messages, 2)?.map((f) => f.id)).toEqual([11]);
    expect(scriptReferences(messages, 1)).toBeUndefined();
  });
});
