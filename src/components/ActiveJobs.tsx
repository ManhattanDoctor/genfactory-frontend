import { conversationUrl as workUrl } from '../lib/conversationUrl';
import './active-jobs.css';
import { History, Image, LoaderCircle, RefreshCw } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, getSession } from '../lib/api';
import type { IConversation } from '../lib/types';
import { useAuth } from '../features/auth/AuthProvider';
import { Modal } from './Modal';
const JobMedia = lazy(() => import('./MediaPreview').then(({ Media }) => ({ default: Media })));

function JobCard({ conversation, onOpen }: { conversation: IConversation; onOpen: () => void }) {
  // Mounted only while the window is open; shares the conversation's message cache.
  const messages = useQuery({
    queryKey: ['messages', conversation.userId, conversation.id, 0],
    queryFn: ({ signal }) => api.messages(conversation.id, 0, signal),
    retry: false,
  });
  const ask = messages.data?.items.find((message) => message.role === 'USER');
  const files = ask?.files?.filter((file) => file.userId === conversation.userId) || [];
  const reference = files.find((file) => ['IMAGE', 'VIDEO'].includes(file.type)) || files[0];
  return (
    <Link className="job-card" to={workUrl(conversation)} onClick={onOpen}>
      <div className="job-card-preview">
        {reference ? (
          <Suspense fallback={<Image size={24} strokeWidth={1.5} aria-hidden="true" />}>
            <JobMedia file={reference} isPlaybackDisabled />
          </Suspense>
        ) : (
          <Image size={24} strokeWidth={1.5} aria-hidden="true" />
        )}
      </div>
      <div className="job-card-content">
        <b className="job-card-title" title={conversation.name}>
          {conversation.name}
        </b>
        <span className="job-card-status">
          <LoaderCircle size={14} aria-hidden="true" />
          Выполняется
        </span>
      </div>
    </Link>
  );
}

export function ActiveJobs() {
  const auth = useAuth();
  return auth.user ? (
    <Jobs key={`${auth.user.id}:${auth.session}`} userId={auth.user.id} sid={auth.session!} />
  ) : null;
}
function Jobs({ userId, sid }: { userId: number; sid: string }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<IConversation[]>([]);
  const tracked = useRef(new Map<number, IConversation>());
  const query = useQuery({
    queryKey: ['active-jobs', userId],
    queryFn: ({ signal }) => api.conversations(userId, 0, signal, 'LOADING'),
    retry: 1,
    // Reconcile running jobs even if the final socket event was missed on another page.
    // Completed/idle sessions do not poll.
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === 'LOADING') || tracked.current.size
        ? 5000
        : false,
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
    if (running.length)
      setNotices((previous) => previous.filter((c) => !running.some((job) => job.id === c.id)));
    const absent = [...tracked.current.keys()].filter((id) => !running.some((c) => c.id === id));
    void Promise.allSettled(absent.map((id) => api.conversation(id, undefined, sid))).then((results) => {
      if (cancelled || getSession() !== sid) return;
      const finished = results.flatMap((r) =>
        r.status === 'fulfilled' && r.value.userId === userId && ['LOADED', 'ERROR'].includes(r.value.status)
          ? [r.value]
          : [],
      );
      for (const c of finished) {
        tracked.current.delete(c.id);
        client.setQueryData(['conversation', userId, c.id], c);
        void client.invalidateQueries({ queryKey: ['messages', userId, c.id] });
      }
      if (finished.length) {
        void client.invalidateQueries({ queryKey: ['files', userId] });
        void client.invalidateQueries({ queryKey: ['conversations', userId] });
      }
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
        <Modal
          title="Активные работы"
          className="jobs-modal"
          hideTitle
          onClose={() => setOpen(false)}
          headerActions={
            <>
              <Link
                to="/history"
                className="icon-button"
                aria-label="Вся история"
                title="Вся история"
                onClick={() => setOpen(false)}
              >
                <History size={18} />
              </Link>
              <button
                className="icon-button"
                aria-label="Обновить статусы"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
              >
                <RefreshCw size={18} />
              </button>
            </>
          }
        >
          <div className="active-jobs-content">
            {query.isPending ? (
              <p role="status">Загружаем работы…</p>
            ) : query.isError ? (
              <p role="alert">Не удалось обновить статусы. Попробуйте ещё раз.</p>
            ) : !running.length ? (
              <p>Нет выполняющихся работ.</p>
            ) : (
              <ul className="jobs-grid">
                {running.map((c) => (
                  <li key={c.id}>
                    <JobCard conversation={c} onOpen={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            )}
            {!!query.data && query.data.total > running.length && (
              <p>Всего в работе: {query.data.total}. Здесь показана первая страница.</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
