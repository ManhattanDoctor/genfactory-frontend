/** The backend model catalogue uses the same conditions and pagination as other lists. */
export const catalogProvider = (value: string | URL): string | undefined =>
  JSON.parse(new URL(String(value)).searchParams.get('conditions') || '{}').provider;

export const catalogPage = (items: unknown[]) => ({
  items,
  total: items.length,
  pageSize: 500,
  pageIndex: 0,
  pages: items.length ? 1 : 0,
});

export const catalogResponse = (url: string, body: unknown) =>
  new URL(url).pathname === '/api/aimodels' && Array.isArray(body) ? catalogPage(body) : body;
