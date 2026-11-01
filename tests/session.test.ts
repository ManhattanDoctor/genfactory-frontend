import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getSession, setSession, request, SESSION_KEY } from '../src/lib/api';
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}
beforeEach(() => {
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());
it('migrates the previous tab session and survives loss of tab storage', () => {
  sessionStorage.setItem(SESSION_KEY, 'old-session');
  expect(getSession()).toBe('old-session');
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  expect(localStorage.getItem(SESSION_KEY)).toBe('old-session');
  vi.stubGlobal('sessionStorage', storage());
  expect(getSession()).toBe('old-session');
});
it('prefers current shared session and removes stale tab tokens on logout', () => {
  sessionStorage.setItem(SESSION_KEY, 'stale');
  localStorage.setItem(SESSION_KEY, 'current');
  expect(getSession()).toBe('current');
  setSession(null);
  expect(getSession()).toBeNull();
});
it('does not expire a new account when an older request returns 401', async () => {
  const expired = vi.fn();
  window.addEventListener('genfactory:unauthorized', expired);
  setSession('new');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response('{"message":"Expired"}', { status: 401 })),
  );
  await expect(request('/init', {}, 'old')).rejects.toThrow('Expired');
  expect(expired).not.toHaveBeenCalled();
  await expect(request('/init')).rejects.toThrow('Expired');
  expect(expired).toHaveBeenCalledOnce();
});
