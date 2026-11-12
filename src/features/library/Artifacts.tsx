import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LayoutGrid, File, MessageCircle } from 'lucide-react';
import { api, getSession } from '../../lib/api';
import type { ArtifactType, IFileArtifact, IConversationArtifact, IGnosisFile } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';
import { FileActions } from '../../components/FileActions';
import { FileCard } from '../../components/FileCard';
import { Modal } from '../../components/Modal';
import { historyResult } from '../studio/historyResult';
import { ConversationActions } from '../studio/ConversationActions';
import { ConversationCard } from '../studio/ConversationCard';
import { MediaPreview } from '../../components/MediaPreview';
import '../../components/file-browser.css';
import '../studio/history.css';
import './artifacts.css';

export function Artifacts(): ReactElement {
  const { user, session, signIn } = useAuth();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [editing, setEditing] = useState<IConversationArtifact>();
  const [name, setName] = useState('');
  const [acting, setActing] = useState<number>();
  const actionLock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      document.querySelectorAll<HTMLDetailsElement>('.artifacts-page details[open]').forEach((menu) => {
        if (!menu.contains(event.target as Node)) menu.open = false;
      });
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  async function act(
    conversation: IConversationArtifact,
    action: 'rename' | 'archive' | 'download',
  ): Promise<void> {
    const sid = getSession();
    if (!sid || actionLock.current) return;
    actionLock.current = true;
    setActing(conversation.id);
    setError('');
    const current = () => alive.current && getSession() === sid;
    try {
      if (action === 'archive')
        await api.patchConversation(conversation.id, { isArchived: !conversation.isArchived }, sid);
      else {
        const full = await api.conversation(conversation.id, undefined, sid);
        if (!current()) return;
        if (action === 'rename') await api.editConversation(full, { name: name.trim() }, sid);
        else {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 30000);
          try {
            const file = await historyResult(full, sid, controller.signal);
            if (!current()) return;
            const blob = await api.downloadFile(file.id, sid);
            if (!current()) return;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = file.name.replace(/[\\/:*?"<>|]/g, '_');
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } finally {
            clearTimeout(timer);
          }
        }
      }
      if (!current()) return;
      setEditing(undefined);
      if (action !== 'download')
        await Promise.all(
          ['artifacts', 'conversation', 'conversations'].map((key) =>
            cache.invalidateQueries({ queryKey: [key] }),
          ),
        );
    } catch (error) {
      if (current()) setError(error instanceof Error ? error.message : 'Не удалось выполнить действие.');
    } finally {
      actionLock.current = false;
      if (current()) setActing(undefined);
    }
  }
  const [type, setType] = useState<ArtifactType>();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<IGnosisFile>();
  const [opening, setOpening] = useState<number>();
  const [error, setError] = useState('');
  const openRequest = useRef(0);
  useEffect(() => {
    setPage(0);
    setPreview(undefined);
    setEditing(undefined);
    setActing(undefined);
    setOpening(undefined);
    setError('');
    return () => {
      openRequest.current++;
    };
  }, [session]);
  useEffect(() => {
    if (search.trim() === query) return;
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, query]);
  const list = useQuery({
    queryKey: ['artifacts', user?.id, type, query, page],
    enabled: !!user && !!session,
    queryFn: ({ signal }) =>
      api.artifacts(
        { pageIndex: page, pageSize: 24, search: query, conditions: type ? { type } : undefined },
        signal,
      ),
  });
  useEffect(() => {
    if (list.data && page > 0 && page >= list.data.pages) setPage(Math.max(0, list.data.pages - 1));
  }, [list.data, page]);
  async function openFile(file: IFileArtifact): Promise<void> {
    if (!session) return;
    const sid = session;
    const request = ++openRequest.current;
    setOpening(file.id);
    setError('');
    try {
      const value = await api.file(file.id, sid);
      if (request === openRequest.current && getSession() === sid) setPreview(value);
    } catch (error) {
      if (request === openRequest.current && getSession() === sid)
        setError(error instanceof Error ? error.message : 'Не удалось открыть файл.');
    } finally {
      if (request === openRequest.current && getSession() === sid) setOpening(undefined);
    }
  }
  return (
    <div className="page-content work-history library-page artifacts-page">
      <h1 className="sr-only">Артефакты</h1>
      {!user ? (
        <div className="empty-state">
          <p>Войдите, чтобы открыть артефакты.</p>
          <button className="button primary" onClick={() => void signIn()}>
            Войти в аккаунт
          </button>
        </div>
      ) : (
        <>
          <div className="library-toolbar">
            <div className="chips" aria-label="Тип артефактов">
              {(
                [
                  { value: undefined, name: 'Все', icon: LayoutGrid },
                  { value: 'FILE', name: 'Файлы', icon: File },
                  { value: 'CONVERSATION', name: 'Беседы', icon: MessageCircle },
                ] as const
              ).map((item) => (
                <button
                  key={item.name}
                  className={`chip ${type === item.value ? 'active' : ''}`}
                  aria-label={item.name}
                  title={item.name}
                  aria-pressed={type === item.value}
                  onClick={() => {
                    setType(item.value);
                    setPage(0);
                  }}
                >
                  <item.icon size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
            <input
              aria-label="Поиск артефактов"
              placeholder="Поиск по названию и запросу"
              maxLength={512}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {list.isPending && <p role="status">Загружаем артефакты…</p>}
          {list.error && (
            <div role="alert">
              <p>Не удалось загрузить артефакты.</p>
              <button className="button" onClick={() => void list.refetch()}>
                Обновить
              </button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          {list.data && !list.data.items.length && (
            <div className="empty-state">
              <h2>{query ? 'Ничего не найдено' : 'Пока нет артефактов'}</h2>
            </div>
          )}
          <div className="history-list file-browser" aria-label="Артефакты">
            {list.data?.items.map((item) =>
              item.type === 'FILE' ? (
                <article
                  className="file-entry"
                  key={`${item.type}:${item.id}`}
                  aria-busy={opening === item.id}
                >
                  <FileCard
                    source={item.workspace === 'CONTENT_STUDIO' ? 'Студия контента' : undefined}
                    file={{
                      ...item,
                      type: item.fileType,
                      origin: item.generation
                        ? { kind: 'GENERATION', generation: item.generation }
                        : undefined,
                    }}
                    disabled={opening === item.id}
                    onOpen={() => void openFile(item)}
                  />
                  <FileActions file={{ id: item.id, name: item.name, type: item.fileType }} />
                </article>
              ) : (
                <ConversationCard
                  key={`${item.type}:${item.id}`}
                  conversation={{
                    ...item,
                    lastMessageDate: item.activityDate,
                    tags: item.workspace
                      ? [
                          item.workspace === 'CONTENT_STUDIO'
                            ? 'content-studio'
                            : item.workspace.toLowerCase(),
                        ]
                      : undefined,
                  }}
                  onOpen={() => navigate(`/open?conversation=${item.id}`)}
                >
                  <ConversationActions
                    conversation={{
                      ...item,
                      tags: item.workspace === 'CONTENT_STUDIO' ? ['content-studio'] : undefined,
                    }}
                    busy={acting !== undefined}
                    onDownload={() => void act(item, 'download')}
                    onArchive={() => void act(item, 'archive')}
                    onRename={() => {
                      setEditing(item);
                      setName(item.name);
                      setError('');
                    }}
                  />
                </ConversationCard>
              ),
            )}
          </div>
          {list.data && list.data.pages > 1 && (
            <div className="pagination">
              <button
                className="button"
                aria-label="Предыдущая страница"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                {page + 1} / {list.data.pages}
              </span>
              <button
                className="button"
                aria-label="Следующая страница"
                disabled={page + 1 >= list.data.pages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}
      {editing && (
        <Modal
          title="Переименовать"
          onClose={() => {
            if (!actionLock.current) setEditing(undefined);
          }}
        >
          <form
            className="rename-form"
            onSubmit={(event) => {
              event.preventDefault();
              void act(editing, 'rename');
            }}
          >
            <input
              aria-label="Новое название"
              minLength={2}
              maxLength={64}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {error && <p role="alert">{error}</p>}
            <button className="button" disabled={acting !== undefined || name.trim().length < 2}>
              Сохранить название
            </button>
            <button
              className="button"
              type="button"
              disabled={acting !== undefined}
              onClick={() => setEditing(undefined)}
            >
              Отмена
            </button>
          </form>
        </Modal>
      )}
      {user && preview && (
        <MediaPreview file={preview} files={[preview]} onClose={() => setPreview(undefined)} />
      )}
    </div>
  );
}
