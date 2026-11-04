import type { IModelDescription, ISchema } from '../../lib/types';

export const suggestedRatios = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'];
/** Use enumerated/constant values when available. Suggestions are not provider guarantees. */
export function choices<T extends string | number | boolean>(
  field: ISchema | undefined,
  suggestions: T[],
): T[] {
  if (!field) return [];
  const candidates = field.const !== undefined ? [field.const] : field.enum || suggestions;
  return candidates.filter(
    (value): value is T =>
      ['string', 'number', 'boolean'].includes(typeof value) &&
      (typeof value !== 'number' ||
        ((field.minimum === undefined || value >= field.minimum) &&
          (field.maximum === undefined || value <= field.maximum))) &&
      (typeof value !== 'string' || !field.pattern || new RegExp(field.pattern).test(value)),
  );
}
export function sizeRatio(size: string): string {
  if (size === 'auto') return 'auto';
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return size;
  const width = Number(match[1]),
    height = Number(match[2]);
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const divisor = gcd(width, height);
  return divisor ? `${width / divisor}:${height / divisor}` : size;
}
export function ratioSizes(model?: IModelDescription): Map<string, string> {
  const properties = model?.schema.properties?.options?.properties || {};
  if (properties.aspectRatio || !properties.size) return new Map();
  const sizes = choices(
    properties.size,
    [String(properties.size.default || ''), '1024x1024', '1536x1024', '1024x1536'].filter(Boolean),
  );
  const pairs = new Map<string, string>();
  for (const size of sizes) if (!pairs.has(sizeRatio(size))) pairs.set(sizeRatio(size), size);
  return pairs;
}
