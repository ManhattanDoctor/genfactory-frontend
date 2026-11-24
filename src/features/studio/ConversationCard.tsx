import { HistoryCardBody } from '../../components/HistoryCardBody';
import { previewCardStyle } from '../../components/previewCardStyle';
import type { ReactElement, ReactNode } from 'react';
import { Heart, Clock3, CircleAlert } from 'lucide-react';
import { ConversationCover } from './ConversationCover';
import type { IConversation } from '../../lib/types';

export type IConversationCardData = Pick<
  IConversation,
  'id' | 'name' | 'status' | 'createdDate' | 'lastMessageDate' | 'preview' | 'tags' | 'isFavorite'
> &
  Partial<Pick<IConversation, 'options'>> & { messageCount?: number };

export function historyDay(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Сегодня';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function historyDate(value: string | number | Date): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === today.toDateString()) return `Сегодня, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Вчера, ${time}`;
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}),
    hour: '2-digit',
    minute: '2-digit',
  });
}

function messageWord(count: number): string {
  const category = new Intl.PluralRules('ru-RU').select(count);
  return category === 'one' ? 'сообщение' : category === 'few' ? 'сообщения' : 'сообщений';
}

/** Existing History card; heading and actions remain owned by the page. */
export function ConversationCard({
  conversation: c,
  onOpen,
  title,
  opening = false,
  heading,
  sourceBelowTitle = false,
  children,
}: {
  conversation: IConversationCardData;
  onOpen: () => void;
  title?: string;
  opening?: boolean;
  heading?: ReactNode;
  sourceBelowTitle?: boolean;
  children?: ReactNode;
}): ReactElement {
  const source = c.tags?.includes('content-studio') && (
    <span className="history-source">Студия контента</span>
  );
  return (
    <article style={previewCardStyle(c.preview)} className="generation-card history-card">
      <button
        type="button"
        className="history-card-link"
        aria-description={title}
        aria-label={`Открыть результат ${c.name}`}
        aria-busy={opening}
        onClick={onOpen}
      />
      <header className={sourceBelowTitle ? 'artifact-preview-header' : undefined}>
        <div className="history-visual">
          <ConversationCover conversation={c} isStatic />
          <div className="history-badges">
            {!sourceBelowTitle && source}
            {c.status !== 'LOADED' && (
              <span className="history-status" data-status={c.status}>
                {c.status === 'LOADING' ? (
                  <Clock3 size={14} aria-hidden="true" />
                ) : (
                  <CircleAlert size={14} aria-hidden="true" />
                )}
                {c.status === 'LOADING' ? 'В работе' : 'Нужно проверить результат'}
              </span>
            )}
          </div>
          {!!c.isFavorite && (
            <Heart className="history-favorite-mark" size={18} fill="currentColor" aria-label="В избранном" />
          )}
        </div>
        {!sourceBelowTitle && (heading ?? <h2>{c.name}</h2>)}
      </header>
      {sourceBelowTitle ? (
        <HistoryCardBody
          title={c.name}
          source={c.tags?.includes('content-studio') ? 'Студия контента' : undefined}
          metadata={
            c.messageCount !== undefined ? `${c.messageCount} ${messageWord(c.messageCount)}` : 'Беседа'
          }
          date={
            <time dateTime={new Date(c.lastMessageDate || c.createdDate).toISOString()}>
              {historyDate(c.lastMessageDate || c.createdDate)}
            </time>
          }
        />
      ) : (
        <div className="history-meta">
          <p className="small muted">
            <span className="history-message-count">
              {c.messageCount !== undefined ? `${c.messageCount} ${messageWord(c.messageCount)}` : 'Беседа'}
            </span>
            <time dateTime={new Date(c.lastMessageDate || c.createdDate).toISOString()}>
              {historyDate(c.lastMessageDate || c.createdDate)}
            </time>
          </p>
        </div>
      )}
      {children}
    </article>
  );
}
