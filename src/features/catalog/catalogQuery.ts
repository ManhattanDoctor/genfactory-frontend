import { queryOptions } from '@tanstack/react-query';
import { api } from '../../lib/api';

/** Cache the unfiltered provider catalogue; each observer selects its own view. */
export function catalogQuery(userId: number | undefined, provider: string | undefined) {
  return queryOptions({
    queryKey: ['model-catalog', userId, provider],
    enabled: !!userId && !!provider,
    staleTime: 300000,
    queryFn: ({ signal }) => api.catalog(provider!, signal),
  });
}
