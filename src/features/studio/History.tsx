import { MediaPreview } from '../../components/MediaPreview';
import { Modal } from '../../components/Modal';
import { historyResult } from './historyResult';
import { Heart, Pencil, Archive, ArchiveRestore } from 'lucide-react';
import './history.css';
import { ConversationCover } from './ConversationCover';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { LoginDialog } from '../../components/LoginDialog';
import { api } from '../../lib/api';
import { usePreferences, toggleItem } from '../workspace/preferences';
import { useQueryClient } from '@tanstack/react-query';
import { getSession } from '../../lib/api';
import type { IConversation, IGnosisFile } from '../../lib/types';
import { connection } from './conversations';
export function History() {
  const auth = useAuth();
  const prefs = usePreferences();
  const client = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<number>();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [login, setLogin] = useState(false);
  const [preview, setPreview] = useState<IGnosisFile>();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const pendingPreview = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    pendingPreview.current?.abort();
    setOpening(false);
    setOpenError('');
    setPreview(undefined);
    return () => pendingPreview.current?.abort();
  }, [auth.session]);
  const closePreview = () => {
    pendingPreview.current?.abort();
    setOpening(false);
    setOpenError('');
    setPreview(undefined);
  };
  const openFile = async (conversation: IConversation) => {
    if (!auth.session || conversation.userId !== auth.user?.id) return;
    pendingPreview.current?.abort();
    const controller = new AbortController();
    pendingPreview.current = controller;
    const sid = auth.session;
    const current = () => !controller.signal.aborted && getSession() === sid;
    setOpenError('');
    setOpening(true);
    const timeout = setTimeout(() => {
      if (!current()) return;
      controller.abort();
      setOpening(false);
      setOpenError('Не удалось открыть файл. Попробуйте ещё раз.');
    }, 30000);
    try {
      const file = await historyResult(conversation, sid, controller.signal);
      if (current()) setPreview(file);
    } catch (error) {
      if (current()) setOpenError(error instanceof Error ? error.message : 'Не удалось открыть файл.');
    } finally {
      clearTimeout(timeout);
      if (current()) setOpening(false);
    }
  };
  const [pagination, setPagination] = useState({ userId: auth.user?.id, page: 0 });
  const page = pagination.userId === auth.user?.id ? pagination.page : 0;
  const list = useQuery({
    queryKey: ['conversations', auth.user?.id, page, filter === 'running' ? 'LOADING' : 'all'],
    enabled: !!auth.user,
    queryFn: ({ signal }) =>
      api.conversations(auth.user!.id, page, signal, filter === 'running' ? 'LOADING' : undefined),
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
    list.data?.items.filter(
      (c) =>
        c.userId === auth.user?.id &&
        c.name.toLowerCase().includes(search.toLowerCase()) &&
        (filter === 'archive' ? prefs.value.archive.includes(c.id) : !prefs.value.archive.includes(c.id)) &&
        (filter !== 'favorite' || prefs.value.favorites.includes(c.id)),
    ) || [];
  return (
    <div className="page-content work-history">
      {!auth.user ? (
        <div className="empty-state">
          <p>Войдите, чтобы открыть историю.</p>
          <button className="button primary" onClick={() => setLogin(true)}>
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
                  title={
                    id === 'archive'
                      ? 'Архив в этом браузере. Работы остаются сохранены.'
                      : id === 'favorite'
                        ? 'Избранное в этом браузере'
                        : undefined
                  }
                  onClick={() => {
                    setFilter(id);
                    setPagination({ userId: auth.user?.id, page: 0 });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              aria-label="Поиск бесед на странице"
              placeholder="Поиск на странице"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {list.isPending && <p>Загружаем историю…</p>}
          {list.error && (
            <p className="error" role="alert">
              Не удалось загрузить историю.{' '}
              <button className="text-button" onClick={() => void list.refetch()}>
                Обновить
              </button>
            </p>
          )}
          {list.data && !list.data.items.length && (
            <div className="empty-state">
              <h2>{filter === 'running' ? 'Нет работ в процессе' : 'Пока нет работ'}</h2>
              <Link className="button primary" to="/image">
                Создать изображение
              </Link>
            </div>
          )}
          {(error || prefs.error) && (
            <p className="error" role="alert">
              {error || prefs.error}
            </p>
          )}
          {list.data && !visible.length && !!list.data.items.length && (
            <p>На этой странице нет подходящих работ.</p>
          )}
          <div className="history-list">
            {visible.map((c) => (
              <article className="generation-card history-card" key={c.id}>
                <header>
                  <ConversationCover conversation={c} onOpen={() => void openFile(c)} />
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
                        className="text-button"
                        type="button"
                        disabled={saving}
                        onClick={() => setEditing(undefined)}
                      >
                        Отмена
                      </button>
                    </form>
                  ) : (
                    <h2>{c.name}</h2>
                  )}
                  {c.status !== 'LOADED' && (
                    <span className="history-status" data-status={c.status}>
                      {c.status === 'LOADING' ? 'В работе' : 'Нужно проверить результат'}
                    </span>
                  )}
                </header>
                <div className="history-meta">
                  <p className="small muted">
                    {new Date(c.lastMessageDate || c.createdDate).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <div className="workspace-actions">
                    <button
                      className="history-icon-button"
                      aria-label={prefs.value.favorites.includes(c.id) ? 'В избранном' : 'В избранное'}
                      title={prefs.value.favorites.includes(c.id) ? 'Убрать из избранного' : 'В избранное'}
                      aria-pressed={prefs.value.favorites.includes(c.id)}
                      onClick={() =>
                        prefs.update((p) => ({ ...p, favorites: toggleItem(p.favorites, c.id) }))
                      }
                    >
                      <Heart
                        size={16}
                        fill={prefs.value.favorites.includes(c.id) ? 'currentColor' : 'none'}
                      />
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
                    </button>
                    <button
                      className="history-icon-button"
                      aria-label={prefs.value.archive.includes(c.id) ? 'Вернуть из архива' : 'В архив'}
                      title={prefs.value.archive.includes(c.id) ? 'Вернуть из архива' : 'В архив'}
                      onClick={() => prefs.update((p) => ({ ...p, archive: toggleItem(p.archive, c.id) }))}
                    >
                      {prefs.value.archive.includes(c.id) ? (
                        <ArchiveRestore size={16} />
                      ) : (
                        <Archive size={16} />
                      )}
                    </button>
                  </div>
                </div>
                <footer>
                  {c.options.tools?.some((t) =>
                    ['TTS', 'STT'].includes(typeof t === 'string' ? t : t.uid),
                  ) && (
                    <Link
                      className="button"
                      aria-label="Открыть аудио"
                      to={`/audio?mode=${c.tags?.includes('stt') ? 'stt' : 'tts'}&conversation=${c.id}`}
                    >
                      Аудио
                    </Link>
                  )}
                  {!connection(c, 'image') && !connection(c, 'video') && (
                    <Link
                      className="button"
                      aria-label="Открыть беседу"
                      to={`/${c.tags?.includes('prompt') ? 'prompt' : c.tags?.includes('chat') ? 'agent' : 'chat'}?conversation=${c.id}`}
                    >
                      Беседа
                    </Link>
                  )}
                  {(connection(c, 'image') || connection(c, 'video')) && (
                    <Link className="button" aria-label="Обсудить работу" to={`/chat?conversation=${c.id}`}>
                      Беседа
                    </Link>
                  )}
                  {connection(c, 'image') && (
                    <Link
                      className="button"
                      aria-label="Открыть изображения"
                      to={`/image?conversation=${c.id}`}
                    >
                      Изображения
                    </Link>
                  )}
                  {connection(c, 'video') && (
                    <Link className="button" aria-label="Открыть видео" to={`/video?conversation=${c.id}`}>
                      Видеостудия
                    </Link>
                  )}
                </footer>
              </article>
            ))}
          </div>
          {list.data && list.data.pages > 1 && (
            <div className="pagination">
              <button
                className="button"
                disabled={!page}
                onClick={() => setPagination({ userId: auth.user?.id, page: page - 1 })}
              >
                Назад
              </button>
              <span>
                {page + 1} / {list.data.pages}
              </span>
              <button
                className="button"
                disabled={page + 1 >= list.data.pages}
                onClick={() => setPagination({ userId: auth.user?.id, page: page + 1 })}
              >
                Далее
              </button>
            </div>
          )}
        </>
      )}
      {(opening || openError) && (
        <Modal title="Просмотр файла" onClose={closePreview}>
          {openError ? <p role="alert">{openError}</p> : <p role="status">Открываем файл…</p>}
        </Modal>
      )}
      {preview && <MediaPreview file={preview} onClose={closePreview} />}
      {login && <LoginDialog onClose={() => setLogin(false)} />}
    </div>
  );
}
