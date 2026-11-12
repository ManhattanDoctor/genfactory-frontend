import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api';
import { uploadStudioAttachments } from '../src/features/content-studio/uploadStudioAttachments';
import type { IAttachment } from '../src/features/content-studio/studioTypes';
import type { IGnosisFile } from '../src/lib/types';
const file = (id: number): IGnosisFile =>
  ({ id, userId: 7, name: `file${id}`, type: 'IMAGE', mime: 'image/png' }) as IGnosisFile;
const attachment = (id: number, slot?: 'start' | 'end'): IAttachment => ({
  id: String(id),
  name: `file${id}`,
  type: 'image/png',
  url: '',
  saved: file(id),
  slot,
});
const options = (attachments: IAttachment[]) => ({
  attachments,
  session: 'session',
  userId: 7,
  isCurrent: () => true,
  onProgress: vi.fn(),
  onSaved: vi.fn(),
});
afterEach(() => vi.restoreAllMocks());
it('keeps start/end frame order and reuses saved files instead of uploading again', async () => {
  const read = vi.spyOn(api, 'file').mockImplementation(async (id) => file(id));
  const upload = vi.spyOn(api, 'upload');
  const result = await uploadStudioAttachments(options([attachment(2, 'end'), attachment(1, 'start')]));
  expect(result?.map((item) => item.id)).toEqual([1, 2]);
  expect(read.mock.calls.map((call) => call[0])).toEqual([1, 2]);
  expect(upload).not.toHaveBeenCalled();
});
it('preserves the order of ordinary references and checks their owner', async () => {
  vi.spyOn(api, 'file').mockImplementation(async (id) => file(id));
  expect(
    (await uploadStudioAttachments(options([attachment(3), attachment(1), attachment(2)])))?.map(
      (item) => item.id,
    ),
  ).toEqual([3, 1, 2]);
  vi.mocked(api.file).mockResolvedValueOnce({ ...file(4), userId: 8 });
  await expect(uploadStudioAttachments(options([attachment(4)]))).rejects.toThrow('Материал недоступен');
});
it('remembers a completed upload for retry, without changing the request ordering', async () => {
  const source: IAttachment = {
    id: 'local',
    name: 'photo.png',
    type: 'image/png',
    url: 'blob:local',
    file: new File(['photo'], 'photo.png', { type: 'image/png' }),
  };
  vi.spyOn(api, 'upload').mockResolvedValue(file(12));
  const input = options([source]);
  expect(await uploadStudioAttachments(input)).toEqual([file(12)]);
  expect(input.onSaved).toHaveBeenCalledWith('local', file(12));
});
it('does not attach an upload after the originating session has gone away', async () => {
  const source: IAttachment = {
    id: 'local',
    name: 'photo.png',
    type: 'image/png',
    url: 'blob:local',
    file: new File(['photo'], 'photo.png', { type: 'image/png' }),
  };
  vi.spyOn(api, 'upload').mockResolvedValue(file(12));
  const input = { ...options([source]), isCurrent: () => false };
  expect(await uploadStudioAttachments(input)).toBeUndefined();
  expect(input.onSaved).not.toHaveBeenCalled();
});
