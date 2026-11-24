const conversationResources = new Set([
  'conversation',
  'messages',
  'agent-messages',
  'prompt-messages',
  'conversation-progress',
]);
export interface RefreshTarget {
  resource: string;
  id?: number;
}
const validId = (id: unknown): id is number => Number.isSafeInteger(id) && Number(id) > 0;

export function refreshTargets(keys: string[], conversationId?: unknown, fileId?: unknown): RefreshTarget[] {
  return keys.map((resource) => ({
    resource,
    ...(conversationResources.has(resource) && validId(conversationId)
      ? { id: conversationId }
      : (resource === 'file-preview' || resource === 'file-preview-update') && validId(fileId)
        ? { id: fileId }
        : {}),
  }));
}

export function matchesRefresh(key: readonly unknown[], targets: RefreshTarget[], userId: number): boolean {
  return targets.some((target) => {
    if (target.resource === 'conversation-covers')
      return key[0] === 'conversations' && key[1] === userId && key[2] !== 'navigation';
    return (
      key[0] === target.resource && (target.id === undefined || (key[1] === userId && key[2] === target.id))
    );
  });
}

export function taskConversationId(session: unknown): number | undefined {
  if (typeof session !== 'string' || !/^conversation[1-9]\d*$/.test(session)) return undefined;
  const id = Number(session.slice('conversation'.length));
  return validId(id) ? id : undefined;
}
