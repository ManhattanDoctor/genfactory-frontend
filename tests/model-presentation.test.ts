import { describe, expect, it } from 'vitest';
import { modelTitle, modelSummary } from '../src/features/catalog/presentation';
import type { IModelDescription } from '../src/lib/types';
const model = (id: string, name: string): IModelDescription => ({
  reference: { provider: 'OPEN_ROUTER_IMAGE', model: id },
  name,
  schema: {},
  capabilities: ['IMAGE_OUTPUT'],
});
describe('user-facing model labels', () => {
  it.each([
    ['openai/gpt-image-2', 'OpenAI: GPT Image 2', 'GPT Image 2'],
    ['google/gemini-3-pro-image', 'Google: Gemini 3 Pro Image', 'Gemini 3 Pro Image'],
    ['krea/krea-2-large', 'Krea: Krea 2 Large', 'Krea 2 Large'],
    ['gpt-image-2', 'gpt-image-2', 'GPT Image 2'],
  ])('normalizes %s without changing its identity', (id, name, title) => {
    const item = model(id, name),
      before = structuredClone(item);
    expect(modelTitle(item)).toBe(title);
    expect(item).toEqual(before);
  });
  it('keeps short descriptions usable and retains the verified Krea editing limitation', () => {
    for (const id of [
      'krea/krea-2-large',
      'black-forest-labs/flux.2-pro',
      'qwen/qwen-image-3',
      'unknown/new-image',
    ]) {
      const summary = modelSummary(model(id, id));
      expect(summary.length).toBeLessThanOrEqual(150);
      expect(summary).not.toMatch(/Референсы|IMAGE_INPUT|OPEN_ROUTER/);
    }
    expect(modelSummary(model('krea/krea-2-large', 'Krea'))).toContain('форма предмета может измениться');
  });
});
