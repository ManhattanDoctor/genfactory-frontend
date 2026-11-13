export const IMAGE_UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
export const VIDEO_UPLOAD_ACCEPT = 'video/mp4,video/quicktime,.mp4,.mov';
export function isVideoUpload(file: Pick<File, 'type'>): boolean {
  return ['video/mp4', 'video/quicktime'].includes(file.type);
}
export const HEIC_MAX_BYTES = 20 * 1024 * 1024;

export function isHeicUpload(file: Pick<File, 'name' | 'type'>): boolean {
  return /^image\/(heic|heif)(-sequence)?$/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

export function isImageUpload(file: Pick<File, 'name' | 'type'>): boolean {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || isHeicUpload(file);
}

const conversions = new WeakMap<File, Promise<File>>();
// Decode one photo at a time: a compressed phone photo can require a large pixel buffer.
let queue: Promise<unknown> = Promise.resolve();

export function prepareImageUpload(file: File): Promise<File> {
  if (!isHeicUpload(file)) return Promise.resolve(file);
  if (file.size > HEIC_MAX_BYTES)
    return Promise.reject(new Error('Для HEIC/HEIF используйте фотографии до 20 МБ.'));
  const existing = conversions.get(file);
  if (existing) return existing;
  const conversion = queue.then(async () => {
    try {
      // Loaded only for HEIC, bundled locally; no photo is sent to a conversion service.
      const { heicTo, isHeic } = await import('heic-to/csp');
      if (!(await isHeic(file))) throw new Error('Invalid HEIC');
      const jpeg = await heicTo({
        blob: file,
        type: 'image/jpeg',
        quality: 0.92,
      });
      if (!jpeg.size || jpeg.type !== 'image/jpeg') throw new Error('Invalid JPEG');
      if (jpeg.size > HEIC_MAX_BYTES) throw new Error('Converted image too large');
      const base = file.name.replace(/\.(heic|heif)$/i, '') || 'photo';
      return new File([jpeg], `${base}.jpg`, {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      });
    } catch {
      throw new Error(
        'Не удалось преобразовать HEIC/HEIF в JPEG до 20 МБ. Попробуйте другую фотографию или сохраните её в JPEG.',
      );
    }
  });
  conversions.set(file, conversion);
  queue = conversion.catch(() => {
    conversions.delete(file);
  });
  return conversion;
}
