import { describe, expect, it } from 'vitest';
import {
  connection,
  imageRequest,
  migratedReferenceSystem,
  displayMessageText,
  withMessageContext,
  createConversationBody,
  createMessageBody,
  toolSettings,
} from '../src/features/studio/conversations';
import type { IConversation, IModelDescription } from '../src/lib/types';
const model: IModelDescription = {
  reference: { provider: 'OPEN_ROUTER_VIDEO', model: 'video-model' },
  name: 'Video',
  schema: {},
};
const agent: IModelDescription = {
  reference: { provider: 'OPEN_AI_CONVERSATION', model: 'agent-model' },
  name: 'Agent',
  schema: {},
};
describe('Conversation tool contracts', () => {
  it('keeps input files and orchestration fields out of saved tool preferences', () => {
    const options = {
      model: 'wrong',
      frameImages: [{ url: 'private' }],
      prompt: 'secret',
      tools: ['OTHER'],
      duration: 4,
      generateAudio: false,
      seed: 0,
      stream: true,
    };
    const tool = toolSettings('video', model, options);
    expect(tool.settings).toEqual({
      model: model.reference,
      isLockSelection: true,
      options: { duration: 4, generateAudio: false, seed: 0 },
    });
    expect(options.frameImages).toHaveLength(1);
  });
  it('creates a conversation with separate assistant model and universal tools', () => {
    const tool = toolSettings('video', model, { duration: 4 });
    const result = createConversationBody('Camera movement', 'video', agent, tool);
    expect(result.model).toBe('OPEN_AI_CONVERSATION');
    expect(result.options).toEqual({ model: 'agent-model', tools: [tool, { uid: 'IMAGE' }] });
    expect(result.isConsiderHistory).toBe(true);
    expect(result.tags).toContain('genfactory');
  });
  it('preserves reference order in both file attachments and instructions without saving URLs', () => {
    const tool = toolSettings('video', model, { duration: 4 });
    const body = createMessageBody('Move closer', 'video', tool, [42, 12]);
    expect(body.files).toEqual([42, 12]);
    expect(body.text).toContain('42, 12');
    expect(body.settings.tools).toEqual([{ ...tool, isRequired: true, input: { fileIds: [42, 12] } }]);
    expect(JSON.stringify(body)).not.toContain('frameImages');
  });
  it('explicitly prevents reuse of old images for a fresh generation', () => {
    const body = createMessageBody('Ocean', 'image', { uid: 'IMAGE' }, [], true);
    expect(body.text).toContain('без референсов');
    expect(body.files).toEqual([]);
  });
  it('recognizes universal string connections and does not silently add a missing tool', () => {
    const conversation = { options: { tools: ['IMAGE'] } } as IConversation;
    expect(connection(conversation, 'image')).toEqual({ uid: 'IMAGE' });
    expect(connection(conversation, 'video')).toBeUndefined();
  });
});

it('does not interpret missing attachments as a ban on conversation context', () => {
  const body = createMessageBody('Оживи её', 'video', { uid: 'VIDEO' }, []);
  expect(body.text).not.toContain('Создай с нуля');
  expect(displayMessageText(body.text)).toBe('Оживи её');
});
it('migrates only the legacy instruction in Genfactory conversations', () => {
  const legacy = 'Если референсы не указаны, создавай с нуля: IMAGE isDrawNew=true, VIDEO fileIds=[]. ';
  const conversation = {
    tags: ['genfactory'],
    system: 'Custom prefix. ' + legacy + 'Custom suffix.',
  } as IConversation;
  const system = migratedReferenceSystem(conversation)!;
  expect(system).toContain('Только при явном выборе');
  expect(system).toMatch(/^Custom prefix\. /);
  expect(system).toMatch(/Custom suffix\.$/);
  expect(migratedReferenceSystem({ ...conversation, system })).toBeUndefined();
  expect(migratedReferenceSystem({ ...conversation, tags: [] })).toBeUndefined();
});

it('shows image idea and template while hiding preparation instructions', () => {
  const request = createMessageBody(imageRequest('Чашка', 'Фото [PRODUCT]'), 'image', { uid: 'IMAGE' }, [12]);
  expect(request.files).toEqual([12]);
  expect(displayMessageText(request.text)).toBe('Идея:\nЧашка\n\nШаблон:\nФото [PRODUCT]');
  expect(displayMessageText('Чужое сообщение')).toBe('Чужое сообщение');
});

it('binds the displayed model alias to its exact ID without exposing the instruction in the thread', () => {
  const lite = {
    ...model,
    reference: { provider: 'OPEN_ROUTER_IMAGE', model: 'google/gemini-3.1-flash-lite-image' },
  } as IModelDescription;
  const tool = toolSettings('image', lite, { resolution: '1K' });
  const body = createMessageBody(
    imageRequest('Создай чашку на Nano Banana 2 Lite', ''),
    'image',
    tool,
    [],
    true,
    'Nano Banana 2 Lite',
  );
  expect(body.text).toContain(JSON.stringify({ name: 'Nano Banana 2 Lite', ...lite.reference }));
  expect(body.settings.tools).toEqual([{ ...tool, isRequired: true }]);
  expect(displayMessageText(body.text)).toBe('Идея:\nСоздай чашку на Nano Banana 2 Lite');
});

it('separates studio settings from user text without changing the sent context', () => {
  const source = 'Хочу ролик.\nСтруктура: мой собственный текст';
  const context =
    'Сценарий для ролика длительностью 8 с, формат 9:16. Не увеличивай длительность.\n\nСтруктура: Один кадр';
  const request =
    '[Genfactory:script]\nСлужебная инструкция\n\nЗапрос пользователя:\n' +
    withMessageContext(source, context);
  expect(displayMessageText(request)).toBe(source);
  expect(request).toContain(JSON.stringify(context));
  const ownMarker = source + '\n\n[Genfactory:context]\n"Цитата пользователя"\n[/Genfactory:context]';
  expect(
    displayMessageText(
      '[Genfactory:script]\nИнструкция\n\nЗапрос пользователя:\n' + withMessageContext(ownMarker, context),
    ),
  ).toBe(ownMarker);
  expect(displayMessageText(ownMarker)).toBe(ownMarker);
});

it('hides the exact old studio footer from conversation 121 but preserves ordinary text', () => {
  const source = 'Короткое видео, где ребенок бьется с зомби и побежает, фото приложу';
  const footer =
    '\n\nСценарий для ролика длительностью 8 с, формат 9:16. Не увеличивай длительность.\n\nСтруктура: Один кадр';
  expect(
    displayMessageText('[Genfactory:script]\nИнструкция\n\nЗапрос пользователя:\n' + source + footer),
  ).toBe(source);
  expect(displayMessageText(source + footer)).toBe(source + footer);
});
