import type { IModelDescription } from '../../lib/types';
import { defaults } from '../catalog/schema';
export const bananaRatios = [
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
];
export function bananaDefaults(model?: IModelDescription) {
  const fields = model?.schema.properties?.options;
  const result = defaults(fields);
  for (const [name, preferred] of [
    ['aspectRatio', '1:1'],
    ['resolution', '1K'],
    ['imageSize', '1K'],
  ]) {
    const values = fields?.properties?.[name]?.enum;
    if (result[name] === undefined && values?.length)
      result[name] = values.includes(preferred) ? preferred : values[0];
  }
  return result;
}

export function bananaTitle(model: IModelDescription): string {
  const id = model.reference.model;
  const label = id.includes('2.5-flash')
    ? 'Nano Banana'
    : id.includes('lite-image')
      ? 'Nano Banana 2 Lite'
      : id.includes('pro-image')
        ? 'Nano Banana Pro'
        : id.includes('banana-2.1')
          ? 'Nano Banana 2.1'
          : 'Nano Banana 2';
  return label + (id.endsWith('-preview') ? ' Preview' : '');
}

export function bananaDescription(model: IModelDescription): string {
  const id = model.reference.model;
  return id.includes('2.5-flash')
    ? 'Для правки изображения по фото.'
    : id.includes('lite-image')
      ? 'Для правки готового фото в небольшом размере.'
      : id.includes('pro-image')
        ? 'Для детального кадра и правки готового фото.'
        : 'Для нового кадра и правки готового фото.';
}
