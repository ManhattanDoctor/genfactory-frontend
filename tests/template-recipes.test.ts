import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import templates from '../src/features/content-studio/templates.json';
import fields from '../src/features/content-studio/templateFields.json';
import {
  templateVariables,
  templateReference,
  fillTemplate,
  templateDuration,
  adaptTemplateDuration,
} from '../src/features/content-studio/templateRecipe';

describe('Complete designer template catalog', () => {
  it.each(templates)('$id has usable media, known fields and a fillable recipe', (item) => {
    expect(item.prompt.trim()).not.toBe('');
    expect(existsSync(new URL('../public' + item.src, import.meta.url))).toBe(true);
    const keys = templateVariables(item.prompt);
    for (const key of keys) expect(fields).toHaveProperty(key);
    const ready = fillTemplate(item.prompt, Object.fromEntries(keys.map((key) => [key, 'User value'])));
    expect(templateVariables(ready)).toEqual([]);
    if (item.kind === 'video') {
      expect(templateDuration(ready)).toBeGreaterThan(0);
      for (const seconds of [1, 4, 6, 15]) {
        const adapted = adaptTemplateDuration(ready, seconds);
        expect(templateDuration(adapted)).toBe(seconds);
        for (const range of adapted.matchAll(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s*(seconds|s)\b/g)) {
          expect(Number(range[1])).toBeLessThan(Number(range[2]));
          expect(Number(range[2])).toBeLessThanOrEqual(seconds);
        }
      }
    }
  });
  it('distinguishes optional scene references from mandatory identity references', () => {
    const get = (id: string) => templates.find((item) => item.id === id)!;
    expect(templateReference(get('image:66'))).toBe('required');
    expect(templateReference(get('image:16'))).toBe('required');
    expect(templateReference(get('image:10'))).toBe('optional');
    expect(templateReference(get('image:12'))).toBe('optional');
    expect(templateReference(get('video:media/creatives/19.mp4'))).toBe('optional');
    expect(templateReference(get('presentation:startup'))).toBe('none');
  });
});
