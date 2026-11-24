import type { QueryClient } from '@tanstack/react-query';
import type { IInitResponse, ITaskExecution, ITaskFinished } from '../../lib/types';
import { apiErrorMessage } from '../../lib/errorMessages';
import { refreshFilePreview } from './filePreviewRefresh';
import { matchesRefresh, refreshTargets, taskConversationId, type RefreshTarget } from './refreshTargets';
import { observeTabReturn } from './tabRefresh';

export interface IRealtimeEvent {
  name?: string;
  data?: {
    id?: number | string;
    session?: string;
    item?: Partial<ITaskExecution> & { status?: string };
    result?: string;
    fileIds?: number[];
    error?: ITaskFinished['error'] & { status?: number };
  };
}

function isTaskExecution(item: Partial<ITaskExecution> | undefined): item is ITaskExecution {
  return (
    typeof item?.id === 'string' && typeof item.model === 'string' && typeof item.createdDate === 'string'
  );
}

const modelResources = [
  'model-catalog',
  'models',
  'conversation-models',
  'video-analysis-models',
  'content-studio-models',
  'generation-models',
  'audio-models',
  'audio-tools',
  'retained-model',
];
const resources = [
  ...modelResources,
  'account',
  'conversation',
  'conversations',
  'messages',
  'agent-messages',
  'prompt-messages',
  'active-jobs',
  'active-tasks',
  'files',
  'artifacts',
  'file-preview',
  'transactions',
  'transaction-results',
  'conversation-progress',
];

/** Session-scoped cache updates and reconciliation policy, independent of React. */
export class QueryRefreshService {
  private readonly pending = new Map<string, RefreshTarget>();
  private readonly previewRequests = new Set<number>();
  private timer?: ReturnType<typeof setTimeout>;
  private fallback?: ReturnType<typeof setInterval>;
  private nextRefresh = 0;
  private disposed = false;
  private started = false;
  private connected = false;
  private shouldRefreshOnConnect = false;
  private stopObserving?: () => void;

  public constructor(
    private readonly client: QueryClient,
    private readonly userId: number,
    private readonly isCurrent: () => boolean,
    private readonly session?: string,
  ) {}

