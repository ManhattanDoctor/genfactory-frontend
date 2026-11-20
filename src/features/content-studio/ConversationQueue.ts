import type { QueryClient } from '@tanstack/react-query';
import { api, getSession } from '../../lib/api';
import type { IMessageCreate, IToolConnection } from '../../lib/types';
import { scheduleRefresh } from '../realtime/queryRefresh';
import { prepareStudioConversation } from './prepareStudioConversation';

interface Entry {
  id: string;
  title: string;
  body: IMessageCreate;
  tools: IToolConnection[];
}

interface State {
  waiting: Entry[];
  sending?: Entry & { afterMessageId: number };
  pause?: string;
}

export class ConversationQueue {
  private state: State = { waiting: [] };
  private running = false;
  private allowPreviousError = false;
  private listeners = new Set<() => void>();
  private readonly key: string;

  constructor(
    private client: QueryClient,
    private user: number,
    private id: number,
    private sid: string,
  ) {
    this.key = `genfactory.chat.queue.${user}.${id}`;
    const saved = sessionStorage.getItem(this.key);
    if (saved) {
      this.state = JSON.parse(saved);
      this.state.pause = this.state.sending
        ? 'Проверьте последнее сообщение в истории перед продолжением.'
        : 'Очередь приостановлена после возвращения.';
    }
  }

  get occupied() {
    return !!(this.state.waiting.length || this.state.sending || this.state.pause);
  }

  pauseAfterFailure() {
    if (this.occupied)
      this.save({ ...this.state, pause: 'Предыдущий запрос прерван. Проверьте результат в истории.' });
  }

  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private save(state: State) {
    if (state.waiting.length || state.sending || state.pause)
      sessionStorage.setItem(this.key, JSON.stringify(state));
    else sessionStorage.removeItem(this.key);
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  add(title: string, body: IMessageCreate, tools: IToolConnection[]) {
    const entry = structuredClone({ id: crypto.randomUUID(), title, body, tools });
    this.save({ ...this.state, waiting: [...this.state.waiting, entry] });
    void this.run();
  }

  remove(id: string) {
    const waiting = this.state.waiting.filter((item) => item.id !== id);
    this.save({
      ...this.state,
      waiting,
      pause: waiting.length || this.state.sending ? this.state.pause : undefined,
    });
  }

  async checkHistory() {
    const item = this.state.sending;
    if (!item || !this.state.pause) return;
    try {
      for (let page = 0; ; page++) {
        const messages = await api.messages(this.id, page, undefined, this.sid);
        if (getSession() !== this.sid || this.state.sending !== item) return;
        const accepted = messages.items.some(
          (message) =>
            message.id > item.afterMessageId &&
            message.role === 'USER' &&
            message.text === item.body.text &&
            JSON.stringify(message.references || []) === JSON.stringify(item.body.references || []),
        );
        if (accepted) {
          this.save({
            waiting: this.state.waiting,
            pause: 'Сообщение с этим текстом и вложениями есть в истории.',
          });
          return;
        }
        if (
          page + 1 >= messages.pages ||
          !messages.items.length ||
          messages.items.some((message) => message.id <= item.afterMessageId)
        )
          break;
      }
      this.save({
        ...this.state,
        pause: 'Подтверждения в истории пока нет. Можно проверить ещё раз или пропустить запрос.',
      });
    } catch {
      if (getSession() === this.sid && this.state.sending === item)
        this.save({ ...this.state, pause: 'Не удалось проверить историю беседы.' });
    }
  }

  resume() {
    this.save({ waiting: this.state.waiting });
    this.allowPreviousError = true;
    void this.run();
  }

  private async run() {
    if (this.running || this.state.pause) return;
    this.running = true;
    const current = () => getSession() === this.sid;
    try {
      while (current() && this.state.waiting.length && !this.state.pause) {
        const item = this.state.waiting[0];
        const fresh = await api.conversation(this.id, undefined, this.sid);
        if (!current() || this.state.waiting[0] !== item || this.state.pause) continue;
        if (fresh.userId !== this.user) throw new Error('Беседа недоступна.');
        if (
          fresh.status === 'LOADING' ||
          this.client.isMutating({
            mutationKey: ['send-message', this.user],
            predicate: (mutation) => (mutation.state.variables as { id?: number })?.id === this.id,
          })
        ) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
        if (fresh.status === 'ERROR' && !this.allowPreviousError)
          throw new Error('Предыдущий запрос завершился ошибкой.');
        this.allowPreviousError = false;
        const history = await api.messages(this.id, 0, undefined, this.sid);
        if (!current() || this.state.waiting[0] !== item || this.state.pause) continue;
        const afterMessageId = Math.max(0, ...history.items.map((message) => message.id));
        const active = () => current() && this.state.waiting[0] === item && !this.state.pause;
        const edited = await prepareStudioConversation(fresh, item.body, item.tools, this.sid);
        if (!active()) continue;
        this.client.setQueryData(['conversation', this.user, this.id], edited);
        this.save({ waiting: this.state.waiting.slice(1), sending: { ...item, afterMessageId } });
        try {
          await this.client
            .getMutationCache()
            .build(this.client, {
              mutationKey: ['send-message', this.user],
              retry: false,
              mutationFn: ({ id, body, sid }: { id: number; body: IMessageCreate; sid: string }) =>
                api.sendMessage(id, body, sid),
            })
            .execute({ id: this.id, body: item.body, sid: this.sid });
        } finally {
          if (current())
            scheduleRefresh(
              this.client,
              this.user,
              this.sid,
              [
                'conversation',
                'messages',
                'conversations',
                'files',
                'account',
                'active-jobs',
                'active-tasks',
              ],
              this.id,
            );
        }
        if (current()) this.save({ waiting: this.state.waiting });
      }
    } catch (error) {
      if (current())
        this.save({
          ...this.state,
          pause: [
            error instanceof Error ? error.message : 'Не удалось отправить запрос.',
            this.state.sending ? 'Проверьте результат в истории.' : '',
          ]
            .join(' ')
            .trim(),
        });
    } finally {
      this.running = false;
    }
  }
}

const queues = new Map<number, ConversationQueue>();
let session: string | undefined;
export function conversationQueue(client: QueryClient, user: number, id: number, sid: string) {
  if (session !== sid) {
    queues.clear();
    session = sid;
  }
  let queue = queues.get(id);
  if (!queue) {
    queue = new ConversationQueue(client, user, id, sid);
    queues.set(id, queue);
  }
  return queue;
}
