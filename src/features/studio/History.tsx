import { ConversationCover } from './ConversationCover';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { LoginDialog } from '../../components/LoginDialog';
import { api } from '../../lib/api';
import { usePreferences, toggleItem } from '../workspace/preferences';
import { useQueryClient } from '@tanstack/react-query';
import { getSession } from '../../lib/api';
import type { IConversation } from '../../lib/types';
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
    <div className="page-content page-enter work-history">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">ПУТЬ ОТ ИДЕИ К РЕЗУЛЬТАТУ</span>
          <h1>История работ</h1>
          <p>
            Ваши беседы сохраняются в gnosis и доступны с любого устройства. Откройте работу, чтобы
            продолжить.
          </p>
        </div>
      </div>
      {!auth.user ? (
        <div className="empty-state">
          <p>Войдите, чтобы открыть историю.</p>
          <button className="button primary" onClick={() => setLogin(true)}>
            Войти
          </button>
        </div>
      ) : (
        <>
          {list.isPending && <p>Загружаем беседы…</p>}
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
              <h2>Каждая идея оставляет след</h2>
              <p>Здесь появятся ваши рабочие беседы.</p>
              <Link className="button primary" to="/image">
                Создать изображение
              </Link>
            </div>
          )}
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
          <p className="small muted">
            Избранное и архив хранятся в этом браузере. Архив скрывает работу из общего списка и не удаляет её
            на сервере.
          </p>
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
                  <ConversationCover conversation={c} />
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
                  <span className="small muted">
                    {c.status === 'LOADING'
                      ? 'В работе'
                      : c.status === 'ERROR'
                        ? 'Нужно проверить результат'
                        : 'Беседа сохранена'}
                  </span>
                </header>
                <p className="small muted">
                  {new Date(c.lastMessageDate || c.createdDate).toLocaleString('ru-RU')}
                </p>
                <div className="workspace-actions">
                  <button
                    className="text-button"
                    onClick={() => prefs.update((p) => ({ ...p, favorites: toggleItem(p.favorites, c.id) }))}
                  >
                    {prefs.value.favorites.includes(c.id) ? '★ В избранном' : '☆ В избранное'}
                  </button>
                  <button
                    className="text-button"
                    disabled={c.status === 'LOADING'}
                    onClick={() => {
                      setEditing(c.id);
                      setName(c.name);
                      setError('');
                    }}
                  >
                    Переименовать
                  </button>
                  <button
                    className="text-button"
                    onClick={() => prefs.update((p) => ({ ...p, archive: toggleItem(p.archive, c.id) }))}
                  >
                    {prefs.value.archive.includes(c.id) ? 'Вернуть из архива' : 'В архив'}
                  </button>
                </div>
                <footer>
                  {!connection(c, 'image') && !connection(c, 'video') && (
                    <Link className="button" to={`/image?conversation=${c.id}`}>
                      Открыть беседу
                    </Link>
                  )}
                  {(connection(c, 'image') || connection(c, 'video')) && (
                    <Link className="button" to={`/chat?conversation=${c.id}`}>
                      Обсудить работу
                    </Link>
                  )}
                  {connection(c, 'image') && (
                    <Link className="button" to={`/image?conversation=${c.id}`}>
                      Открыть изображения
                    </Link>
                  )}
                  {connection(c, 'video') && (
                    <Link className="button" to={`/video?conversation=${c.id}`}>
                      Открыть видео
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
      {login && <LoginDialog onClose={() => setLogin(false)} />}
    </div>
  );
}
