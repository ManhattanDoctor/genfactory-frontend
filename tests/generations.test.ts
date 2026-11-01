import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelDescription, TaskRequest } from '../src/lib/types';
const calls = vi.hoisted(() => ({ generate: vi.fn(), saveImage: vi.fn(), file: vi.fn() }));
vi.mock('../src/lib/api', async (importOriginal) => ({ ...(await importOriginal<object>()), api: calls }));
const model: ModelDescription = {
  reference: { provider: 'OPEN_AI_IMAGE_GPT', model: 'test' },
  name: 'Model',
  schema: {},
};
const request: TaskRequest = {
  model: model.reference.provider,
  task: { session: 'job-1', prompt: 'example' },
  options: { model: 'test' },
};
const image = { source: 'data:image/png;base64,aGVsbG8=', mime: 'image/png', width: 1, height: 1 };
const cost = { status: 'FINAL', amounts: [{ coinId: 'USD', amount: '0.01' }] };
const file = {
  id: 12,
  userId: 7,
  path: 'https://example.test/file.png',
  name: 'Result',
  mime: 'image/png',
  type: 'IMAGE',
  createdDate: new Date().toISOString(),
  uid: 'f',
};
function persisted() {
  return JSON.parse(localStorage.getItem('genfactory.jobs.v1.7') || '[]');
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) || null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
  vi.stubGlobal('window', new EventTarget());
});
describe('Generation lifecycle', () => {
  it('saves image once and persists file metadata, not image payload or credentials', async () => {
    calls.generate.mockResolvedValue({ result: [image], cost });
    calls.saveImage.mockResolvedValue(file);
    const { generate } = await import('../src/features/studio/generations');
    await generate(7, 'private-token', 'image', model, request);
    expect(calls.generate).toHaveBeenCalledTimes(1);
    expect(persisted()[0].status).toBe('completed');
    expect(persisted()[0].files[0].id).toBe(12);
    expect(JSON.stringify(persisted())).not.toContain('private-token');
    expect(JSON.stringify(persisted())).not.toContain('base64');
  });
  it('does not retry a paid request when the network outcome is unknown', async () => {
    calls.generate.mockRejectedValue(new TypeError('Network lost'));
    const { generate, recoverJobs } = await import('../src/features/studio/generations');
    await generate(7, 'sid', 'image', model, request);
    expect(calls.generate).toHaveBeenCalledTimes(1);
    expect(persisted()[0].status).toBe('unknown');
    expect(recoverJobs([{ ...persisted()[0], status: 'running' }])[0].status).toBe('unknown');
  });
  it('retries only image persistence after saving fails, never generation', async () => {
    calls.generate.mockResolvedValue({ result: [image], cost });
    calls.saveImage.mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValueOnce(file);
    const { generate, retrySave } = await import('../src/features/studio/generations');
    await generate(7, 'sid', 'image', model, request);
    expect(persisted()[0].status).toBe('save_failed');
    await retrySave(persisted()[0], 'sid');
    expect(persisted()[0].status).toBe('completed');
    expect(calls.generate).toHaveBeenCalledTimes(1);
    expect(calls.saveImage).toHaveBeenCalledTimes(2);
  });
  it('prevents a second paid submission for the same account while one is running', async () => {
    let finish!: (result: unknown) => void;
    calls.generate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    calls.saveImage.mockResolvedValue(file);
    const { generate } = await import('../src/features/studio/generations');
    const first = generate(7, 'sid', 'image', model, request);
    await expect(
      generate(7, 'sid', 'image', model, { ...request, task: { ...request.task, session: 'job-2' } }),
    ).rejects.toThrow();
    finish({ result: [image], cost });
    await first;
    expect(calls.generate).toHaveBeenCalledTimes(1);
  });
});
