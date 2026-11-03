import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, request } from '../src/lib/api';
import { directoryPath, folderTrail, mediaType, resolveFile } from '../src/lib/files';
import type { IGnosisFile } from '../src/lib/types';
vi.mock('../src/lib/api', () => ({ api: { file: vi.fn() }, request: vi.fn() }));
const original = { id: 1, type: 'IMAGE', mime: 'image/png' } as IGnosisFile;
const alias = { id: 2, type: 'LINK', linkTo: 1, mime: 'image/png' } as IGnosisFile;
beforeEach(() => vi.resetAllMocks());
describe('file aliases and directory paths', () => {
  it('resolves the original ID rather than submitting the alias ID', async () => {
    vi.mocked(api.file).mockResolvedValue(original);
    expect(mediaType(alias)).toBe('IMAGE');
    expect(await resolveFile(alias)).toBe(original);
    expect(api.file).toHaveBeenCalledWith(1);
  });
  it('stops a cyclic link chain', async () => {
    vi.mocked(api.file).mockResolvedValue(alias);
    await expect(resolveFile(alias)).rejects.toThrow('Ссылка на файл недоступна');
    expect(api.file).toHaveBeenCalledTimes(1);
  });
  it('preserves UID ancestry when opening a folder found by global search', async () => {
    const parent = { id: 3, uid: 'parent', name: 'Parent', type: 'DIRECTORY' } as IGnosisFile;
    const child = { id: 4, uid: 'child', directory: 'parent', type: 'DIRECTORY' } as IGnosisFile;
    vi.mocked(request).mockResolvedValue({ items: [parent] });
    expect(directoryPath(child)).toBe('parent/child');
    expect(await folderTrail(child)).toEqual([parent, child]);
  });
  it('does not navigate into a folder with an inaccessible parent', async () => {
    vi.mocked(request).mockResolvedValue({ items: [] });
    await expect(folderTrail({ uid: 'child', directory: 'missing' } as IGnosisFile)).rejects.toThrow(
      'Родительская папка недоступна',
    );
  });
});
