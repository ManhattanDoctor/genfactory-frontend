import { followsReferenceRatio } from '../src/features/catalog/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  videoInputOptions,
  videoReferenceMode,
  validateVideoReferenceMetadata,
} from '../src/features/catalog/videoInputs';
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
    expect(body.references).toEqual([4, 1, 9, 2].map((id) => ({ type: 'FILE', id })));
    expect(body.settings.tools[0].input).toEqual({
      references: [4, 1, 9, 2].map((id) => ({ type: 'FILE', id })),
      referenceMode: 'references',
    });
  });
  it('pins an empty selection to avoid silently using an old conversation image', () => {
    expect(createMessageBody('Видео', 'video', { uid: 'VIDEO' }, []).settings.tools[0].input).toEqual({
      references: [],
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

describe('video metadata limits before a paid request', () => {
  afterEach(() => vi.unstubAllGlobals());
  const wan: IModelDescription = structuredClone(mixedModel);
  wan.schema.properties!.options!.properties!.inputReferences!['x-referenceLimits']!.video = {
    maxItems: 5,
    minSide: 240,
    maxSide: 4096,
    maxAspectRatio: 8,
    minDuration: 1,
    maxTotalDuration: 15,
    maxCombinedDuration: 30,
  };
  const clip = { type: 'VIDEO', path: 'https://files.test/video.mp4' } as IGnosisFile;
  it.each([
    [1280, 720, 2, 1, 4, undefined],
    [1280, 720, 3, 5, 15, undefined],
    [1280, 720, 4, 4, 4, 'Общая длительность'],
    [1280, 720, 10, 1, 21, 'Сумма длительности'],
    [1280, 720, 0.5, 1, 4, 'не меньше 1 с'],
    [1280, 200, 2, 1, 4, 'не меньше 240'],
    [5000, 720, 2, 1, 4, 'не больше 4096'],
    [3000, 240, 2, 1, 4, '8:1'],
    [1280, 720, Infinity, 1, 4, 'Не удалось прочитать'],
  ])('validates %sx%s, %ss × %s with output %ss', async (width, height, duration, count, output, error) => {
    const released = vi.fn();
    vi.stubGlobal('document', {
      createElement: () => {
        const video = {
          videoWidth: width,
          videoHeight: height,
          duration,
          onloadedmetadata: undefined as (() => void) | undefined,
          onerror: undefined as (() => void) | undefined,
          set src(_value: string) {
            queueMicrotask(() => this.onloadedmetadata?.());
          },
          removeAttribute: released,
          load: vi.fn(),
        };
        return video;
      },
    });
    const result = validateVideoReferenceMetadata(wan, Array(count).fill(clip), output);
    if (error) await expect(result).rejects.toThrow(error);
    else await expect(result).resolves.toBeUndefined();
    expect(released).toHaveBeenCalledWith('src');
  });
});
