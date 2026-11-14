import { describe, expect, it } from 'vitest';
import catalog from './fixtures/catalog.json';
import { defaults, optionFields, referenceLimit, validateRequest } from '../src/features/catalog/schema';
import { FileReferenceType, type IModelDescription, type ITaskRequest } from '../src/lib/types';
const model = catalog[0] as unknown as IModelDescription;
const request = (): ITaskRequest => ({
  model: model.reference.provider,
  task: { session: 'test', prompt: 'A cinematic landscape' },
  options: { ...defaults(model.schema.properties?.options), model: model.reference.model },
});
describe('Catalog-driven request contract', () => {
  it('accepts real catalog defaults and retains provider/model distinction', () => {
    expect(validateRequest(model, request())).toEqual([]);
    expect(request().model).not.toBe(request().options.model);
  });
  it('rejects unsupported size and incompatible transparent JPEG', () => {
    const value = request();
    value.options.size = 'cinema';
    expect(validateRequest(model, value)).not.toEqual([]);
    value.options.size = '1024x1024';
    value.options.background = 'transparent';
    value.options.format = 'jpeg';
    expect(validateRequest(model, value)).not.toEqual([]);
  });
  it('validates reference ownership identifiers format and reference limits', () => {
    const value = request();
    value.task.references = [{ type: FileReferenceType.FILE, id: -1 }];
    expect(validateRequest(model, value)).not.toEqual([]);
    value.task.references = Array.from({ length: referenceLimit(model) + 1 }, (_, i) => ({
      type: FileReferenceType.FILE,
      id: i + 1,
    }));
    expect(validateRequest(model, value)).not.toEqual([]);
  });
  it('does not mutate catalog defaults or expose infrastructure options', () => {
    const copy = structuredClone(model);
    const values = defaults(model.schema.properties?.options);
    values.quality = 'invalid';
    expect(model).toEqual(copy);
    expect(optionFields(model).map(([key]) => key)).not.toContain('stream');
  });
});

it('validates references against provider constraints without adding legacy fields to the wire request', () => {
  const value = request();
  value.task.references = [
    { type: FileReferenceType.FILE, id: 8 },
    { type: FileReferenceType.FILE, id: 2 },
  ];
  const copy = structuredClone(value);
  expect(validateRequest(model, value)).toEqual([]);
  expect(value).toEqual(copy);
  expect(value.task).not.toHaveProperty('fileIds');
  value.task.references = [{ type: FileReferenceType.URL, url: 'https://files.test/a.png' }];
  expect(validateRequest(model, value)).not.toEqual([]);
  value.task.references = [
    { type: FileReferenceType.FILE, id: 8 },
    { type: FileReferenceType.FILE, id: 8 },
  ];
  expect(validateRequest(model, value)).not.toEqual([]);
});
