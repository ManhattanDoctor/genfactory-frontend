import {
  DEFAULT_ASSISTANT,
  isAllowedProvider,
  assertAllowedProvider,
  effectiveTools,
  prepareAllowedTools,
} from './modelPolicy';
import { apiErrorMessage } from './errorMessages';
import { isHeicUpload, prepareImageUpload } from './image-upload';
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
  ITaskRequest,
  ITaskResponse,
  ITaskExecution,
} from './types';
// Leave room for multipart headers under the existing nginx 1 GiB request limit.
export const MAX_UPLOAD_BYTES = 1_000_000_000;
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
export function setSession(sid: string | null): void {
  sessionStorage.removeItem(SESSION_KEY);
  if (sid) localStorage.setItem(SESSION_KEY, sid);
  else localStorage.removeItem(SESSION_KEY);
}
let pendingWrites = 0;
export const hasPendingWrites = () => pendingWrites > 0;
function notifyWrites(): void {
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
      const message = apiErrorMessage(data, res.status);
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
export interface IUploadProgress {
  loaded: number;
  total?: number;
  phase: 'uploading' | 'processing';
  fileName: string;
}
async function uploadFile(
  file: File,
  sid?: string,
  context?: IFileOutputSettings,
  onProgress?: (progress: IUploadProgress) => void,
): Promise<IGnosisFile> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Максимальный размер загружаемого файла — 1 ГБ.');
  const session = sid ?? getSession();
  pendingWrites++;
  notifyWrites();
  try {
    if (isHeicUpload(file)) {
      onProgress?.({ loaded: 0, total: file.size, phase: 'processing', fileName: file.name });
      file = await prepareImageUpload(file);
      if (session !== getSession())
        throw new DOMException('Загрузка отменена после смены аккаунта.', 'AbortError');
    }
    const data = new FormData();
    data.append('file', file);
    if (context?.directory) data.append('directory', context.directory);
    if (context?.tags !== undefined) data.append('tags', JSON.stringify(context.tags));
    return await new Promise<IGnosisFile>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}/file`);
      xhr.responseType = 'json';
      if (session) xhr.setRequestHeader('Authorization', `Bearer ${session}`);
      const progress = (loaded: number, total: number | undefined, phase: IUploadProgress['phase']) =>
        onProgress?.({ loaded, total, phase, fileName: file.name });
      xhr.upload.onprogress = (event) =>
        progress(event.loaded, event.lengthComputable ? event.total : undefined, 'uploading');
      xhr.upload.onload = () => progress(file.size, file.size, 'processing');
      xhr.onerror = () =>
        reject(
          new ApiError(
            'Соединение прервалось при загрузке файла. Проверьте библиотеку перед повторной загрузкой.',
            0,
          ),
        );
      xhr.onabort = () => reject(new DOMException('Загрузка отменена.', 'AbortError'));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (!xhr.response || typeof xhr.response.id !== 'number')
            return reject(new ApiError('Сервер не вернул загруженный файл.', xhr.status));
          resolve(xhr.response);
          return;
        }
        if (xhr.status === 401 && session === getSession())
          window.dispatchEvent(new Event('genfactory:unauthorized'));
        const response = xhr.response;
        const message =
          xhr.status === 413
            ? 'Сервер отклонил загрузку из-за размера файла. Максимальный размер — 1 ГБ.'
            : apiErrorMessage(response, xhr.status);
        reject(new ApiError(message, xhr.status, response?.details));
      };
      progress(0, file.size, 'uploading');
      xhr.send(data);
    });
  } finally {
    pendingWrites--;
    notifyWrites();
  }
}
export const api = {
  tasks: (signal?: AbortSignal, sid?: string) =>
    request<ITaskExecution[]>('/task', { signal }, sid).then((items) => {
      if (!Array.isArray(items)) throw new Error('Не удалось прочитать список задач.');
      return items;
    }),
  task: async (body: ITaskRequest, sid: string) => {
    assertAllowedProvider(body.model);
    const tools = await prepareAllowedTools(
      body.options.tools as IConversation['options']['tools'],
      (provider) => api.catalog(provider, undefined, sid),
    );
    return request<ITaskResponse>(
      '/task',
      {
        method: 'POST',
        body: JSON.stringify({ ...body, options: { ...body.options, ...(tools ? { tools } : {}) } }),
      },
      sid,
    );
  },
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
  catalog: async (provider: string, signal?: AbortSignal, sid?: string) => {
    if (!isAllowedProvider(provider)) return [];
    const items: IModelDescription[] = [];
    for (let pageIndex = 0; ; pageIndex++) {
      const page = await request<IPagination<IModelDescription>>(
        `/aimodels?${new URLSearchParams({
          conditions: JSON.stringify({ provider, status: 'ACTIVE' }),
          pageSize: '500',
          pageIndex: String(pageIndex),
        })}`,
        { signal },
        sid,
      );
      items.push(...page.items.filter((item) => isAllowedProvider(item.reference.provider)));
      if (pageIndex + 1 >= page.pages) return items;
    }
  },
  conversationModels: async (signal?: AbortSignal) => {
    const models = await api.catalog('OPEN_ROUTER_CONVERSATION', signal);
    return [...models].sort(
      (a, b) =>
        Number(b.reference.model === DEFAULT_ASSISTANT.model) -
        Number(a.reference.model === DEFAULT_ASSISTANT.model),
    );
  },
  modelDescription: (reference: IModelDescription['reference'], signal?: AbortSignal) =>
    request<IModelDescription>(`/aimodels/details?${new URLSearchParams(reference)}`, { signal }),
  details: (provider: string, signal?: AbortSignal) =>
    request<{ tools?: IToolDescription[] }>(`/aimodel/${encodeURIComponent(provider)}`, { signal }),
  editConversation: async (
    conversation: IConversation,
    changes: { name?: string; options?: IConversation['options']; system?: string },
    sid: string,
  ) => {
    const tools = await prepareAllowedTools(changes.options?.tools, (provider) =>
      api.catalog(provider, undefined, sid),
    );
    return request<IConversation>(
      `/conversation/${conversation.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          ...changes,
          ...(tools ? { options: { ...changes.options, tools } } : {}),
          model: conversation.model,
          files: (conversation.files || []).map((f) => f.id),
        }),
      },
      sid,
    );
  },
  progress: async (session: string, signal?: AbortSignal) => {
    try {
      return await request<IConversationProgress | null>(`/task/${encodeURIComponent(session)}`, { signal });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
  conversations: (
    userId: number,
    page: number,
    signal?: AbortSignal,
    status?: string,
    tags?: Array<string>,
    search?: string,
    flags?: Pick<IConversation, 'isFavorite' | 'isArchived'>,
  ) =>
    request<IPagination<IConversation>>(
      `/conversation?${new URLSearchParams({
        pageSize: '24',
        pageIndex: String(page),
        ...(search?.trim() ? { search: search.trim() } : {}),
        sort: JSON.stringify({ createdDate: false, id: false }),
        conditions: JSON.stringify({
          userId,
          ...flags,
          ...(status ? { status } : {}),
          ...(tags?.length ? { tags: { condition: 'INCLUDES_ALL', value: tags } } : {}),
        }),
      })}`,
      { signal },
    ),
  patchConversation: (id: number, flags: Pick<IConversation, 'isFavorite' | 'isArchived'>, sid: string) =>
    request<IConversation>(`/conversation/${id}`, { method: 'PATCH', body: JSON.stringify(flags) }, sid),
  conversation: (id: number, signal?: AbortSignal, sid?: string) =>
    request<IConversation>(`/conversation/${id}`, { signal }, sid),
  createConversation: async (body: IConversationCreate, sid: string) => {
    assertAllowedProvider(body.model);
    const tools = await prepareAllowedTools(body.options.tools, (provider) =>
      api.catalog(provider, undefined, sid),
    );
    return request<IConversation>(
      '/conversation',
      {
        method: 'POST',
        body: JSON.stringify({ ...body, options: { ...body.options, ...(tools ? { tools } : {}) } }),
      },
      sid,
    );
  },
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
  sendMessage: async (id: number, body: IMessageCreate, sid: string) => {
    const conversation = await api.conversation(id, undefined, sid);
    assertAllowedProvider(conversation.model);
    const tools = body.settings?.isToolsDisabled
      ? []
      : await prepareAllowedTools(
          effectiveTools(conversation.options.tools, body.settings?.tools),
          (provider) => api.catalog(provider, undefined, sid),
        );
    return request<IConversationMessage>(
      `/conversation/${id}/message`,
      { method: 'POST', body: JSON.stringify({ ...body, settings: { ...body.settings, tools } }) },
      sid,
    );
  },
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
      `/fileTag?${new URLSearchParams({
        conditions: JSON.stringify(
          search.trim()
            ? {
                tag: {
                  condition: 'CONTAINS',
                  value:
                    search
                      .trim()
                      .normalize('NFC')
                      .replace(/[\\%_]/g, '\\$&') + '%',
                },
              }
            : {},
        ),
        pageIndex: String(page),
        pageSize: '20',
      })}`,
    ),
  mediaFiles: (type: 'IMAGE' | 'VIDEO', page: number, signal?: AbortSignal) =>
    request<IPagination<IGnosisFile>>(
      `/file?${new URLSearchParams({ pageSize: '24', pageIndex: String(page), sort: JSON.stringify({ createdDate: false, id: false }), conditions: JSON.stringify({ type }) })}`,
      { signal },
    ),
  imageFiles: (page: number, signal?: AbortSignal) =>
    request<IPagination<IGnosisFile>>(
      `/file?${new URLSearchParams({ pageSize: '24', pageIndex: String(page), sort: JSON.stringify({ createdDate: false, id: false }), conditions: JSON.stringify({ type: 'IMAGE' }) })}`,
      { signal },
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
  upload: uploadFile,
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
