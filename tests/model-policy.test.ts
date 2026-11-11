import { describe, expect, it } from 'vitest';
import {
  isAllowedProvider,
  assertAllowedProvider,
  assertAllowedTools,
  effectiveTools,
  prepareAllowedTools,
} from '../src/lib/modelPolicy';
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

describe('effective tool policy', () => {
  const saved = [
    {
      uid: 'IMAGE',
      settings: {
        model: { provider: 'OPEN_ROUTER_IMAGE', model: 'test-image' },
        options: { resolution: '2K', seed: 1 },
      },
    },
  ];
  it('pins an unconfigured image tool and keeps non-model tools unchanged', async () => {
    const tools = await prepareAllowedTools(
      ['IMAGE', 'DOCUMENT_READ'],
      async () => [{ reference: saved[0].settings.model }] as any,
    );
    expect(tools).toEqual([
      { uid: 'IMAGE', settings: { model: saved[0].settings.model, isLockSelection: true } },
      { uid: 'DOCUMENT_READ' },
    ]);
  });
  it('pins a saved preferred model even when switching models was previously allowed', async () => {
    const tools = await prepareAllowedTools(saved, async () => {
      throw Error('No discovery needed');
    });
    expect(tools![0].settings).toEqual({ ...saved[0].settings, isLockSelection: true });
    expect(saved[0].settings).not.toHaveProperty('isLockSelection');
  });
  it('preserves settings for a required-only override and merges same-model options', () => {
    expect(effectiveTools(saved, [{ uid: 'IMAGE', isRequired: true }])[0]).toMatchObject({
      ...saved[0],
      isRequired: true,
    });
    const tools = effectiveTools(saved, [
      { uid: 'IMAGE', settings: { model: saved[0].settings.model, options: { seed: 2 } } },
    ]);
    expect(tools[0].settings?.options).toEqual({ resolution: '2K', seed: 2 });
    expect(saved[0].settings.options.seed).toBe(1);
  });
  it('checks inherited direct-provider settings when there are no overrides', async () => {
    const tools = effectiveTools(
      [{ uid: 'IMAGE', settings: { model: { provider: 'OPEN_AI_IMAGE_GPT', model: 'gpt-image-1' } } }],
      [],
    );
    await expect(prepareAllowedTools(tools, async () => [])).rejects.toThrow('OpenRouter');
  });
  it('fails before sending when an unconfigured model tool has no allowed model', async () => {
    await expect(prepareAllowedTools(['IMAGE'], async () => [])).rejects.toThrow('Нет доступной модели');
  });
  it('rejects disconnected, duplicate and direct-only tools', () => {
    expect(() => effectiveTools(saved, [{ uid: 'TTS' }])).toThrow();
    expect(() => effectiveTools(saved, [{ uid: 'IMAGE' }, { uid: 'IMAGE' }])).toThrow();
    expect(() => assertAllowedTools(['IMAGE_RECOGNITION'])).toThrow('OpenRouter');
  });
});
