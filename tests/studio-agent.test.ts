import { describe, expect, it } from 'vitest';
import {
  parseStudioQuestion,
  STUDIO_QUESTION_PREFIX,
  withStudioContext,
  parseStudioContext,
} from '../src/features/content-studio/studioAgent';
import { createMessageBody, displayMessageText } from '../src/features/studio/conversations';
import { effectiveTools } from '../src/lib/modelPolicy';
const context = {
  uid: 'VIDEO' as const,
  settings: {
    model: { provider: 'OPEN_ROUTER_VIDEO', model: 'bytedance/seedance-2.5' },
    isLockSelection: true,
    options: { duration: 4 },
  },
  input: { fileIds: [14, 8, 23, 6], referenceMode: 'references' },
};
const question = {
  kind: 'question',
  question: 'Что выделить?',
  choices: ['Товар', 'Атмосферу'],
  allowAuto: true,
  context,
};
describe('Studio agent protocol', () => {
  it('restores a saved question and original selection', () =>
    expect(parseStudioQuestion(STUDIO_QUESTION_PREFIX + JSON.stringify(question))).toEqual(question));
  it.each([
    {},
    { ...question, choices: ['Один'] },
    { ...question, choices: ['Товар', 'Товар'] },
    { ...question, allowAuto: 'true' },
    { ...question, context: { ...context, input: { fileIds: [14, 14] } } },
    { ...question, context: { ...context, uid: 'YANDEX' } },
  ])('rejects malformed structured content %j', (value) =>
    expect(parseStudioQuestion(STUDIO_QUESTION_PREFIX + JSON.stringify(value))).toBeUndefined(),
  );
  it('does not interpret free text/JSON as a question', () => {
    expect(parseStudioQuestion(JSON.stringify(question))).toBeUndefined();
    expect(parseStudioQuestion('Какой фон?')).toBeUndefined();
  });
  it('leaves the agent free to choose tools without any new backend fields', () => {
    const body = createMessageBody(
      'Белая чашка',
      'video',
      { uid: context.uid, settings: context.settings },
      [14, 8, 23, 6],
      true,
      undefined,
      'references',
      true,
    );
    expect(body.settings.tools).toEqual([{ uid: context.uid, settings: context.settings }]);
    const effective = effectiveTools([{ uid: 'VIDEO', settings: context.settings }], body.settings.tools)[0];
    expect(effective.isRequired).not.toBe(true);
    expect(effective.input).toBeUndefined();
    expect(displayMessageText(body.text)).toBe('Белая чашка');
  });
  it('stores selection in the user message for question buttons, not in server request settings', () => {
    const body = createMessageBody(
      'Фото',
      'image',
      { uid: 'IMAGE', settings: context.settings },
      [14, 8],
      true,
      undefined,
      undefined,
      true,
    );
    const selected = {
      ...context,
      uid: 'IMAGE' as const,
      input: { request: { task: { fileIds: [14, 8] } }, isDrawNew: false },
    };
    body.text = withStudioContext(body.text, selected);
    expect(body.settings.tools[0].input).toBeUndefined();
    expect(parseStudioContext(body.text)).toEqual(selected);
    expect(displayMessageText(body.text)).toBe('Фото');
  });
  it('uses the original user selection rather than model-supplied context', () => {
    const text =
      STUDIO_QUESTION_PREFIX + JSON.stringify({ ...question, context: { ...context, uid: 'YANDEX' } });
    expect(parseStudioQuestion(text, withStudioContext('Бриф', context))?.context).toEqual(context);
  });
});

import { studioSystem, STUDIO_SYSTEM_PROMPT } from '../src/features/content-studio/studioPrompt';
it('updates a versioned policy in existing conversations without duplicating it or removing project rules', () => {
  const first = studioSystem('Сохраняй фирменный синий цвет.');
  const updated = studioSystem(first);
  expect(updated).toBe(first);
  expect(updated).toContain('Сохраняй фирменный синий цвет.');
  expect(updated).toContain(STUDIO_SYSTEM_PROMPT);
  expect(updated.match(/\[Genfactory:studio-policy:v2\]/g)).toHaveLength(1);
});

it('keeps historical materials in the original question context without reattaching them or forcing a tool', () => {
  const snapshot = {
    ...context,
    input: { fileIds: [], referenceMode: 'frames' },
    historyFiles: [{ id: 1602, name: 'chair.png', type: 'IMAGE', role: 'USER' as const, messageId: 19622 }],
  };
  const body = createMessageBody(
    'Сделай постер этого кресла',
    'video',
    { uid: 'VIDEO', settings: context.settings },
    [],
    false,
    undefined,
    undefined,
    true,
  );
  body.text = withStudioContext(body.text, snapshot);
  expect(body.files).toEqual([]);
  expect(body.settings.tools).toEqual([{ uid: 'VIDEO', settings: context.settings }]);
  expect(displayMessageText(body.text)).toBe('Сделай постер этого кресла');
  expect(
    parseStudioQuestion(
      STUDIO_QUESTION_PREFIX + JSON.stringify({ ...question, context: undefined }),
      body.text,
    )?.context,
  ).toEqual(snapshot);
});
