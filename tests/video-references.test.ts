import { followsReferenceRatio } from '../src/features/catalog/schema';
import { describe, expect, it } from 'vitest';
import { videoInputOptions, videoReferenceMode } from '../src/features/catalog/videoInputs';
import { createMessageBody } from '../src/features/studio/conversations';
import type { IModelDescription, IGnosisFile } from '../src/lib/types';
const seedance: IModelDescription = {
  name: 'Seedance 2.5',
  reference: { provider: 'OPEN_ROUTER_VIDEO', model: 'bytedance/seedance-2.5' },
  schema: {
    properties: {
      options: {
        properties: {
          frameImages: { type: 'array', maxItems: 2 },
          inputReferences: { type: 'array', maxItems: 30 },
        },
      },
    },
  },
};
const files = [4, 1, 9, 2].map((id) => ({
  id,
  path: `https://example.test/${id}.jpg`,
  type: 'IMAGE',
})) as IGnosisFile[];
describe('video selected references', () => {
  it('sends all four Seedance images in order through reference mode', () => {
    const mode = videoReferenceMode(seedance, files.length);
    expect(mode).toBe('references');
    const options = videoInputOptions(seedance, files, mode);
    expect(options).toEqual({ inputReferences: files.map((file) => ({ url: file.path, type: 'image' })) });
    const body = createMessageBody(
      'Анимируй',
      'video',
      { uid: 'VIDEO' },
      files.map((file) => file.id),
      false,
      undefined,
      mode,
    );
    expect(body.files).toEqual([4, 1, 9, 2]);
    expect(body.settings.tools[0].input).toEqual({ fileIds: [4, 1, 9, 2], referenceMode: 'references' });
  });
  it('pins an empty selection to avoid silently using an old conversation image', () => {
    expect(createMessageBody('Видео', 'video', { uid: 'VIDEO' }, []).settings.tools[0].input).toEqual({
      fileIds: [],
    });
  });
  it('keeps explicit start/end frames separate', () => {
    const mode = videoReferenceMode(seedance, 2, true);
    expect(mode).toBe('frames');
    expect(
      videoInputOptions(seedance, files.slice(0, 2), mode).frameImages?.map((file) => file.type),
    ).toEqual(['first_frame', 'last_frame']);
    expect(() => videoInputOptions(seedance, files, mode)).toThrow();
  });
  it('rejects excessive photos for single-frame models', () => {
    const single = {
      ...seedance,
      schema: { properties: { options: { properties: { frameImages: { type: 'array', maxItems: 1 } } } } },
    } as IModelDescription;
    expect(() => videoInputOptions(single, files, videoReferenceMode(single, files.length))).toThrow();
  });
});

it('Wan references keep the chosen aspect ratio while frame conditioning follows the first image', () => {
  const wan = { ...seedance, reference: { provider: 'OPEN_ROUTER_VIDEO', model: 'alibaba/wan-3.0' } };
  expect(followsReferenceRatio(wan, 4)).toBe(false);
  expect(followsReferenceRatio(wan, 2, 'frames')).toBe(true);
});

const mixedModel: IModelDescription = {
  ...seedance,
  schema: {
    properties: {
      options: {
        properties: {
          inputReferences: {
            type: 'array',
            maxItems: 40,
            items: { properties: { type: { enum: ['image', 'video'] } } },
            'x-referenceLimits': {
              image: { maxItems: 30 },
              video: {
                maxItems: 10,
                maxBytes: 200 * 1024 * 1024,
                mimeTypes: ['video/mp4', 'video/quicktime'],
              },
            },
          },
          frameImages: { type: 'array', maxItems: 2 },
        },
      },
    },
  },
};
it('keeps image and video reference order and rejects incompatible selections', () => {
  const clip = {
    id: 77,
    type: 'VIDEO',
    path: 'https://files.test/clip.mp4',
    mime: 'video/mp4',
    size: 1024,
  } as IGnosisFile;
  expect(videoInputOptions(mixedModel, [clip, files[0]], 'references').inputReferences).toEqual([
    { url: clip.path, type: 'video' },
    { url: files[0].path, type: 'image' },
  ]);
  expect(() => videoInputOptions(seedance, [clip], 'references')).toThrow();
  expect(() => videoInputOptions(mixedModel, [clip], 'frames')).toThrow();
  expect(() => videoInputOptions(mixedModel, Array(11).fill(clip), 'references')).toThrow();
  expect(() => videoInputOptions(mixedModel, [{ ...clip, size: 201 * 1024 * 1024 }], 'references')).toThrow();
});

it('accepts one Grok first-frame image without reference mode support', () => {
  const grok = {
    ...seedance,
    schema: { properties: { options: { properties: { frameImages: { type: 'array', maxItems: 1 } } } } },
  } as IModelDescription;
  expect(videoInputOptions(grok, files.slice(0, 1), videoReferenceMode(grok, 1)).frameImages).toEqual([
    { url: files[0].path, type: 'first_frame' },
  ]);
});
