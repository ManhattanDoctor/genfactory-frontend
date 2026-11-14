import { expect, it } from 'vitest';
import { statSync } from 'node:fs';
import templates from '../src/features/content-studio/templates.json';
import { templatePublicReference } from '../src/features/content-studio/templatePublicReference';

it('resolves all three public assets without a library file ID or downloading them', () => {
  const items = templates.filter((item) => 'referenceVideoSrc' in item);
  expect(items).toHaveLength(3);
  for (const item of items) {
    const reference = templatePublicReference(item.id, 'http://localhost:5173')!;
    expect(reference.path).toBe(`https://genfactory.gnosisai.ru${item.referenceVideoSrc}`);
    expect(reference).not.toHaveProperty('id');
    expect(reference.size).toBe(
      statSync(new URL(`../public${item.referenceVideoSrc}`, import.meta.url)).size,
    );
    expect(templatePublicReference(item.id, 'https://studio.example.test')!.path).toBe(
      `https://studio.example.test${item.referenceVideoSrc}`,
    );
  }
});
it('does not invent references for unknown IDs or ordinary templates', () => {
  expect(templatePublicReference('unknown', 'https://studio.example.test')).toBeUndefined();
  expect(templatePublicReference(templates[0].id, 'https://studio.example.test')).toBeUndefined();
});
