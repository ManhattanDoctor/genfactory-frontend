import { expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { catalogQuery } from '../src/features/catalog/catalogQuery';
import { api } from '../src/lib/api';
import type { IModelDescription } from '../src/lib/types';
it('shares provider requests without storing observer-specific filters', async () => {
  const models = [
    { name: 'image', capabilities: ['IMAGE_OUTPUT'] },
    { name: 'other' },
  ] as IModelDescription[];
  const request = vi.spyOn(api, 'catalog').mockResolvedValue(models);
  const client = new QueryClient();
  try {
    const options = catalogQuery(7, 'OPEN_ROUTER_IMAGE');
    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    const observer = new QueryObserver(client, {
      ...options,
      select: (items) => items.filter((m) => m.capabilities?.includes('IMAGE_OUTPUT')),
    });
    expect(observer.getCurrentResult().data).toHaveLength(1);
    expect(await client.fetchQuery(options)).toHaveLength(2);
    expect(request).toHaveBeenCalledTimes(1);
    await client.fetchQuery(catalogQuery(8, 'OPEN_ROUTER_IMAGE'));
    expect(request).toHaveBeenCalledTimes(2);
  } finally {
    client.clear();
    request.mockRestore();
  }
});
