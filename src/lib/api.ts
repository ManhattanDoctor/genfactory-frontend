import type {
  GnosisFile,
  InitResponse,
  ModelDescription,
  Pagination,
  TaskCost,
  TaskRequest,
  TaskResponse,
} from './types';
export const SESSION_KEY = 'genfactory.session';
const base = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function getSession(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}
export function setSession(sid: string | null) {
  if (sid) sessionStorage.setItem(SESSION_KEY, sid);
  else sessionStorage.removeItem(SESSION_KEY);
}
export async function request<T>(
  path: string,
  init: RequestInit = {},
  sid: string | null = getSession(),
): Promise<T> {
  const headers = new Headers(init.headers);
  if (sid) headers.set('Authorization', `Bearer ${sid}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${base}${path}`, { ...init, headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && sid === getSession())
      window.dispatchEvent(new Event('genfactory:unauthorized'));
    const message = typeof data.message === 'string' ? data.message : `Запрос не выполнен (${res.status})`;
    throw new ApiError(message, res.status, data.details);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}
export const api = {
  init: () => request<InitResponse>('/init'),
  config: () => request<{ keycloak: { url: string; realm: string; clientId: string } }>('/config', {}, null),
  login: (code: string, redirectUri: string) =>
    request<{ sid: string; idToken?: string }>(
      '/login',
      {
        method: 'POST',
        body: JSON.stringify({ resource: 'KEYCLOAK', data: { codeOrToken: code, redirectUri } }),
      },
      null,
    ),
  logout: () => request<void>('/logout', { method: 'POST' }),
  catalog: (provider: string, signal?: AbortSignal) =>
    request<ModelDescription[]>(`/aimodels?provider=${encodeURIComponent(provider)}`, { signal }),
  details: (provider: string, model: string) =>
    request<ModelDescription>(`/aimodels/details?${new URLSearchParams({ provider, model })}`),
  generate: (body: TaskRequest, sid: string) =>
    request<TaskResponse>('/task', { method: 'POST', body: JSON.stringify(body) }, sid),
  cost: (id: string) => request<TaskCost>(`/task/cost/${encodeURIComponent(id)}`),
  files: (page: number, type?: string) =>
    request<Pagination<GnosisFile>>(
      `/file?${new URLSearchParams({ pageSize: '24', pageIndex: String(page), sort: JSON.stringify({ createdDate: false }), ...(type ? { conditions: JSON.stringify({ type }) } : {}) })}`,
    ),
  file: (id: number, sid?: string) => request<GnosisFile>(`/file/${id}`, {}, sid),
  upload: (file: File, sid?: string) => {
    const data = new FormData();
    data.append('file', file);
    return request<GnosisFile>('/file', { method: 'POST', body: data }, sid);
  },
  saveImage: (source: string, mime: string, name: string, session: string, sid: string) =>
    request<GnosisFile>(
      '/fileBuffer',
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          input: { source: source.replace(/^data:[^,]*,/, ''), mime },
          tags: ['genfactory', `session:${session}`],
        }),
      },
      sid,
    ),
};
export function safeMediaUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(value)) return value;
  try {
    const u = new URL(value, location.origin);
    return ['http:', 'https:', 'blob:'].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
