import { conversationUrl } from '../../lib/conversationUrl';
import {
  Heart,
  Pencil,
  Archive,
  ArchiveRestore,
  Clock3,
  CircleAlert,
  MessageCircle,
  Image,
  Video,
  AudioLines,
  MoreHorizontal,
} from 'lucide-react';
import './history.css';
import { ConversationCover } from './ConversationCover';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { getSession } from '../../lib/api';
import type { IConversation, IPagination } from '../../lib/types';
import { connection } from './conversations';
function historyDate(value: string | number | Date) {
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

function historyDay(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Сегодня';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function History() {
  const auth = useAuth();
  const client = useQueryClient();
  const [filter, setFilter] = useState('all');
  const flagRequest = useRef(false);
  const [optimistic, setOptimistic] = useState<{
    session: string;
    id: number;
    flags: Pick<IConversation, 'isFavorite' | 'isArchived'>;
  }>();
  const changeFlags = async (
    conversation: IConversation,
    flags: Pick<IConversation, 'isFavorite' | 'isArchived'>,
  ) => {
    if (!auth.session || conversation.userId !== auth.user?.id || flagRequest.current) return;
    const sid = auth.session;
    const userId = auth.user.id;
    flagRequest.current = true;
    setError('');
    setOptimistic({ session: sid, id: conversation.id, flags });
    try {
      const result = await api.patchConversation(conversation.id, flags, sid);
      if (getSession() !== sid) return;
      client.setQueriesData<IPagination<IConversation>>({ queryKey: ['conversations', userId] }, (current) =>
        current?.items
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === result.id
                  ? { ...item, isFavorite: result.isFavorite, isArchived: result.isArchived }
                  : item,
              ),
            }
          : current,
      );
      await client.invalidateQueries({ queryKey: ['conversations', userId] });
      void client.invalidateQueries({ queryKey: ['conversation', userId, conversation.id] });
    } catch (error) {
      if (getSession() === sid)
        setError(error instanceof Error ? error.message : 'Не удалось сохранить отметку.');
    } finally {
      flagRequest.current = false;
      setOptimistic(undefined);
    }
  };
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      const value = search.trim();
      if (value === query) return;
      setQuery(value);
      setPagination((previous) => ({ ...previous, page: 0, query: value }));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, query]);
  const searching = search.trim() !== query;
  const [editing, setEditing] = useState<number>();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const historyRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      for (const menu of historyRoot.current?.querySelectorAll<HTMLDetailsElement>(
        '.history-actions[open]',
      ) || []) {
        if (!menu.contains(event.target)) menu.open = false;
      }
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, []);
  const [pagination, setPagination] = useState({ userId: auth.user?.id, page: 0, query: '' });
  const page = pagination.userId === auth.user?.id && pagination.query === query ? pagination.page : 0;
  const list = useQuery({
    queryKey: ['conversations', auth.user?.id, page, filter, query, 'server-flags'],
    enabled: !!auth.user,
    queryFn: ({ signal }) =>
      api.conversations(
        auth.user!.id,
        page,
        signal,
        filter === 'running' ? 'LOADING' : undefined,
        undefined,
        query,
        { isArchived: filter === 'archive', ...(filter === 'favorite' ? { isFavorite: true } : {}) },
      ),
  });
  const rename = async (c: IConversation) => {
    if (!auth.session || saving) return;
    const sid = auth.session;
    const userId = auth.user!.id;
    if (name.trim().length < 2) {
      setError('Название должно содержать от 2 до 64 знаков.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const fresh = await api.conversation(c.id, undefined, sid);
      if (getSession() !== sid) return;
      if (fresh.userId !== userId) throw new Error('Недоступная беседа.');
      if (fresh.status === 'LOADING') throw new Error('Дождитесь завершения работы.');
      await api.editConversation(fresh, { name: name.trim() }, sid);
      if (getSession() === sid) {
        setEditing(undefined);
        void client.invalidateQueries({ queryKey: ['conversations', userId] });
        void client.invalidateQueries({ queryKey: ['conversation', userId, c.id] });
      }
    } catch (e) {
      if (getSession() === sid) setError(e instanceof Error ? e.message : 'Не удалось переименовать.');
    } finally {
      setSaving(false);
    }
  };
  const visible =
    list.data?.items
      .map((c) =>
        optimistic?.session === auth.session && optimistic.id === c.id ? { ...c, ...optimistic.flags } : c,
      )
      .filter(
        (c) =>
          c.userId === auth.user?.id &&
          (filter === 'archive' ? c.isArchived : !c.isArchived) &&
          (filter !== 'favorite' || c.isFavorite),
      ) || [];
  return (
    <div className="page-content work-history" ref={historyRoot}>
      {!auth.user ? (
        <div className="empty-state">
          <p>Войдите, чтобы открыть историю.</p>
          <button className="button primary" onClick={() => void auth.signIn()}>
            Войти
          </button>
        </div>
      ) : (
        <>
          <div className="library-toolbar">
            <div className="chips">
              {[
                ['all', 'Все'],
                ['running', 'В работе'],
                ['favorite', 'Избранное'],
                ['archive', 'Архив'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={`chip ${filter === id ? 'active' : ''}`}
                  aria-pressed={filter === id}
                  onClick={() => {
                    setFilter(id);
                    setPagination({ userId: auth.user?.id, page: 0, query });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              aria-label="Поиск по названию и запросу"
              placeholder="Поиск по названию и запросу"
              maxLength={200}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {(list.isPending || searching) && (
            <p className="history-feedback" role="status">
              Загружаем историю…
            </p>
          )}
          {list.error && (
            <p className="error" role="alert">
              Не удалось загрузить историю.{' '}
              <button className="button" onClick={() => void list.refetch()}>
                Обновить
              </button>
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {list.data && !searching && !visible.length && (
            <div className="empty-state history-empty">
              <h2>
                {search.trim()
                  ? 'Ничего не найдено'
                  : filter === 'running'
                    ? 'Нет работ в процессе'
                    : filter === 'favorite'
                      ? 'Нет избранных работ'
                      : filter === 'archive'
                        ? 'Архив пуст'
                        : !list.data.items.length
                          ? 'Пока нет работ'
                          : 'Работы на этой странице в архиве'}
              </h2>
              <p>
                {search.trim()
                  ? 'Попробуйте другие слова или сбросьте поиск.'
                  : filter === 'favorite'
                    ? 'Отмечайте работы сердечком, чтобы возвращаться к ним.'
                    : filter === 'archive'
                      ? 'Здесь доступны работы, которые вы убрали в архив.'
                      : filter === 'running'
                        ? 'Запущенные работы появятся здесь.'
                        : !list.data.items.length
                          ? 'Создайте изображение или видео.'
                          : 'Откройте архив или перейдите на другую страницу.'}
              </p>
              <div className="history-empty-actions">
                {search.trim() ? (
                  <button
                    className="button"
                    onClick={() => {
                      setSearch('');
                      setQuery('');
                      setPagination({ userId: auth.user?.id, page: 0, query: '' });
                    }}
                  >
                    Сбросить поиск
                  </button>
                ) : filter === 'favorite' || filter === 'archive' ? (
                  <button
                    className="button"
                    onClick={() => {
                      setFilter('all');
                      setPagination({ userId: auth.user?.id, page: 0, query });
                    }}
                  >
                    Все работы
                  </button>
                ) : list.data.items.length ? (
                  <button className="button" onClick={() => setFilter('archive')}>
                    Открыть архив
                  </button>
                ) : (
                  <>
                    <Link className="button primary" to="/image">
                      Создать изображение
                    </Link>
                    <Link className="button" to="/video">
                      Создать видео
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}
          <div className="history-list">
            {visible.map((c, index) => (
              <Fragment key={c.id}>
                {(index === 0 ||
                  historyDay(c.lastMessageDate || c.createdDate) !==
                    historyDay(visible[index - 1].lastMessageDate || visible[index - 1].createdDate)) && (
                  <h3 className="history-day">{historyDay(c.lastMessageDate || c.createdDate)}</h3>
                )}
                <article className="generation-card history-card">
                  <Link
                    className="history-card-link"
                    to={`/chat?conversation=${c.id}`}
                    aria-label={`Открыть беседу ${c.name}`}
                  />
                  <header>
                    <div className="history-visual">
                      <ConversationCover conversation={c} isStatic />
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
                      {!!c.isFavorite && (
                        <Heart
                          className="history-favorite-mark"
                          size={18}
                          fill="currentColor"
                          aria-label="В избранном"
                        />
                      )}
                    </div>
                    {editing === c.id ? (
                      <form
                        className="rename-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void rename(c);
                        }}
                      >
                        <input
                          aria-label="Новое название"
                          minLength={2}
                          maxLength={64}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                        <button className="button" disabled={saving}>
                          Сохранить название
                        </button>
                        <button
                          className="button"
                          type="button"
                          disabled={saving}
                          onClick={() => setEditing(undefined)}
                        >
                          Отмена
                        </button>
                      </form>
                    ) : (
                      <h2 title={c.name}>{c.name}</h2>
                    )}
                  </header>
                  <div className="history-meta">
                    <p className="small muted">
                      <time
                        dateTime={new Date(c.lastMessageDate || c.createdDate).toISOString()}
                        title={new Date(c.lastMessageDate || c.createdDate).toLocaleString('ru-RU')}
                      >
                        {historyDate(c.lastMessageDate || c.createdDate)}
                      </time>
                    </p>
                    <details
                      className="history-actions"
                      name="history-card-actions"
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.currentTarget.open = false;
                          event.currentTarget.querySelector('summary')?.focus();
                        }
                      }}
                    >
                      <summary aria-label={`Действия работы ${c.name}`} title="Действия работы">
                        <MoreHorizontal size={18} />
                      </summary>
                      <div
                        className="history-menu"
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest('button, a'))
                            event.currentTarget.closest('details')?.removeAttribute('open');
                        }}
                      >
                        {c.options.tools?.some((t) =>
                          ['TTS', 'STT'].includes(typeof t === 'string' ? t : t.uid),
                        ) && (
                          <Link
                            className="button"
                            aria-label="Аудиостудия"
                            title="Продолжить работу с аудио"
                            to={`/audio?mode=${c.tags?.includes('stt') ? 'stt' : 'tts'}&conversation=${c.id}`}
                          >
                            <AudioLines size={16} aria-hidden="true" />
                            Аудиостудия
                          </Link>
                        )}
                        {!connection(c, 'image') && !connection(c, 'video') && (
                          <Link className="button" aria-label="Открыть беседу" to={conversationUrl(c)}>
                            <MessageCircle size={16} aria-hidden="true" />
                            Беседа
                          </Link>
                        )}
                        {(connection(c, 'image') || connection(c, 'video')) && (
                          <Link
                            className="button"
                            aria-label="Обсудить работу"
                            to={`/chat?conversation=${c.id}`}
                          >
                            <MessageCircle size={16} aria-hidden="true" />
                            Беседа
                          </Link>
                        )}
                        {connection(c, 'image') && (
                          <Link
                            className="button"
                            aria-label="Студия изображений"
                            title="Продолжить работу в студии изображений"
                            to={`/image?conversation=${c.id}`}
                          >
                            <Image size={16} aria-hidden="true" />
                            Студия изображений
                          </Link>
                        )}
                        {connection(c, 'video') && (
                          <Link
                            className="button"
                            aria-label="Видеостудия"
                            title="Продолжить работу в видеостудии"
                            to={`/video?conversation=${c.id}`}
                          >
                            <Video size={16} aria-hidden="true" />
                            Видеостудия
                          </Link>
                        )}
                        <button
                          className="history-icon-button"
                          aria-label={!!c.isFavorite ? 'В избранном' : 'В избранное'}
                          title={!!c.isFavorite ? 'Убрать из избранного' : 'В избранное'}
                          aria-pressed={!!c.isFavorite}
                          disabled={!!optimistic}
                          onClick={() => void changeFlags(c, { isFavorite: !c.isFavorite })}
                        >
                          <Heart size={16} fill={!!c.isFavorite ? 'currentColor' : 'none'} />
                          {!!c.isFavorite ? 'Убрать из избранного' : 'В избранное'}
                        </button>
                        <button
                          className="history-icon-button"
                          aria-label="Переименовать"
                          title="Переименовать"
                          disabled={c.status === 'LOADING'}
                          onClick={() => {
                            setEditing(c.id);
                            setName(c.name);
                            setError('');
                          }}
                        >
                          <Pencil size={16} />
                          Переименовать
                        </button>
                        <button
                          className="history-icon-button"
                          aria-label={!!c.isArchived ? 'Вернуть из архива' : 'В архив'}
                          title={!!c.isArchived ? 'Вернуть из архива' : 'В архив'}
                          disabled={!!optimistic}
                          onClick={() => void changeFlags(c, { isArchived: !c.isArchived })}
                        >
                          {!!c.isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                          {!!c.isArchived ? 'Вернуть из архива' : 'В архив'}
                        </button>
                      </div>
                    </details>
                  </div>
                </article>
              </Fragment>
            ))}
          </div>
          {list.data && list.data.pages > 1 && (
            <div className="pagination">
              <button
                className="button"
                disabled={!page}
                onClick={() => setPagination({ userId: auth.user?.id, page: page - 1, query })}
              >
                Назад
              </button>
              <span>
                {page + 1} / {list.data.pages}
              </span>
              <button
                className="button"
                disabled={page + 1 >= list.data.pages}
                onClick={() => setPagination({ userId: auth.user?.id, page: page + 1, query })}
              >
                Далее
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
