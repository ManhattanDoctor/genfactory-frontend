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
