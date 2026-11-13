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
  const scale = (value: string) => String(Math.round(((Number(value) * duration) / original) * 100) / 100);
  return text
    .replace(
      /(\d+(?:\.\d+)?)[-–](\d+(?:\.\d+)?)\s*(seconds|s)\b/g,
      (_, start, end, unit) => `${scale(start)}-${scale(end)} ${unit}`,
    )
    .replace(/\b\d+(?:\.\d+)?-second\b/g, `${duration}-second`);
}
