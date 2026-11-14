import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  saveTemplateReference,
  templateReferenceId,
} from '../src/features/content-studio/templateReferenceCache';
import type { ITemplate } from '../src/features/content-studio/materials';
const item = { id: 'dance', addedAt: 'v1', referenceVideoSrc: '/v1.mp4' } as ITemplate;
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());
it('isolates users and source versions and forgets deleted references', () => {
  saveTemplateReference(1, item, 42);
  expect(templateReferenceId(1, item)).toBe(42);
  expect(templateReferenceId(2, item)).toBeUndefined();
  expect(templateReferenceId(1, { ...item, referenceVideoSrc: '/v2.mp4' })).toBeUndefined();
  expect(templateReferenceId(1, { ...item, addedAt: 'v2' })).toBeUndefined();
  saveTemplateReference(1, item);
  expect(templateReferenceId(1, item)).toBeUndefined();
});
it('tolerates corrupt or unavailable storage and bounds retained IDs', () => {
  localStorage.setItem('genfactory.template-references.1', '{broken');
  expect(templateReferenceId(1, item)).toBeUndefined();
  for (let i = 0; i < 70; i++) saveTemplateReference(1, { ...item, id: String(i) }, i + 1);
  expect(templateReferenceId(1, { ...item, id: '0' })).toBeUndefined();
  expect(templateReferenceId(1, { ...item, id: '69' })).toBe(70);
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error();
    },
    setItem: () => {
      throw new Error();
    },
  });
  expect(() => saveTemplateReference(1, item, 42)).not.toThrow();
  expect(templateReferenceId(1, item)).toBeUndefined();
});
