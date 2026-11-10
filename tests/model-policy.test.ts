import { describe, expect, it } from 'vitest';
import { isAllowedProvider, assertAllowedProvider, assertAllowedTools } from '../src/lib/modelPolicy';
describe('OpenRouter-only client policy', () => {
  it.each([
    'OPEN_ROUTER_CONVERSATION',
    'OPEN_ROUTER_TEXT',
    'OPEN_ROUTER_IMAGE',
    'OPEN_ROUTER_VIDEO',
    'OPEN_ROUTER_TTS',
    'OPEN_ROUTER_STT',
  ])('allows %s', (provider) => {
    expect(isAllowedProvider(provider)).toBe(true);
    expect(() => assertAllowedProvider(provider)).not.toThrow();
  });
  it.each([
    'OPEN_AI_CONVERSATION',
    'OPEN_AI_IMAGE_GPT',
    'ANTHROPIC_CONVERSATION',
    'NOSTRA_TEXT',
    'OPEN_ROUTER_FAKE',
    undefined,
  ])('rejects %s', (provider) => {
    expect(isAllowedProvider(provider)).toBe(false);
    expect(() => assertAllowedProvider(provider)).toThrow('только модели OpenRouter');
  });
  it('rejects a direct provider nested inside tool settings', () => {
    expect(() =>
      assertAllowedTools([{ uid: 'IMAGE', settings: { model: { provider: 'OPEN_AI_IMAGE_GPT' } } }]),
    ).toThrow('OpenRouter');
    expect(() =>
      assertAllowedTools([{ uid: 'IMAGE', settings: { model: { provider: 'OPEN_ROUTER_IMAGE' } } }]),
    ).not.toThrow();
  });
});
