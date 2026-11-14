import { describe, expect, it } from 'vitest';
import type { IModelDescription, ISchema } from '../src/lib/types';
import type { ITemplate } from '../src/features/content-studio/materials';
import {
  fitTemplateDuration,
  resolveTemplateDuration,
} from '../src/features/content-studio/templateDuration';
import { syncTemplateDuration, templateTimingError } from '../src/features/content-studio/templateRecipe';
const item: ITemplate = {
  id: 'test',
  title: 'Test',
  genre: '',
  src: '/test.mp4',
  ratio: '9:16',
  kind: 'video',
  recommendedDuration: 12,
  prompt:
    'Duration: 12-second video. 0-3 seconds: begin. 3-12 seconds: finish. Flash at 6 seconds. Camera clock 3:15 AM, 16:9, 360-degree turn.',
};
const model = (field: ISchema): IModelDescription => ({
  name: 'Test',
  reference: { provider: 'TEST', model: 'test' },
  schema: { properties: { options: { properties: { duration: field } } } },
});
describe('template duration policy', () => {
  it('preserves the explicit form duration and adapts total, scenes and event points', () => {
    const result = fitTemplateDuration(item, 8, model({ type: 'integer', enum: [4, 8, 12] }));
    expect(result.recommendedDuration).toBe(12);
    expect(result.prompt).toBe(
      'Duration: 8-second video. 0-2 seconds: begin. 2-8 seconds: finish. Flash at 4 seconds. Camera clock 3:15 AM, 16:9, 360-degree turn.',
    );
    expect(item.prompt).toContain('12-second');
    expect(templateTimingError(result.prompt, 8)).toBeUndefined();
  });
  it('uses the recommendation only when the form has no duration', () => {
    expect(resolveTemplateDuration(item, undefined, model({ type: 'integer', enum: [8, 12] }))).toBe(12);
    expect(() => resolveTemplateDuration(item, 0, model({ type: 'integer', enum: [8, 12] }))).toThrow();
  });
  it.each([0, -1, 3, 4.5, NaN, Infinity, '4'])(
    'rejects unsupported values without silently clamping %s',
    (value) => {
      expect(() =>
        resolveTemplateDuration(item, value, model({ type: 'integer', enum: [4, 6, 8] })),
      ).toThrow();
    },
  );
  it('uses the existing JSON schema validator for const, boundaries and multiples', () => {
    expect(resolveTemplateDuration(item, 8, model({ const: 8 }))).toBe(8);
    expect(() => resolveTemplateDuration(item, 6, model({ const: 8 }))).toThrow();
    expect(
      resolveTemplateDuration(item, 10, model({ type: 'integer', minimum: 4, maximum: 12, multipleOf: 2 })),
    ).toBe(10);
    expect(() =>
      resolveTemplateDuration(item, 7, model({ type: 'integer', minimum: 4, maximum: 12, multipleOf: 2 })),
    ).toThrow();
    expect(() => resolveTemplateDuration(item, 8, undefined)).toThrow();
  });
  it('synchronizes only catalogue timing and detects conflicts before sending', () => {
    expect(syncTemplateDuration('My own 12-second idea', 8)).toBe('My own 12-second idea');
    expect(templateTimingError(item.prompt, 8)).toBeTruthy();
    expect(templateTimingError(item.prompt.replace('3-12', '3-14'), 12)).toBeTruthy();
    expect(syncTemplateDuration(syncTemplateDuration(item.prompt, 8), 12)).toBe(item.prompt);
  });
});
