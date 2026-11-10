import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEIC_MAX_BYTES, isHeicUpload, isImageUpload, prepareImageUpload } from '../src/lib/image-upload';

const decoder = vi.hoisted(() => ({ isHeic: vi.fn(), heicTo: vi.fn() }));
vi.mock('heic-to/csp', () => decoder);
afterEach(() => vi.resetAllMocks());

describe('HEIC image preparation', () => {
  it('recognizes phone files with missing MIME and MIME-only HEIF', () => {
    expect(isHeicUpload({ name: 'IMG_001.HEIC', type: '' })).toBe(true);
    expect(isHeicUpload({ name: 'photo', type: 'image/heif' })).toBe(true);
    expect(isImageUpload({ name: 'IMG_001.HEIF', type: 'application/octet-stream' })).toBe(true);
    expect(isImageUpload({ name: 'image.heic.exe', type: '' })).toBe(false);
    expect(isImageUpload({ name: 'image.avif', type: 'image/avif' })).toBe(false);
  });

  it('passes supported images and other files unchanged without decoding', async () => {
    const file = new File(['original'], 'photo.jpg', { type: 'image/jpeg' });
    expect(await prepareImageUpload(file)).toBe(file);
    expect(decoder.heicTo).not.toHaveBeenCalled();
  });

  it('converts once to JPEG and preserves the filename stem and modification date', async () => {
    const source = new File(['heic'], 'Фото.HEIC', {
      type: '',
      lastModified: 12345,
    });
    decoder.isHeic.mockResolvedValue(true);
    decoder.heicTo.mockResolvedValue(new Blob(['jpeg-result'], { type: 'image/jpeg' }));
    const [a, b] = await Promise.all([prepareImageUpload(source), prepareImageUpload(source)]);
    expect(a).toBe(b);
    expect(a.name).toBe('Фото.jpg');
    expect(a.type).toBe('image/jpeg');
    expect(a.lastModified).toBe(12345);
    expect(await a.text()).toBe('jpeg-result');
    expect(decoder.heicTo).toHaveBeenCalledExactlyOnceWith({
      blob: source,
      type: 'image/jpeg',
      quality: 0.92,
    });
  });

  it('rejects oversized originals before decoding', async () => {
    const source = new File(['heic'], 'photo.heic');
    Object.defineProperty(source, 'size', { value: HEIC_MAX_BYTES + 1 });
    await expect(prepareImageUpload(source)).rejects.toThrow('до 20 МБ');
    expect(decoder.isHeic).not.toHaveBeenCalled();
  });

  it('does not pass a malformed HEIC through to the server', async () => {
    decoder.isHeic.mockResolvedValue(false);
    await expect(prepareImageUpload(new File(['broken'], 'photo.heic'))).rejects.toThrow(
      'Не удалось преобразовать',
    );
    expect(decoder.heicTo).not.toHaveBeenCalled();
  });

  it('rejects an empty or oversized conversion', async () => {
    decoder.isHeic.mockResolvedValue(true);
    decoder.heicTo.mockResolvedValueOnce(new Blob([], { type: 'image/jpeg' }));
    await expect(prepareImageUpload(new File(['one'], 'one.heic'))).rejects.toThrow(
      'Не удалось преобразовать',
    );
    const oversized = new Blob(['jpeg'], { type: 'image/jpeg' });
    Object.defineProperty(oversized, 'size', { value: HEIC_MAX_BYTES + 1 });
    decoder.heicTo.mockResolvedValueOnce(oversized);
    await expect(prepareImageUpload(new File(['two'], 'two.heic'))).rejects.toThrow('до 20 МБ');
  });

  it('serializes different photos and continues after a decoder failure', async () => {
    let failFirst!: (reason: Error) => void;
    decoder.isHeic.mockResolvedValue(true);
    decoder.heicTo
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            failFirst = reject;
          }),
      )
      .mockResolvedValueOnce(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const first = prepareImageUpload(new File(['one'], 'one.heic'));
    const failed = expect(first).rejects.toThrow('Не удалось преобразовать');
    const second = prepareImageUpload(new File(['two'], 'two.heic'));
    await vi.waitFor(() => expect(decoder.heicTo).toHaveBeenCalledTimes(1));
    failFirst(new Error('Decode failed'));
    await failed;
    expect((await second).name).toBe('two.jpg');
    expect(decoder.heicTo).toHaveBeenCalledTimes(2);
  });
});
