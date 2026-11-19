import { QueryClient, queryOptions } from '@tanstack/react-query';
import { KeycloakUtil, type IOpenIdResource, type OpenIdResources } from '@ts-core/openid-common';
import { getSession, request } from './api';

export class PermissionService {
  private static instances = new WeakMap<QueryClient, PermissionService>();

  public static get(client: QueryClient): PermissionService {
    let item = this.instances.get(client);
    if (!item) {
      item = new PermissionService(client);
      this.instances.set(client, item);
    }
    return item;
  }

  private constructor(private client: QueryClient) {}

  public load(session: string): Promise<OpenIdResources> {
    return this.client.fetchQuery(this.options(session));
  }

  public options(session: string | null) {
    return queryOptions({
      enabled: !!session,
      queryKey: ['permissions', session],
      staleTime: Infinity,
      retry: false,
      queryFn: async ({ signal }) => {
        const items = await request<IOpenIdResource[]>('/openId/resources', { signal }, session);
        return new Map(items.map((item) => [item.name, item]));
      },
    });
  }

  public has(session: string | null, name: string, scope: string): boolean {
    if (!session || session !== getSession()) return false;
    const resources = this.client.getQueryData<OpenIdResources>(['permissions', session]);
    if (!resources) return false;
    try {
      KeycloakUtil.validateResourceScope({ name, scope: [scope] }, resources);
      return true;
    } catch {
      return false;
    }
  }
}
