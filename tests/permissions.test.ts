import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { PermissionService } from '../src/lib/PermissionService';
import { getSession, request } from '../src/lib/api';
vi.mock('../src/lib/api', () => ({ getSession: vi.fn(), request: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const allowed = [{ id: '1', name: 'user', scopes: ['list'] }];
it('shares one service per client, coalesces requests, and checks exact scopes', async () => {
  const client = new QueryClient();
  const service = PermissionService.get(client);
  expect(PermissionService.get(client)).toBe(service);
  vi.mocked(getSession).mockReturnValue('one');
  vi.mocked(request).mockResolvedValue(allowed);
  await Promise.all([service.load('one'), service.load('one')]);
  expect(request).toHaveBeenCalledTimes(1);
  expect(service.has('one', 'user', 'list')).toBe(true);
  expect(service.has('one', 'user', 'edit')).toBe(false);
  client.clear();
  expect(service.has('one', 'user', 'list')).toBe(false);
});
it('cannot transfer a previous session grant to a new session, even if its response arrives late', async () => {
  const client = new QueryClient();
  const service = PermissionService.get(client);
  let finish!: (value: typeof allowed) => void;
  vi.mocked(getSession).mockReturnValue('one');
  vi.mocked(request).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const old = service.load('one').catch(() => undefined);
  client.clear();
  vi.mocked(getSession).mockReturnValue('two');
  vi.mocked(request).mockResolvedValueOnce([]);
  await service.load('two');
  finish(allowed);
  await old;
  expect(service.has('one', 'user', 'list')).toBe(false);
  expect(service.has('two', 'user', 'list')).toBe(false);
  expect(client.getQueryData(['permissions', 'one'])).toBeUndefined();
  client.clear();
});
it('fails closed on outage and retries when requested again', async () => {
  const client = new QueryClient();
  const service = PermissionService.get(client);
  vi.mocked(getSession).mockReturnValue('one');
  vi.mocked(request).mockRejectedValueOnce(new Error('offline'));
  await expect(service.load('one')).rejects.toThrow('offline');
  expect(service.has('one', 'user', 'list')).toBe(false);
  vi.mocked(request).mockResolvedValueOnce(allowed);
  await service.load('one');
  expect(service.has('one', 'user', 'list')).toBe(true);
  client.clear();
});
