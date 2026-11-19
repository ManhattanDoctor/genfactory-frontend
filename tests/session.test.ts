import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getSession, setSession, request, SESSION_KEY, sessionService } from '../src/lib/api';
import { TOKEN_KEY, SessionService } from '../src/lib/SessionService';
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}
function jwt(exp = 4000000000, sub = 'user') {
  return [
    Buffer.from('{"alg":"RS256"}').toString('base64url'),
    Buffer.from(JSON.stringify({ exp, sub })).toString('base64url'),
    'signature',
  ].join('.');
}
beforeEach(() => {
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', {});
  sessionService.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('does not restore a legacy sid as a Keycloak session', () => {
  localStorage.setItem(SESSION_KEY, 'legacy');
  expect(getSession()).toBeNull();
});
it('persists tokens and restores the same session identity', () => {
  const id = sessionService.accept({ access: jwt(), refresh: jwt() });
  expect(new SessionService().getSession()).toBe(id);
  expect(JSON.parse(localStorage.getItem(TOKEN_KEY)!)).toMatchObject({ id });
  setSession(null);
  expect(getSession()).toBeNull();
});
it('blocks stale-session requests without signing them with the new user token', async () => {
  sessionService.accept({ access: jwt(), refresh: jwt() });
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(request('/init', {}, 'old')).rejects.toThrow('Сессия изменилась');
  expect(fetch).not.toHaveBeenCalled();
});
it('sends access tokens and reports unauthorized for the current session', async () => {
  const expired = vi.fn();
  window.addEventListener('genfactory:unauthorized', expired);
  sessionService.accept({ access: jwt() });
  const fetch = vi.fn().mockResolvedValue(new Response('{"message":"Expired"}', { status: 401 }));
  vi.stubGlobal('fetch', fetch);
  await expect(request('/init')).rejects.toThrow('Expired');
  expect(fetch.mock.calls[0][1].headers.get('Authorization')).toBe(`Bearer ${jwt()}`);
  expect(expired).toHaveBeenCalledOnce();
});
it('coalesces refresh, persists rotated tokens and preserves session identity', async () => {
  const id = sessionService.accept({ access: jwt(1), refresh: jwt(4000000000, 'refresh') });
  let resolve!: (response: Response) => void;
  const fetch = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((yes) => {
        resolve = yes;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const first = sessionService.access(id),
    second = sessionService.access(id);
  expect(fetch).toHaveBeenCalledTimes(1);
  resolve(new Response(JSON.stringify({ access: jwt(), refresh: jwt(4000000000, 'rotated') })));
  expect(await Promise.all([first, second])).toEqual([jwt(), jwt()]);
  expect(getSession()).toBe(id);
  expect(sessionService.getTokens()?.refresh).toBe(jwt(4000000000, 'rotated'));
});
it('does not restore tokens when refresh completes after logout', async () => {
  const id = sessionService.accept({ access: jwt(1), refresh: jwt(4000000000, 'refresh') });
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(
      () =>
        new Promise<Response>((yes) => {
          resolve = yes;
        }),
    ),
  );
  const request = sessionService.access(id);
  sessionService.clear();
  resolve(new Response(JSON.stringify({ access: jwt(), refresh: jwt(4000000000, 'rotated') })));
  await expect(request).rejects.toThrow();
  expect(getSession()).toBeNull();
  expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
});
it('keeps the session on a transient refresh failure and permits retry', async () => {
  const id = sessionService.accept({ access: jwt(1), refresh: jwt(4000000000, 'refresh') });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access: jwt(), refresh: jwt(4000000000, 'rotated') })),
    );
  vi.stubGlobal('fetch', fetch);
  await expect(sessionService.access(id)).rejects.toThrow();
  expect(getSession()).toBe(id);
  await expect(sessionService.access(id)).resolves.toBe(jwt());
});

it('serializes rotating refresh across tabs, including a storage event while waiting', async () => {
  const id = sessionService.accept({ access: jwt(1), refresh: jwt(4000000000, 'refresh') });
  const other = new SessionService();
  other.getSession();
  let queue = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: (_name: string, callback: () => Promise<unknown>) => {
        const next = queue.then(callback);
        queue = next.then(() => {
          other.getSession();
        });
        return next;
      },
    },
  });
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ access: jwt(), refresh: jwt(4000000000, 'rotated') })));
  vi.stubGlobal('fetch', fetch);
  expect(await Promise.all([sessionService.access(id), other.access(id)])).toEqual([jwt(), jwt()]);
  expect(fetch).toHaveBeenCalledOnce();
  expect(other.getSession()).toBe(id);
  expect(other.getTokens()?.refresh).toBe(jwt(4000000000, 'rotated'));
});
it('does not persist a malformed refresh response', async () => {
  const initial = { access: jwt(1), refresh: jwt() };
  const id = sessionService.accept(initial);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ access: 'broken', refresh: jwt() }))),
  );
  await expect(sessionService.access(id)).rejects.toThrow();
  expect(sessionService.getTokens()).toEqual(initial);
});
