import { downloadFile } from '../../lib/files';
import type { ReactElement } from 'react';
import { Heart, ChevronLeft, ChevronRight, LayoutGrid, Archive, Clock3 } from 'lucide-react';
import './history.css';
import { ConversationActions } from './ConversationActions';
import { ConversationCard, historyDay } from './ConversationCard';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { getSession } from '../../lib/api';
import type { IConversation, IPagination } from '../../lib/types';
import { connection } from './conversations';
import { historyResult } from './historyResult';
import { MediaPreview } from '../../components/MediaPreview';
import type { IGnosisFile } from '../../lib/types';
function historyModelTitle(conversation: IConversation): string {
  const image = connection(conversation, 'image')?.settings?.model;
  const video = connection(conversation, 'video')?.settings?.model;
  const models = [image?.model, video?.model].filter(Boolean);
  return [
    ...(models.length ? [`Модель генерации: ${models.join(', ')}`] : []),
    `Ассистент: ${conversation.options.model}`,
  ].join('\n');
}

export function History(): ReactElement {
  const auth = useAuth();
  const [preview, setPreview] = useState<IGnosisFile>();
  const [opening, setOpening] = useState<number>();
  const resultRequest = useRef<AbortController | null>(null);
  useEffect(() => () => resultRequest.current?.abort(), []);
  useEffect(() => {
    resultRequest.current?.abort();
    setPreview(undefined);
    setOpening(undefined);
  }, [auth.session]);
  async function openResult(c: IConversation, download = false): Promise<void> {
    if (!auth.session || c.userId !== auth.user?.id) return;
    resultRequest.current?.abort();
    const controller = new AbortController();
    resultRequest.current = controller;
    const sid = auth.session;
    const timer = setTimeout(() => controller.abort(), 30000);
    setOpening(c.id);
    setError('');
    try {
      const file = await historyResult(c, sid, controller.signal);
      if (controller.signal.aborted || getSession() !== sid) return;
      if (download) {
        await downloadFile(file, sid);
      } else {
        client.setQueryData(['file-preview', file.userId, file.id], file);
        setPreview(file);
      }
    } catch (e) {
      if (!controller.signal.aborted && getSession() === sid)
        setError(e instanceof Error ? e.message : 'Не удалось открыть результат.');
    } finally {
      clearTimeout(timer);
      if (resultRequest.current === controller) setOpening(undefined);
    }
  }
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
  ): Promise<void> => {
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
    const closeOutside = (event: PointerEvent): void => {
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
  const rename = async (c: IConversation): Promise<void> => {
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
      <h1 className="sr-only">Беседы</h1>
      {preview && <MediaPreview file={preview} files={[preview]} onClose={() => setPreview(undefined)} />}
      {!auth.user ? (
        <div className="empty-state">
          <p>Войдите, чтобы открыть беседы.</p>
          <button className="button primary" onClick={() => void auth.signIn()}>
            Войти
          </button>
        </div>
      ) : (
        <>
          <div className="library-toolbar">
            <div className="chips">
              {(
                [
                  ['all', 'Все', LayoutGrid],
                  ['running', 'В работе', Clock3],
                  ['favorite', 'Избранное', Heart],
                  ['archive', 'Архив', Archive],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  className={`chip ${filter === id ? 'active' : ''}`}
                  aria-label={label}
                  title={label}
                  aria-pressed={filter === id}
                  onClick={() => {
                    setFilter(id);
                    setPagination({ userId: auth.user?.id, page: 0, query });
                  }}
                >
                  <Icon size={18} aria-hidden="true" />
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
              Загружаем беседы…
            </p>
          )}
          {list.error && (
            <p className="error" role="alert">
              Не удалось загрузить беседы.{' '}
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
                    ? 'Нет бесед в работе'
                    : filter === 'favorite'
                      ? 'Нет избранных бесед'
                      : filter === 'archive'
                        ? 'Архив пуст'
                        : !list.data.items.length
                          ? 'Пока нет бесед'
                          : 'Беседы на этой странице в архиве'}
              </h2>
              <p>
                {search.trim()
                  ? 'Попробуйте другие слова или сбросьте поиск.'
                  : filter === 'favorite'
                    ? 'Отмечайте беседы сердечком, чтобы возвращаться к ним.'
                    : filter === 'archive'
                      ? 'Здесь доступны беседы, которые вы убрали в архив.'
                      : filter === 'running'
                        ? 'Беседы с выполняющимся запросом появятся здесь.'
                        : !list.data.items.length
                          ? 'Начните новую беседу.'
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
                    Все беседы
                  </button>
                ) : list.data.items.length ? (
                  <button className="button" onClick={() => setFilter('archive')}>
                    Открыть архив
                  </button>
                ) : (
                  <>
                    <Link className="button primary" to="/chat">
                      Новая беседа
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
                <ConversationCard
                  conversation={c}
                  onOpen={() => void openResult(c)}
                  title={historyModelTitle(c)}
                  opening={opening === c.id}
                  heading={
                    editing === c.id ? (
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
                    )
                  }
                >
                  <ConversationActions
                    conversation={c}
                    busy={opening === c.id || !!optimistic}
                    onDownload={() => void openResult(c, true)}
                    onArchive={() => void changeFlags(c, { isArchived: !c.isArchived })}
                    onRename={() => {
                      setEditing(c.id);
                      setName(c.name);
                      setError('');
                    }}
                  />
                </ConversationCard>
              </Fragment>
            ))}
          </div>
          {list.data && list.data.pages > 1 && (
            <div className="pagination">
              <button
                className="button"
                aria-label="Предыдущая страница"
                title="Предыдущая страница"
                disabled={!page}
                onClick={() => setPagination({ userId: auth.user?.id, page: page - 1, query })}
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span>
                {page + 1} / {list.data.pages}
              </span>
              <button
                className="button"
                aria-label="Следующая страница"
                title="Следующая страница"
                disabled={page + 1 >= list.data.pages}
                onClick={() => setPagination({ userId: auth.user?.id, page: page + 1, query })}
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
