import type { ITemplate } from './materials';
import { PromptTemplate } from './PromptTemplate';
import labels from './templateFields.json';

export function templateVariables(text: string): string[] {
  return new PromptTemplate(text).variables;
}
export function templateVariableLabel(key: string): string {
  return (labels as Record<string, string>)[key] || key;
}
export function fillTemplate(text: string, values: Record<string, string | number>): string {
  return new PromptTemplate(text).fill(values);
}
export function templateReference(item: ITemplate): 'required' | 'optional' | 'none' {
  if (item.references?.max === 0) return 'none';
  return (item.references?.min ?? 0) > 0 ? 'required' : 'optional';
}
export function templateDuration(text: string): number | undefined {
  const match = text.match(/\b(\d+(?:\.\d+)?)-second\b/);
  return match ? Number(match[1]) : undefined;
}
export function adaptTemplateDuration(text: string, duration: number): string {
  const original = templateDuration(text);
  if (!original || !Number.isFinite(duration) || duration <= 0) return text;
  const scale = (value: string) => String(Math.round(((Number(value) * duration) / original) * 1000) / 1000);
  return text
    .replace(
      /(\d+(?:\.\d+)?)[-–](\d+(?:\.\d+)?)\s*(seconds|s)\b/g,
      (_, start, end, unit) => `${scale(start)}-${scale(end)} ${unit}`,
    )
    .replace(/\bat (\d+(?:\.\d+)?) seconds\b/gi, (_, value) => `at ${scale(value)} seconds`)
    .replace(/\b\d+(?:\.\d+)?-second\b/g, `${duration}-second`);
}

/** Only catalogue-owned timing headers opt into automatic synchronization. */
export function syncTemplateDuration(text: string, duration: unknown): string {
  if (!/^Duration: \d+(?:\.\d+)?-second video\./.test(text) || typeof duration !== 'number') return text;
  return adaptTemplateDuration(text, duration);
}
export function templateTimingError(text: string, duration: unknown): string | undefined {
  if (!text.startsWith('Duration:')) return;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0)
    return 'Выберите длительность видео в настройках.';
  const declared = [...text.matchAll(/\b(\d+(?:\.\d+)?)-second\b/g)].map((match) => Number(match[1]));
  if (!declared.length || declared.some((value) => value !== duration))
    return 'Длительность в тексте шаблона не совпадает с настройками. Согласуйте время перед отправкой.';
  for (const match of text.matchAll(/\bat (\d+(?:\.\d+)?) seconds\b/gi))
    if (Number(match[1]) > duration) return 'Момент события выходит за длительность видео.';
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?) seconds\b/g))
    if (Number(match[1]) >= Number(match[2]) || Number(match[2]) > duration)
      return 'Интервалы сцен выходят за длительность видео. Исправьте время в тексте шаблона.';
}
