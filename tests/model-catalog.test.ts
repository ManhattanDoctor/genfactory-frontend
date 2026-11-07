import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api';

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => 'session' });
  vi.stubGlobal('sessionStorage', { getItem: () => null, removeItem: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

it('uses standard conditions and collects every catalogue page without legacy flags', async () => {
  const requests: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (value: string) => {
      const url = new URL(value, 'http://local');
      requests.push(url);
      const index = Number(url.searchParams.get('pageIndex'));
      return new Response(
        JSON.stringify({
          items: [
            {
              reference: { provider: 'OPEN_ROUTER_VIDEO', model: `model-${index}` },
              name: 'Video',
              status: 'ACTIVE',
              schema: {},
            },
          ],
          total: 2,
          pages: 2,
          pageIndex: index,
          pageSize: 500,
        }),
        { status: 200 },
      );
    }),
  );
  expect((await api.catalog('OPEN_ROUTER_VIDEO')).map((item) => item.reference.model)).toEqual([
    'model-0',
    'model-1',
  ]);
  expect(requests).toHaveLength(2);
  for (const url of requests) {
    expect(JSON.parse(url.searchParams.get('conditions')!)).toEqual({
      provider: 'OPEN_ROUTER_VIDEO',
      status: 'ACTIVE',
    });
    expect(url.searchParams.has('provider')).toBe(false);
    expect(url.searchParams.has('includeHidden')).toBe(false);
  }
});

it('accepts an empty catalogue without inventing fallback models', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [], total: 0, pages: 0, pageIndex: 0, pageSize: 500 }), {
          status: 200,
        }),
    ),
  );
  expect(await api.catalog('OPEN_AI_CONVERSATION')).toEqual([]);
});
