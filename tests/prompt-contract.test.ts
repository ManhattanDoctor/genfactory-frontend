import { expect, it } from 'vitest';
import {
  initialPromptInput,
  promptRequest,
  readPromptInput,
  readPromptResult,
} from '../src/features/prompt/contract';
const ready = {
  status: 'ready',
  title: 'Чашка',
  prompt: 'A cup',
  observations: [{ fileId: 12, text: 'Синяя чашка' }],
  clarifications: [],
  limitations: [],
};
it('persists prompt settings independently of the later editor state', () => {
  const input = { ...initialPromptInput, note: 'Сохранить синий цвет', target: 'banana' as const };
  expect(readPromptInput(promptRequest(input, []))).toEqual(input);
  expect(readPromptInput('[Genfactory:prompt-input] {"task":"missing"}')).toBeUndefined();
});
it('only enables ready results with grounded sources and valid structure', () => {
  expect(readPromptResult(JSON.stringify(ready), [12])?.prompt).toBe('A cup');
  expect(readPromptResult(JSON.stringify(ready), [99])).toBeUndefined();
  expect(readPromptResult(JSON.stringify({ ...ready, prompt: '' }), [12])).toBeUndefined();
  expect(readPromptResult('not json', [12])).toBeUndefined();
  expect(readPromptResult(JSON.stringify({ ...ready, observations: [null] }), [12])).toBeUndefined();
  expect(
    readPromptResult(
      JSON.stringify({ ...ready, status: 'needs_clarification', clarifications: ['Какой фон?'] }),
      [12],
    )?.prompt,
  ).toBeNull();
});
