import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { IGnosisFile, IConversationMessage, IConversation, IPagination } from '../../lib/types';

const resources = new Set([
  'files',
  'file-preview',
  'messages',
  'agent-messages',
  'prompt-messages',
  'conversation',
]);
function matches(key: QueryKey, userId: number): boolean {
  return (
    key[1] === userId &&
    resources.has(String(key[0])) &&
    !(key[0] === 'files' && ['tags', 'directory-name'].includes(String(key[2])))
  );
}
function mapItems<T>(items: T[], update: (item: T) => T): T[] {
  const next = items.map(update);
  return next.every((item, index) => item === items[index]) ? items : next;
}
function mapPage<T>(page: IPagination<T>, update: (item: T) => T): IPagination<T> {
  const items = mapItems(page.items, update);
  return items === page.items ? page : { ...page, items };
}
function mapPages<T>(data: IPagination<T> | InfiniteData<IPagination<T>>, update: (item: T) => T) {
  if (Array.isArray(data.pages)) {
    const infinite = data as InfiniteData<IPagination<T>>;
    const pages = mapItems(infinite.pages, (page) => mapPage(page, update));
    return pages === infinite.pages ? data : { ...infinite, pages };
  }
  return mapPage(data as IPagination<T>, update);
}

/** Preview-only updates preserve pagination, metadata and unchanged item identities. */
export function applyFilePreview(client: QueryClient, userId: number, file: IGnosisFile): void {
  const updateFile = (item: IGnosisFile): IGnosisFile =>
    item.userId === userId && (item.id === file.id || item.linkTo === file.id)
      ? { ...item, preview: file.preview }
      : item;
  const updateMessage = <T extends { files?: IGnosisFile[] }>(item: T): T => {
    if (!item.files) return item;
    const files = mapItems(item.files, updateFile);
    return files === item.files ? item : { ...item, files };
  };
  for (const query of client
    .getQueryCache()
    .findAll({ predicate: (query) => matches(query.queryKey, userId) })) {
    const data = query.state.data;
    if (!data) continue;
    let next: unknown = data;
    switch (query.queryKey[0]) {
      case 'files':
        next = mapPages(
          data as IPagination<IGnosisFile> | InfiniteData<IPagination<IGnosisFile>>,
          updateFile,
        );
        break;
      case 'file-preview':
        next = updateFile(data as IGnosisFile);
        break;
      case 'messages':
      case 'agent-messages':
      case 'prompt-messages':
        next = mapPages(
          data as IPagination<IConversationMessage> | InfiniteData<IPagination<IConversationMessage>>,
          updateMessage,
        );
        break;
      case 'conversation':
        next = updateMessage(data as IConversation);
        break;
    }
    if (next !== data) {
      const invalidated = query.state.isInvalidated;
      client.setQueryData(query.queryKey, next, { updatedAt: query.state.dataUpdatedAt });
      if (invalidated) query.invalidate();
    }
  }
}

export async function refreshFilePreview(
  client: QueryClient,
  userId: number,
  id: number,
  session: string,
  isCurrent: () => boolean,
): Promise<boolean> {
  // A list fetch that started before the event could overwrite a newer preview.
  const fetching = () => client.isFetching({ predicate: (query) => matches(query.queryKey, userId) }) > 0;
  if (fetching()) return false;
  const file = await api.file(id, session);
  if (!isCurrent()) return true;
  if (fetching()) return false;
  if (file.userId !== userId || file.id !== id) throw new Error('Unexpected preview file');
  applyFilePreview(client, userId, file);
  return true;
}
