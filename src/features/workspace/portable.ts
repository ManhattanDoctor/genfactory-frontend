import type { IPreferences, IPreset } from './preferences';
export interface IPortableSettings {
  format: 'genfactory-settings';
  version: 1;
  presets: IPreset[];
  brand: string;
  favoriteModels: string[];
  favoriteTemplates: string[];
}
export function exportSettings(p: IPreferences): IPortableSettings {
  return {
    format: 'genfactory-settings',
    version: 1,
    presets: p.presets,
    brand: p.brand,
    favoriteModels: p.favoriteModels,
    favoriteTemplates: p.favoriteTemplates,
  };
}
export function parseSettings(raw: string): IPortableSettings {
  if (raw.length > 500_000) throw new Error('Файл должен быть меньше 500 КБ.');
  const d = JSON.parse(raw);
  const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
  const strings = (v: unknown) => Array.isArray(v) && v.length <= 500 && v.every((x) => str(x, 300));
  if (
    !d ||
    d.format !== 'genfactory-settings' ||
    d.version !== 1 ||
    !str(d.brand, 6000) ||
    !Array.isArray(d.presets) ||
    d.presets.length > 40 ||
    !strings(d.favoriteModels) ||
    !strings(d.favoriteTemplates)
  )
    throw new Error('Неподдерживаемый или повреждённый файл настроек.');
  const presets: IPreset[] = d.presets.map((p: IPreset) => {
    if (
      !p ||
      !str(p.id, 200) ||
      !p.id ||
      !str(p.name, 200) ||
      !p.name.trim() ||
      !str(p.category, 200) ||
      !str(p.prompt, 32000) ||
      !['image', 'video'].includes(p.kind) ||
      p.modelMatch !== undefined ||
      (p.model && (!str(p.model.provider, 200) || !str(p.model.model, 200))) ||
      (p.options &&
        (!Object.getPrototypeOf(p.options) || Array.isArray(p.options) || typeof p.options !== 'object'))
    )
      throw new Error('Некорректный шаблон в файле настроек.');
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      prompt: p.prompt,
      kind: p.kind,
      ...(p.model ? { model: { provider: p.model.provider, model: p.model.model } } : {}),
      ...(p.options ? { options: p.options } : {}),
    };
  });
  if (new Set(presets.map((p) => p.id)).size !== presets.length)
    throw new Error('Повторяющиеся идентификаторы шаблонов.');
  return {
    format: 'genfactory-settings',
    version: 1,
    presets,
    brand: d.brand,
    favoriteModels: [...new Set<string>(d.favoriteModels)],
    favoriteTemplates: [...new Set<string>(d.favoriteTemplates)],
  };
}
