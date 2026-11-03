import type {
  IGnosisFile,
  IFileOutputSettings,
  IPreview,
  IPaymentTransaction,
  IInitResponse,
  IModelDescription,
  IPagination,
  IConversation,
  IConversationCreate,
  IConversationMessage,
  IMessageCreate,
  IConversationProgress,
  IToolDescription,
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
  const persistent = localStorage.getItem(SESSION_KEY);
  const legacy = sessionStorage.getItem(SESSION_KEY);
  if (persistent) {
    sessionStorage.removeItem(SESSION_KEY);
    return persistent;
  }
  if (legacy) {
    localStorage.setItem(SESSION_KEY, legacy);
    sessionStorage.removeItem(SESSION_KEY);
  }
  return legacy;
}
export function setSession(sid: string | null) {
  sessionStorage.removeItem(SESSION_KEY);
  if (sid) localStorage.setItem(SESSION_KEY, sid);
  else localStorage.removeItem(SESSION_KEY);
}
let pendingWrites = 0;
export const hasPendingWrites = () => pendingWrites > 0;
function notifyWrites() {
  window.dispatchEvent(new Event('genfactory:pending-writes'));
}
export async function request<T>(
  path: string,
  init: RequestInit = {},
  sid: string | null = getSession(),
  responseType: 'json' | 'blob' = 'json',
): Promise<T> {
  const writing = !['GET', 'HEAD'].includes((init.method || 'GET').toUpperCase());
  if (writing) {
    pendingWrites++;
    notifyWrites();
  }
  try {
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
    if (responseType === 'blob') return (await res.blob()) as T;
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : (undefined as T);
  } finally {
    if (writing) {
      pendingWrites--;
      notifyWrites();
    }
  }
}
export const api = {
  transactions: (
    userId: number,
    page: number,
    filter: { direction: string; currency: string; since: string },
    signal?: AbortSignal,
  ) => {
    const personal = { condition: 'EQUAL', value: 'PR-00', union: 'OR' };
    const conditions = {
      userId,
      ...(filter.direction === 'expense'
        ? { credit: 'PR-00' }
        : filter.direction === 'income'
          ? { debet: 'PR-00' }
          : { debet: personal, credit: personal }),
      ...(filter.currency ? { coinId: filter.currency } : {}),
      ...(filter.since
        ? { createdDate: { condition: 'MORE_OR_EQUAL', value: Date.parse(filter.since), type: 'DATE' } }
        : {}),
    };
    return request<IPagination<IPaymentTransaction>>(
      `/paymentTransaction?${new URLSearchParams({ pageIndex: String(page), pageSize: '20', sort: JSON.stringify({ createdDate: false, id: false }), conditions: JSON.stringify(conditions) })}`,
      { signal },
    );
  },
  init: () => request<IInitResponse>('/init'),
  config: () =>
    request<{ keycloak: { url: string; realm: string; clientId: string } }>(
      '/config',
      { signal: AbortSignal.timeout(10_000) },
      null,
    ),
  login: (code: string, redirectUri: string) =>
    request<{ sid: string; idToken?: string }>(
      '/login',
      {
        method: 'POST',
        body: JSON.stringify({ resource: 'KEYCLOAK', data: { codeOrToken: code, redirectUri } }),
      },
      null,
    ),
  logout: (sid: string | null) =>
    request<void>('/logout', { method: 'POST', signal: AbortSignal.timeout(10_000) }, sid),
  downloadFile: (id: number) => request<Blob>(`/file/${id}/content`, {}, getSession(), 'blob'),
  fileText: (id: number, signal?: AbortSignal) => request<{ text: string }>(`/file/${id}/text`, { signal }),
  catalog: (provider: string, signal?: AbortSignal) =>
    request<IModelDescription[]>(`/aimodels?provider=${encodeURIComponent(provider)}`, { signal }),
  details: (provider: string, signal?: AbortSignal) =>
    request<{ tools?: IToolDescription[] }>(`/aimodel/${encodeURIComponent(provider)}`, { signal }),
  editConversation: (
    conversation: IConversation,
    changes: { name?: string; options?: IConversation['options']; system?: string },
    sid: string,
  ) =>
    request<IConversation>(
      `/conversation/${conversation.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          ...changes,
          model: conversation.model,
          files: (conversation.files || []).map((f) => f.id),
        }),
      },
      sid,
    ),
  progress: async (session: string, signal?: AbortSignal) => {
    try {
      return await request<IConversationProgress | null>(`/task/${encodeURIComponent(session)}`, { signal });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
  conversations: (userId: number, page: number, signal?: AbortSignal, status?: string) =>
    request<IPagination<IConversation>>(
      `/conversation?${new URLSearchParams({
        pageSize: '24',
        pageIndex: String(page),
        sort: JSON.stringify({ createdDate: false, id: false }),
        conditions: JSON.stringify({ userId, ...(status ? { status } : {}) }),
      })}`,
      { signal },
    ),
  conversation: (id: number, signal?: AbortSignal, sid?: string) =>
    request<IConversation>(`/conversation/${id}`, { signal }, sid),
  createConversation: (body: IConversationCreate, sid: string) =>
    request<IConversation>('/conversation', { method: 'POST', body: JSON.stringify(body) }, sid),
  messages: (id: number, page: number, signal?: AbortSignal, sid?: string) =>
    request<IPagination<IConversationMessage>>(
      `/conversation/${id}/message?${new URLSearchParams({
        pageSize: '20',
        pageIndex: String(page),
        conditions: JSON.stringify({ conversationId: id }),
        sort: JSON.stringify({ createdDate: false, id: false }),
      })}`,
      { signal },
      sid,
    ),
  sendMessage: (id: number, body: IMessageCreate, sid: string) =>
    request<IConversationMessage>(
      `/conversation/${id}/message`,
      { method: 'POST', body: JSON.stringify(body) },
      sid,
    ),
  editFileOutput: (id: number, fileOutput: IFileOutputSettings, sid: string) =>
    request<IConversation>(
      `/conversation/${id}`,
      { method: 'PUT', body: JSON.stringify({ fileOutput }) },
      sid,
    ),
  directory: async (path: string) => {
    const result = await request<IPagination<IGnosisFile>>(
      `/file?${new URLSearchParams({ pageSize: '1', pageIndex: '0', conditions: JSON.stringify({ uid: path.split('/').at(-1), type: 'DIRECTORY' }) })}`,
    );
    if (!result.items[0]) throw new Error('Папка недоступна');
    return result.items[0];
  },
  fileTags: (search: string, page: number) =>
    request<IPagination<{ tag: string; count: number }>>(
      `/fileTag?${new URLSearchParams({ search, pageIndex: String(page), pageSize: '20' })}`,
    ),
  browseFiles: (
    page: number,
    directory: string | null,
    search = '',
    foldersOnly = false,
    type = '',
    tags: string[] = [],
    tagMatch: 'all' | 'any' = 'all',
  ) => {
    const conditions: Record<string, unknown> = {};
    if (!search && !tags.length)
      conditions.directory = directory || { condition: 'NULL', type: 'STRING', value: null };
    if (search)
      conditions.name = {
        condition: 'CONTAINS',
        type: 'STRING',
        value: `%${search.replace(/[\\%_]/g, '\\$&')}%`,
      };
    if (tags.length)
      conditions.tags = {
        type: 'ARRAY',
        condition: tagMatch === 'all' ? 'INCLUDES_ALL' : 'INCLUDES_ONE_OF',
        value: tags,
      };
    if (foldersOnly) conditions.type = 'DIRECTORY';
    else if (type === 'DOCUMENT')
      conditions.mime = [
        'text/plain',
        'text/markdown',
        'application/pdf',
        'application/msword',
        'application/json',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];
    else if (type)
      conditions.mime = { condition: 'CONTAINS', type: 'STRING', value: `${type.toLowerCase()}/%` };

    return request<IPagination<IGnosisFile>>(
      `/file?${new URLSearchParams({ pageSize: '24', pageIndex: String(page), sort: JSON.stringify({ createdDate: false }), conditions: JSON.stringify(conditions) })}`,
    );
  },
  createDirectory: (name: string, directory: string | null) =>
    request<IGnosisFile>('/fileDirectory', { method: 'POST', body: JSON.stringify({ name, directory }) }),
  createFileLink: (to: number, directory: string | null) =>
    request<IGnosisFile>('/fileLink', {
      method: 'POST',
      body: JSON.stringify({ to, ...(directory ? { directory } : {}) }),
    }),
  editFile: (id: number, changes: { name?: string; tags?: string[]; directory?: string | null }) =>
    request<IGnosisFile>(`/file/${id}`, { method: 'PUT', body: JSON.stringify(changes) }),
  removeFile: (id: number) => request<void>(`/file/${id}`, { method: 'DELETE' }),
  file: (id: number, sid?: string) => request<IGnosisFile>(`/file/${id}`, {}, sid),
  createPreview: (id: number) => request<IPreview>(`/file/${id}/preview`, { method: 'POST' }),
  upload: (file: File, sid?: string, context?: IFileOutputSettings) => {
    const data = new FormData();
    data.append('file', file);
    if (context?.directory) data.append('directory', context.directory);
    if (context?.tags !== undefined) data.append('tags', JSON.stringify(context.tags));
    return request<IGnosisFile>('/file', { method: 'POST', body: data }, sid);
  },
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
