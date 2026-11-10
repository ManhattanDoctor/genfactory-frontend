import { describe, expect, it } from 'vitest';
import { defaultAssistant, DEFAULT_ASSISTANT } from '../src/features/catalog/defaultAssistant';
import type { IModelDescription } from '../src/lib/types';
const model = (
  provider: string,
  name: string,
  status: IModelDescription['status'] = 'ACTIVE',
): IModelDescription => ({
  reference: { provider, model: name },
  name,
  status,
  capabilities: ['TEXT_INPUT', 'TEXT_OUTPUT', 'TOOLS'],
  schema: {},
});
describe('new content studio assistant selection', () => {
  const gpt = model('OPEN_ROUTER_CONVERSATION', 'deepseek/deepseek-chat');
  const opus = model(DEFAULT_ASSISTANT.provider, DEFAULT_ASSISTANT.model);
  it('selects Opus through OpenRouter independently of catalogue order', () => {
    expect(defaultAssistant([gpt, opus])).toBe(opus);
    expect(defaultAssistant([opus, gpt])).toBe(opus);
  });
  it('does not select the direct Anthropic provider instead', () => {
    expect(defaultAssistant([model('ANTHROPIC_CONVERSATION', 'claude-opus-5-5'), gpt, opus])).toBe(opus);
  });
  it.each(['HIDDEN', 'DISABLED'] as const)('does not select an unavailable %s Opus', (status) => {
    expect(defaultAssistant([model(DEFAULT_ASSISTANT.provider, DEFAULT_ASSISTANT.model, status), gpt])).toBe(
      gpt,
    );
  });
});
