import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { LoginDialog } from '../../components/LoginDialog';
import { api } from '../../lib/api';
import { connection } from './conversations';
export function History() {
  const auth = useAuth();
  const [login, setLogin] = useState(false);
  const [pagination, setPagination] = useState({ userId: auth.user?.id, page: 0 });
  const page = pagination.userId === auth.user?.id ? pagination.page : 0;
  const list = useQuery({
    queryKey: ['conversations', auth.user?.id, page],
    enabled: !!auth.user,
    queryFn: ({ signal }) => api.conversations(auth.user!.id, page, signal),
    refetchInterval: 10000,
  });
  return (
    <div className="page-content page-enter">
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
          <div className="history-list">
            {list.data?.items
              .filter((c) => c.userId === auth.user?.id)
              .map((c) => (
                <article className="generation-card" key={c.id}>
                  <header>
                    <h2>{c.name}</h2>
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
                  <footer>
                    {!connection(c, 'image') && !connection(c, 'video') && (
                      <Link className="button" to={`/image?conversation=${c.id}`}>
                        Открыть беседу
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
