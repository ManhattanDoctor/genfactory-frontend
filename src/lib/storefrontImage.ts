import previews from './imagePreviews.json';

const images: Readonly<Record<string, string>> = previews;

export function storefrontImage(src: string, edge: 640 | 1920): string;
export function storefrontImage(src: string | undefined, edge: 640 | 1920): string | undefined;
export function storefrontImage(src: string | undefined, edge: 640 | 1920): string | undefined {
  const digest = src?.startsWith('/media/') && images[src];
  return digest ? `/media/previews/${digest}-${edge}.webp` : src;
}
