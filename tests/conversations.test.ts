import { describe, expect, it } from 'vitest';
import {
  connection,
  createConversationBody,
  createMessageBody,
  toolSettings,
} from '../src/features/studio/conversations';
import type { Conversation, ModelDescription } from '../src/lib/types';
const model: ModelDescription = {
  reference: { provider: 'OPEN_ROUTER_VIDEO', model: 'video-model' },
  name: 'Video',
  schema: {},
};
const agent: ModelDescription = {
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
    expect(body.settings.tools).toEqual([tool]);
    expect(JSON.stringify(body)).not.toContain('frameImages');
  });
  it('explicitly prevents reuse of old images for a fresh generation', () => {
    const body = createMessageBody('Ocean', 'image', { uid: 'IMAGE' }, []);
    expect(body.text).toContain('без референсов');
    expect(body.files).toEqual([]);
  });
  it('recognizes universal string connections and does not silently add a missing tool', () => {
    const conversation = { options: { tools: ['IMAGE'] } } as Conversation;
    expect(connection(conversation, 'image')).toEqual({ uid: 'IMAGE' });
    expect(connection(conversation, 'video')).toBeUndefined();
  });
});
