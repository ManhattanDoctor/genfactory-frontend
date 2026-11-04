import type { ITemplate } from './materials';
import labels from './templateFields.json';

export function templateVariables(text: string): string[] {
  return [...new Set([...text.matchAll(/\[([A-Za-z][A-Za-z_0-9 ]*)\]/g)].map((match) => match[1]))];
}
export function templateVariableLabel(key: string): string {
  return (labels as Record<string, string>)[key] || key;
}
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\[([A-Za-z][A-Za-z_0-9 ]*)\]/g, (match, key) => values[key]?.trim() || match);
}
const optionalReferences = new Set([
  'image:10',
  'image:26',
  'image:27',
  'image:29',
  'image:62',
  'image:123',
  'video:media/creatives/19.mp4',
  'video:media/creatives/28.mp4',
  'video:media/creatives/29.mp4',
]);
export function templateReference(item: ITemplate): 'required' | 'optional' | 'none' {
  if (item.kind === 'presentation') return 'none';
  if (optionalReferences.has(item.id)) return 'optional';
  return /\breference\b|@Image\d+/i.test(item.prompt) ? 'required' : 'optional';
}
export function templateDuration(text: string): number | undefined {
  const match = text.match(/\b(\d+(?:\.\d+)?)-second\b/);
  return match ? Number(match[1]) : undefined;
}
export function adaptTemplateDuration(text: string, duration: number): string {
  const original = templateDuration(text);
  if (!original || !Number.isFinite(duration) || duration <= 0) return text;
  const scale = (value: string) => String(Math.round(((Number(value) * duration) / original) * 100) / 100);
  return text
    .replace(
      /(\d+(?:\.\d+)?)[-–](\d+(?:\.\d+)?)\s*(seconds|s)\b/g,
      (_, start, end, unit) => `${scale(start)}-${scale(end)} ${unit}`,
    )
    .replace(/\b\d+(?:\.\d+)?-second\b/g, `${duration}-second`);
}
