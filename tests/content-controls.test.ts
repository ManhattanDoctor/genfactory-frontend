import { describe, expect, it } from 'vitest';
import catalog from './fixtures/catalog.json';
import { choices, ratioSizes } from '../src/features/content-studio/controls';
import { mediaOptions } from '../src/features/content-studio/request';
import type { IModelDescription } from '../src/lib/types';
const image = catalog[0] as unknown as IModelDescription;

describe('Content studio model settings', () => {
  it('uses a model enum instead of the prototype duration suggestions', () => {
    expect(choices({ type: 'number', enum: [5, 10] }, [4, 6, 8, 10, 15])).toEqual([5, 10]);
    expect(choices({ type: 'number', minimum: 6, maximum: 10 }, [4, 6, 8, 10, 15])).toEqual([6, 8, 10]);
    expect(choices({ type: 'boolean', const: false }, [false, true])).toEqual([false]);
    expect(choices(undefined, ['720p'])).toEqual([]);
  });
  it('maps portrait and landscape to actual supported sizes without sending aspectRatio', () => {
    const model = structuredClone(image);
    model.schema.properties!.options!.properties!.size = {
      type: 'string',
      enum: ['auto', '1024x1024', '1536x1024', '1024x1536'],
      default: '1024x1024',
    };
    expect([...ratioSizes(model).keys()]).toEqual(['auto', '1:1', '3:2', '2:3']);
    expect(mediaOptions(model, 'image', 'A cup', [], { aspectRatio: '2:3', quality: 'low' })).toMatchObject({
      size: '1024x1536',
      quality: 'low',
    });
    expect(mediaOptions(model, 'image', 'A cup', [], { aspectRatio: '3:2' })).not.toHaveProperty(
      'aspectRatio',
    );
    expect(() => mediaOptions(model, 'image', 'A cup', [], { aspectRatio: '9:16' })).toThrow('формат');
  });
  it('does not pretend an unsupported option has been applied', () => {
    expect(() => mediaOptions(image, 'image', 'A cup', [], { aspectRatio: '1:1', quality: '720p' })).toThrow(
      'Настройки',
    );
    expect(() => mediaOptions(image, 'image', 'A cup', [], { generateAudio: true })).toThrow('звука');
  });
});

it('Grok Lite follows a reference frame while text-to-video keeps the selected ratio', () => {
  const model = structuredClone(
    catalog.find((m) => m.reference.provider === 'OPEN_ROUTER_VIDEO'),
  ) as unknown as IModelDescription;
  model.reference.model = 'x-ai/grok-imagine-video-1.5-lite';
  const file = { id: 12, type: 'IMAGE', path: '/cup.png' } as any;
  const values = { aspectRatio: '9:16', duration: 8, resolution: '720p', generateAudio: true };
  const withFrame = mediaOptions(model, 'video', 'A cup', [file], values);
  expect(withFrame).not.toHaveProperty('aspectRatio');
  expect(withFrame).toMatchObject({ duration: 8, resolution: '720p', generateAudio: true });
  expect(mediaOptions(model, 'video', 'A cup', [], values)).toHaveProperty('aspectRatio', '9:16');
});

it('restores video conditioning from owned files instead of retaining historical URLs in settings', () => {
  const seedance = structuredClone(
    catalog.find((item) => item.reference.model === 'bytedance/seedance-2.5'),
  ) as unknown as IModelDescription;
  seedance.schema.properties!.task!.properties!.fileIds = {
    type: 'array',
    maxItems: 30,
    items: { type: 'integer' },
  };
  seedance.schema.properties!.options!.properties!.inputReferences = {
    type: 'array',
    maxItems: 30,
    items: {
      type: 'object',
      properties: { url: { type: 'string' }, type: { const: 'image' } },
      required: ['url', 'type'],
    },
  };
  const files = [14, 8, 23, 6].map((id) => ({
    id,
    path: `https://storage.test/${id}.png`,
    type: 'IMAGE',
  })) as import('../src/lib/types').IGnosisFile[];
  const options = mediaOptions(
    seedance,
    'video',
    'All four toys',
    files,
    {
      duration: 4,
      resolution: '480p',
      inputReferences: [{ url: 'https://old.test/only-one.png', type: 'image' }],
    },
    'references',
  );
  expect(options).not.toHaveProperty('inputReferences');
  expect(options).not.toHaveProperty('frameImages');
  expect(() =>
    mediaOptions(
      seedance,
      'video',
      'Frames',
      files.slice(0, 2),
      {
        duration: 4,
        resolution: '480p',
        frameImages: [{ url: 'https://old.test/one.png', type: 'first_frame' }],
      },
      'frames',
    ),
  ).not.toThrow();
});
