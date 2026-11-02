import { describe, it, expect } from 'vitest';
import { parseSettings, exportSettings } from '../src/features/workspace/portable';
const data = {
  format: 'genfactory-settings',
  version: 1,
  brand: 'Стиль',
  presets: [],
  favoriteModels: ['model'],
  favoriteTemplates: [],
};
describe('portable settings', () => {
  it('accepts supported settings and removes unrelated fields', () => {
    expect(parseSettings(JSON.stringify({ ...data, session: 'secret', favorites: [1] }))).toEqual(data);
  });
  it('rejects incompatible versions, oversized data and malformed presets', () => {
    for (const invalid of [
      { ...data, version: 2 },
      { ...data, brand: 'x'.repeat(6001) },
      { ...data, presets: [{ id: '1' }] },
      { ...data, favoriteModels: [7] },
    ])
      expect(() => parseSettings(JSON.stringify(invalid))).toThrow();
  });
  it('exports only portable fields', () => {
    expect(
      exportSettings({ ...data, favorites: [1], archive: [2], versions: [], session: 'secret' } as never),
    ).toEqual(data);
  });
});
