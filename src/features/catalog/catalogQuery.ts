import { queryOptions } from '@tanstack/react-query';
import { api } from '../../lib/api';

/** Cache the unfiltered provider catalogue; each observer selects its own view. */
export function catalogQuery(userId: number | undefined, provider: string | undefined) {
  return queryOptions({
    queryKey: ['model-catalog', userId, provider],
    enabled: !!provider,
    staleTime: 300000,
    queryFn: ({ signal }) => api.catalog(provider!, signal),
  });
}

export function imageModelIdsQuery(userId: number | undefined) {
  return queryOptions({
    ...catalogQuery(userId, 'OPEN_ROUTER_IMAGE'),
    select: (models) =>
      new Set(
        models
          .filter((item) => item.capabilities?.includes('IMAGE_OUTPUT'))
          .map((item) => item.reference.model),
      ),
  });
}
