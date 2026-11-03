import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, hasPendingWrites, MAX_UPLOAD_BYTES, type IUploadProgress } from '../src/lib/api';
class FakeXHR {
  static current: FakeXHR;
  upload: {
    onprogress?: (event: { loaded: number; total: number; lengthComputable: boolean }) => void;
    onload?: () => void;
  } = {};
  status = 0;
  response: unknown;
  responseType = '';
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  constructor() {
    FakeXHR.current = this;
  }
  finish(status: number, response: unknown) {
    this.status = status;
    this.response = response;
    this.onload?.();
  }
}
beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  vi.stubGlobal('localStorage', { getItem: () => 'session', removeItem: vi.fn() });
  vi.stubGlobal('sessionStorage', { getItem: () => null, removeItem: vi.fn() });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
describe('upload lifecycle', () => {
  it('reports actual transfer progress and keeps the write pending during server processing', async () => {
    const events: IUploadProgress[] = [];
    const upload = api.upload(
      new File(['recording'], 'audio.wav'),
      'session',
      { tags: ['speech'] },
      (event) => events.push(event),
    );
    const xhr = FakeXHR.current;
    expect(hasPendingWrites()).toBe(true);
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer session');
    expect((xhr.send.mock.calls[0][0] as FormData).get('tags')).toBe('["speech"]');
    xhr.upload.onprogress?.({ loaded: 25, total: 100, lengthComputable: true });
    expect(events.at(-1)).toMatchObject({ loaded: 25, total: 100, phase: 'uploading' });
    xhr.upload.onload?.();
    expect(events.at(-1)?.phase).toBe('processing');
    expect(hasPendingWrites()).toBe(true);
    xhr.finish(201, { id: 123 });
    await expect(upload).resolves.toMatchObject({ id: 123 });
    expect(hasPendingWrites()).toBe(false);
  });
  it('explains nginx HTML 413 responses and clears the pending write', async () => {
    const upload = api.upload(new File(['x'], 'audio.wav'), 'session');
    FakeXHR.current.finish(413, null);
    await expect(upload).rejects.toMatchObject({
      status: 413,
      message: expect.stringContaining('размера файла'),
    });
    expect(hasPendingWrites()).toBe(false);
  });
  it('clears a failed upload without resending and expires only the current session', async () => {
    const upload = api.upload(new File(['x'], 'audio.wav'), 'session');
    FakeXHR.current.finish(401, { message: 'Unauthorized' });
    await expect(upload).rejects.toMatchObject({ status: 401 });
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'genfactory:unauthorized' }),
    );
    expect(FakeXHR.current.send).toHaveBeenCalledTimes(1);
    expect(hasPendingWrites()).toBe(false);
  });
  it('clears pending state on a network failure without retrying', async () => {
    const upload = api.upload(new File(['x'], 'audio.wav'), 'session');
    FakeXHR.current.onerror?.();
    await expect(upload).rejects.toMatchObject({ status: 0 });
    expect(FakeXHR.current.send).toHaveBeenCalledTimes(1);
    expect(hasPendingWrites()).toBe(false);
  });
  it('rejects oversized files before starting a request', async () => {
    const file = new File(['x'], 'audio.wav');
    Object.defineProperty(file, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    await expect(api.upload(file, 'session')).rejects.toThrow('1 ГБ');
    expect(hasPendingWrites()).toBe(false);
  });
});
