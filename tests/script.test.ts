import { describe, expect, it } from 'vitest';
import { isReadyScript, latestScript, scriptIntent } from '../src/features/content-studio/script';
const script =
  '**Длительность:** 8 секунд\n**Камера:** Один неподвижный план.\n**Действие:** Рыцарь поднимает меч.';
describe('script approval', () => {
  it('recognizes legacy markdown scripts but not clarifications or refusals', () => {
    expect(isReadyScript(script)).toBe(true);
    expect(isReadyScript('Какая длительность? Какая камера?')).toBe(false);
    expect(isReadyScript('Я не могу создать видео непосредственно.')).toBe(false);
  });
  it('separates approval from explicit paid generation and ignores ambiguous text', () => {
    for (const text of ['подтверждаю', 'да давай', 'приступай']) expect(scriptIntent(text)).toBe('approve');
    expect(scriptIntent('да сделай уже видео!')).toBe('generate');
    for (const text of [
      'не создавай видео',
      'создай видео?',
      'он сказал «создай видео»',
      'да',
      'подтверждаю, но поменяй сцену',
    ])
      expect(scriptIntent(text)).toBeUndefined();
  });
  it('does not reuse an old script after a new brief or edit request', () => {
    expect(
      latestScript([
        { id: 1, role: 'USER', text: '[Genfactory:script]\nЗапрос пользователя:\nПридумай', createdDate: '' },
        { id: 2, role: 'ASSISTANT', text: script, createdDate: '' },
        {
          id: 3,
          role: 'USER',
          text: '[Genfactory:script]\nЗапрос пользователя:\nЗамени рыцаря на чашку',
          createdDate: '',
        },
        { id: 4, role: 'ASSISTANT', text: 'Какую чашку?', createdDate: '' },
      ]),
    ).toBeUndefined();
  });
  it('finds the prepared script behind repeated questions and refusals in conversation 1376', () => {
    const messages = [
      {
        id: 19425,
        role: 'USER' as const,
        text: '[Genfactory:script]\nЗапрос пользователя:\nподтверждаю',
        createdDate: '',
      },
      { id: 19426, role: 'ASSISTANT' as const, text: script, createdDate: '' },
      {
        id: 19427,
        role: 'USER' as const,
        text: '[Genfactory:script]\nЗапрос пользователя:\nследующий этап',
        createdDate: '',
      },
      { id: 19428, role: 'ASSISTANT' as const, text: 'Уточните модель?', createdDate: '' },
      {
        id: 19429,
        role: 'USER' as const,
        text: '[Genfactory:script]\nЗапрос пользователя:\nсделай видео',
        createdDate: '',
      },
      { id: 19430, role: 'ASSISTANT' as const, text: 'Я не могу создать видео.', createdDate: '' },
    ];
    expect(latestScript(messages.reverse())?.text).toBe(script);
  });
});
