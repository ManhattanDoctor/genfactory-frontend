import { describe, expect, it } from 'vitest';
import { videoDefaults } from '../src/features/studio/videoSettings';
import { createMessageBody, displayMessageText, videoRequest } from '../src/features/studio/conversations';
import type { IModelDescription, ISchema } from '../src/lib/types';
function model(properties: Record<string, ISchema>): IModelDescription {
  return {
    reference: { provider: 'OPEN_ROUTER_VIDEO', model: 'test' },
    name: 'Test',
    schema: { properties: { options: { properties } } },
  };
}
describe('Video canvas settings', () => {
  it('respects fixed audio and confirmed duration/ratio rather than generic defaults', () => {
    expect(
      videoDefaults(
        model({
          duration: { type: 'integer', enum: [4, 6] },
          aspectRatio: { type: 'string', enum: ['16:9'] },
          generateAudio: { type: 'boolean', const: true, default: true },
        }),
      ),
    ).toEqual({ duration: 4, aspectRatio: '16:9', generateAudio: true });
    expect(videoDefaults(model({ generateAudio: { type: 'boolean', const: false } }))).toEqual({
      generateAudio: false,
    });
    expect(videoDefaults(model({}))).toEqual({});
  });
  it('preserves schema defaults and keeps shape in instructions, not provider settings', () => {
    expect(
      videoDefaults(
        model({
          duration: { type: 'integer', enum: [4, 8], default: 4 },
          aspectRatio: { type: 'string', enum: ['1:1', '9:16'], default: '1:1' },
        }),
      ),
    ).toEqual({ duration: 4, aspectRatio: '1:1' });
    const body = createMessageBody(
      videoRequest('Чашка', 'Поворот {PRODUCT}', 'sequence'),
      'video',
      {
        uid: 'VIDEO',
        settings: { model: { provider: 'OPEN_ROUTER_VIDEO', model: 'test' }, options: { duration: 4 } },
      },
      [12],
    );
    expect(body.references).toEqual([12].map((id) => ({ type: 'FILE', id })));
    expect(body.settings.tools[0].settings?.options).toEqual({ duration: 4 });
    expect(body.text).toContain('Несколько последовательных сцен');
    expect(displayMessageText(body.text)).toBe('Идея:\nЧашка\n\nШаблон:\nПоворот {PRODUCT}');
  });
});

it('selects supported Seedance 480p explicitly while preserving catalog defaults and other models', () => {
  const seedance = model({ resolution: { type: 'string', enum: ['480p', '720p'] } });
  seedance.reference.model = 'bytedance/seedance-2.5';
  expect(videoDefaults(seedance).resolution).toBe('480p');
  seedance.schema.properties!.options.properties!.resolution.default = '720p';
  expect(videoDefaults(seedance).resolution).toBe('720p');
  expect(
    videoDefaults(model({ resolution: { type: 'string', enum: ['480p', '720p'] } })).resolution,
  ).toBeUndefined();
});
