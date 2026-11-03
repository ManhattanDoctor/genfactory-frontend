import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, getSession } from '../lib/api';
import type { IConversation } from '../lib/types';
import { useAuth } from '../features/auth/AuthProvider';
import { Modal } from './Modal';
const workUrl = (c: IConversation) =>
  c.tags?.includes('audio')
    ? `/audio?mode=${c.tags.includes('stt') ? 'stt' : 'tts'}&conversation=${c.id}`
    : `/chat?conversation=${c.id}`;
export function ActiveJobs() {
  const auth = useAuth();
  return auth.user ? (
    <Jobs key={`${auth.user.id}:${auth.session}`} userId={auth.user.id} sid={auth.session!} />
  ) : null;
}
function Jobs({ userId, sid }: { userId: number; sid: string }) {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<IConversation[]>([]);
  const tracked = useRef(new Map<number, IConversation>());
  const query = useQuery({
    queryKey: ['active-jobs', userId],
    queryFn: ({ signal }) => api.conversations(userId, 0, signal, 'LOADING'),
    retry: 1,
  });
  useEffect(() => {
    const handler = () => void query.refetch();
    window.addEventListener('genfactory:generation-finished', handler);
    return () => window.removeEventListener('genfactory:generation-finished', handler);
  }, [userId]);
  useEffect(() => {
    if (!query.data || query.isError) return;
    let cancelled = false;
    const running = query.data.items.filter((c) => c.userId === userId && c.status === 'LOADING');
    for (const c of running) tracked.current.set(c.id, c);
    const absent = [...tracked.current.keys()].filter((id) => !running.some((c) => c.id === id));
    void Promise.allSettled(absent.map((id) => api.conversation(id, undefined, sid))).then((results) => {
      if (cancelled || getSession() !== sid) return;
      const finished = results.flatMap((r) =>
        r.status === 'fulfilled' && r.value.userId === userId && ['LOADED', 'ERROR'].includes(r.value.status)
          ? [r.value]
          : [],
      );
      for (const c of finished) tracked.current.delete(c.id);
      if (finished.length) setNotices((previous) => [...finished, ...previous].slice(0, 8));
    });
    return () => {
      cancelled = true;
    };
  }, [query.dataUpdatedAt, query.isError, userId, sid]);
  const running = query.data?.items.filter((c) => c.userId === userId && c.status === 'LOADING') || [];
  return (
    <>
      <button
        className="button jobs-button"
        aria-label={query.isError ? 'Статусы работ недоступны' : `Активные работы: ${running.length}`}
        onClick={() => setOpen(true)}
      >
        Работы{' '}
        <span>
          {query.isError ? '—' : running.length}
          {notices.length ? ' •' : ''}
        </span>
      </button>
      {!!notices.length && (
        <div className="job-notice" role="status">
          <span>
            {notices[0].status === 'ERROR' ? 'Работа завершилась с ошибкой' : 'Работа завершена'}:{' '}
            {notices[0].name}
          </span>
          <Link to={workUrl(notices[0])} onClick={() => setNotices((n) => n.slice(1))}>
            Открыть
          </Link>
          <button
            className="icon-button"
            aria-label="Скрыть уведомление"
            onClick={() => setNotices((n) => n.slice(1))}
          >
            ×
          </button>
        </div>
      )}
      {open && (
        <Modal title="Активные работы" onClose={() => setOpen(false)}>
          <div className="active-jobs-content">
            <p className="muted">
              Статусы обновляются, пока сайт открыт. Завершение беседы не гарантирует создание файла —
              подробности в ответе ассистента.
            </p>
            <button className="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
              Обновить статусы
            </button>
            {query.isPending ? (
              <p role="status">Загружаем работы…</p>
            ) : query.isError ? (
              <p role="alert">Не удалось обновить статусы. Попробуйте ещё раз.</p>
            ) : !running.length ? (
              <p>Нет выполняющихся работ.</p>
            ) : (
              <ul className="jobs-list">
                {running.map((c) => (
                  <li key={c.id}>
                    <Link to={workUrl(c)} onClick={() => setOpen(false)}>
                      {c.name}
                    </Link>
                    <span className="small muted">Выполняется</span>
                  </li>
                ))}
              </ul>
            )}
            {!!query.data && query.data.total > running.length && (
              <p>Всего в работе: {query.data.total}. Здесь показана первая страница.</p>
            )}
            <Link to="/history" className="button" onClick={() => setOpen(false)}>
              Вся история
            </Link>
          </div>
        </Modal>
      )}
    </>
  );
}