  public start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.stopObserving = observeTabReturn(this.refreshVisible, () => this.connected);
    window.addEventListener('online', this.refreshVisible);
    window.addEventListener('pageshow', this.onPageShow);
    this.setConnected(false);
  }

  public setConnected(connected: boolean): void {
    if (this.disposed) return;
    const reconnected = connected && !this.connected && this.shouldRefreshOnConnect;
    this.connected = connected;
    if (connected) {
      clearInterval(this.fallback);
      this.fallback = undefined;
      if (reconnected) this.schedule();
      this.shouldRefreshOnConnect = true;
    } else if (this.started && !this.fallback) {
      this.fallback = setInterval(() => {
        this.shouldRefreshOnConnect = true;
        this.refreshVisible();
      }, 15000);
    }
  }

  public roomJoined(room: string): void {
    const id = taskConversationId(room);
    if (id)
      this.schedule(
        ['conversation', 'messages', 'agent-messages', 'prompt-messages', 'conversation-progress'],
        id,
      );
  }

  public schedule(keys = resources, conversationId?: unknown, fileId?: unknown): void {
    const affected = keys.includes('files') || keys.includes('conversations') ? [...keys, 'artifacts'] : keys;
    this.enqueue(refreshTargets(affected, conversationId, fileId));
  }

  private updateAccountBalance(data: unknown): void {
    const balances = Object.fromEntries(
      Object.entries(data && typeof data === 'object' && !Array.isArray(data) ? data : {}).filter(
        ([coin, value]) =>
          /^[A-Z][A-Z0-9_]*$/.test(coin) && typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value),
      ),
    ) as Record<string, string>;
    const key = ['account', this.session];
    const account = this.client.getQueryState<IInitResponse>(key);
    if (!Object.keys(balances).length || !account?.data || account.fetchStatus === 'fetching') {
      this.schedule(['account', 'transactions']);
      return;
    }
    this.client.setQueryData<IInitResponse>(key, {
      ...account.data,
      balances: { ...account.data.balances, ...balances },
    });
    this.schedule(['transactions']);
  }

  public receive(event: IRealtimeEvent): void {
    if (this.disposed || !this.isCurrent()) return;
    const { name = '', data = {} } = event || {};
    if (
      name === 'ConversationErroredEvent' &&
      typeof data.id === 'number' &&
      Number.isSafeInteger(data.id) &&
      data.id > 0
    ) {
      this.client.setQueryData(
        ['conversation-error', this.userId, data.id],
        apiErrorMessage(data.error, data.error?.status || 500),
      );
    }
    if (
      (name === 'ConversationChangedEvent' && ['LOADING', 'LOADED'].includes(data.item?.status || '')) ||
      name === 'ConversationClearedEvent' ||
      name === 'ConversationRemovedEvent'
    ) {
      this.client.setQueryData(['conversation-error', this.userId, data.id], '');
    }
    const progressId = name === 'TaskProgressedEvent' ? taskConversationId(data.session) : undefined;
    if (progressId) {
      this.client.setQueryData(['conversation-progress', this.userId, progressId], {
        value: data,
        at: Date.now(),
      });
      return;
    }
    const item = data.item;
    const taskKey = ['active-tasks', this.userId];
    const taskState = this.client.getQueryState<ITaskExecution[]>(taskKey);
    const hasTaskSnapshot = taskState?.data !== undefined && taskState.fetchStatus === 'idle';
    if (name === 'TaskStartedEvent' && isTaskExecution(item) && item.id === data.id) {
      this.client.setQueryData<ITaskExecution[]>(taskKey, (previous) => [
        ...(previous || []).filter((previousItem) => previousItem.id !== data.id),
        item,
      ]);
    }
    if (name === 'TaskFinishedEvent' && typeof data.id === 'string') {
      this.client.setQueryData<ITaskExecution[]>(taskKey, (previous) =>
        (previous || []).filter((item) => item.id !== data.id),
      );
      const result = data.result;
      if (
        isTaskExecution(item) &&
        item.id === data.id &&
        (result === 'COMPLETED' || result === 'FAILED' || result === 'CANCELLED')
      ) {
        const notice: ITaskFinished = {
          id: data.id,
          item,
          result,
          fileIds: data.fileIds,
          error: data.error,
        };
        this.client.setQueryData<ITaskFinished[]>(['task-notices', this.userId], (previous) =>
          [notice, ...(previous || []).filter((previousItem) => previousItem.id !== notice.id)].slice(0, 8),
        );
      }
    }
    if (name === 'AiModelChangedEvent') this.schedule(modelResources);
    else if (name.startsWith('Conversation'))
      this.schedule(
        ['conversation', 'conversations', 'messages', 'agent-messages', 'prompt-messages', 'active-jobs'],
        data.id,
      );
    else if (
      name === 'FilePreviewChangedEvent' &&
      typeof data.id === 'number' &&
      Number.isSafeInteger(data.id) &&
      data.id > 0
    )
      this.schedule(['file-preview-update', 'conversation-covers', 'artifacts'], undefined, data.id);
    else if (name === 'FileAddedEvent') this.schedule(['files']);
    else if (name.startsWith('File'))
      this.schedule(['files', 'file-preview', 'conversation-covers'], undefined, data.id);
    else if (name === 'CoinBalanceChangedEvent') this.updateAccountBalance(data);
    else if (name === 'TaskStartedEvent' || name === 'TaskFinishedEvent') {
      const conversationId = taskConversationId(data.session ?? data.item?.session);
      const canUpdateTask = hasTaskSnapshot && isTaskExecution(item) && item.id === data.id;
      this.schedule(
        [
          ...(conversationId
            ? [
                'conversation',
                'messages',
                'agent-messages',
                'prompt-messages',
                'conversation-progress',
                'conversations',
                'active-jobs',
              ]
            : []),
          ...(canUpdateTask ? [] : ['active-tasks']),
          ...(name === 'TaskFinishedEvent' ? ['transactions', 'transaction-results', 'files'] : []),
        ],
        conversationId,
      );
    }
  }

  public enqueue = (targets: RefreshTarget[]): void => {
    if (this.disposed || !this.isCurrent()) return;
    for (const target of targets) this.pending.set(`${target.resource}:${target.id ?? '*'}`, target);
    if (this.timer || !this.pending.size) return;
    this.timer = setTimeout(this.flush, Math.max(250, this.nextRefresh - Date.now()));
  };

  private flush = (): void => {
    this.timer = undefined;
    if (this.disposed || !this.isCurrent()) {
      this.pending.clear();
      return;
    }
    this.nextRefresh = Date.now() + 5000;
    const queued = [...this.pending.values()];
    this.pending.clear();
    const targets = queued.filter((target) => target.resource !== 'file-preview-update');
    for (const target of queued.filter((target) => target.resource === 'file-preview-update')) {
      if (!this.session || !target.id) continue;
      if (this.previewRequests.has(target.id) || this.previewRequests.size >= 3) {
        this.enqueue([target]);
        continue;
      }
      const id = target.id;
      this.previewRequests.add(id);
      void refreshFilePreview(
        this.client,
        this.userId,
        id,
        this.session,
        () => !this.disposed && this.isCurrent(),
      )
        .then((updated) => {
          if (!updated) this.enqueue([target]);
        })
        .catch(() =>
          this.enqueue(
            refreshTargets(
              ['files', 'file-preview', 'messages', 'agent-messages', 'prompt-messages'],
              undefined,
              id,
            ),
          ),
        )
        .finally(() => this.previewRequests.delete(id));
    }
    const fetching = this.client.getQueryCache().findAll({
      predicate: (query) =>
        query.state.fetchStatus === 'fetching' && matchesRefresh(query.queryKey, targets, this.userId),
    });
    // A change received during a fetch must be reconciled after it finishes.
    // Do not cancel the fetch, or discard the event when that fetch succeeds.
    this.enqueue(
      targets.filter((target) =>
        fetching.some((query) => matchesRefresh(query.queryKey, [target], this.userId)),
      ),
    );
    void this.client.invalidateQueries(
      {
        predicate: (query) =>
          !fetching.includes(query) && matchesRefresh(query.queryKey, targets, this.userId),
      },
      { cancelRefetch: false },
    );
  };

  private refreshVisible = (): void => {
    if (document.hidden || !navigator.onLine) return;
    this.schedule(resources.filter((key) => !modelResources.includes(key)));
  };

  private onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) this.refreshVisible();
  };

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.timer);
    clearInterval(this.fallback);
    this.pending.clear();
    this.stopObserving?.();
    if (this.started) {
      window.removeEventListener('online', this.refreshVisible);
      window.removeEventListener('pageshow', this.onPageShow);
    }
  }
}
