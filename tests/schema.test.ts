import { describe, expect, it } from 'vitest';
import catalog from './fixtures/catalog.json';
import { defaults, optionFields, referenceLimit, validateRequest } from '../src/features/catalog/schema';
import type { IModelDescription, ITaskRequest } from '../src/lib/types';
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
    value.task.fileIds = [-1];
    expect(validateRequest(model, value)).not.toEqual([]);
    value.task.fileIds = Array.from({ length: referenceLimit(model) + 1 }, (_, i) => i + 1);
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
