import { scheduleRefresh } from '../features/realtime/queryRefresh';
import type { ReactElement } from 'react';
import { GenerationElapsed } from './GenerationElapsed';
import { conversationUrl as workUrl } from '../lib/conversationUrl';
import './active-jobs.css';
import { History, LoaderCircle, RefreshCw, BriefcaseBusiness, ListX } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IDirectMediaTask } from '../features/studio/useDirectMediaTask';
import { useRealtime } from '../features/realtime/RealtimeProvider';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '../lib/errorMessages';
import { api, getSession } from '../lib/api';
import { taskView, visibleTasks } from '../features/studio/activeTasks';
import { FilePlaceholder } from './FilePlaceholder';
import type { IGnosisFile, ITaskExecution, ITaskResponse, ITaskFinished, IConversation } from '../lib/types';
import { useAuth } from '../features/auth/AuthProvider';
import { Modal } from './Modal';
const JobMedia = lazy(() => import('./MediaPreview').then(({ Media }) => ({ default: Media })));

function TaskPreview({
  item,
  userId,
  sid,
  file,
  fileId,
}: {
  item: ITaskExecution;
  userId: number;
  sid: string;
  file?: IGnosisFile;
  fileId?: number;
}): ReactElement {
  const details = useQuery({
    queryKey: ['file-preview', userId, fileId],
    queryFn: () => api.file(fileId!, sid),
    enabled: !!fileId && !file,
    retry: false,
  });
  const source = file || details.data;
  const preview = source?.userId === userId ? source : undefined;
  const view = taskView(item);
  return preview ? (
    <Suspense fallback={<FilePlaceholder file={{ name: view.title, type: view.type, mime: view.mime }} />}>
      <JobMedia
        file={preview}
        isPlaybackDisabled={preview.type !== 'VIDEO' || preview.preview?.image?.status === 'READY'}
      />
    </Suspense>
  ) : (
    <FilePlaceholder file={{ name: view.title, type: view.type, mime: view.mime }} />
  );
}

function TaskCard({
  item,
  userId,
  sid,
  title,
  status,
  error,
  file,
  fileId,
  completed = false,
  onOpen,
}: {
  item: ITaskExecution;
  userId: number;
  sid: string;
  title?: string;
  status?: string;
  error?: string;
  file?: IGnosisFile;
  fileId?: number;
  completed?: boolean;
  onOpen: () => void;
}): ReactElement {
  const view = taskView(item);
  return (
    <>
      <Link className={`job-card${completed ? ' completed-job' : ''}`} to={view.path} onClick={onOpen}>
        <div className="job-card-preview">
          {completed ? (
            <TaskPreview item={item} userId={userId} sid={sid} file={file} fileId={fileId} />
          ) : (
            <FilePlaceholder file={{ name: view.title, type: view.type, mime: view.mime }} />
          )}
        </div>
        <div className="job-card-content">
          <b className="job-card-title" title={title || view.title}>
            {title || view.title}
          </b>
          <span className="job-card-status">
            {!completed && <LoaderCircle size={14} aria-hidden="true" />}
            {status || 'Выполняется'}
            {!completed && <GenerationElapsed startedAt={item.createdDate} />}
          </span>
        </div>
      </Link>
      {error && (
        <details className="job-card-error">
          <summary>Причина ошибки</summary>
          <p>{error}</p>
        </details>
      )}
    </>
  );
}

function JobCard({
  conversation,
  onOpen,
  completed = false,
}: {
  conversation: IConversation;
  onOpen: () => void;
  completed?: boolean;
}): ReactElement {
  // Mounted only while the window is open; shares the conversation's message cache.
  const messages = useQuery({
    queryKey: ['messages', conversation.userId, conversation.id, 0],
    queryFn: ({ signal }) => api.messages(conversation.id, 0, signal),
    enabled: completed && conversation.status === 'LOADED',
    retry: false,
  });
  const latest = messages.data?.items.find((message) => message.role !== 'COMMAND');
  const result =
    completed && conversation.status === 'LOADED' && latest?.role === 'ASSISTANT' ? latest : undefined;
  const placeholder = {
    name: conversation.name,
    mime: '',
    type: conversation.tags?.includes('image')
      ? 'IMAGE'
      : conversation.tags?.includes('video')
        ? 'VIDEO'
        : conversation.tags?.includes('audio') && !conversation.tags?.includes('stt')
          ? 'AUDIO'
          : 'DOCUMENT',
  };
  const files = result?.files?.filter((file) => file.userId === conversation.userId) || [];
  const reference = files.find((file) => ['IMAGE', 'VIDEO'].includes(file.type)) || files[0];
  return (
    <Link
      className={`job-card${completed ? ' completed-job' : ''}`}
      to={workUrl(conversation)}
      onClick={onOpen}
    >
      <div className="job-card-preview">
        {reference ? (
          <Suspense fallback={<FilePlaceholder file={placeholder} />}>
            <JobMedia
              file={reference}
              isPlaybackDisabled={reference.type !== 'VIDEO' || reference.preview?.image?.status === 'READY'}
            />
          </Suspense>
        ) : (
          <FilePlaceholder file={placeholder} />
        )}
      </div>
      <div className="job-card-content">
        <b className="job-card-title" title={conversation.name}>
          {conversation.name}
        </b>
        <span className="job-card-status">
          {!completed && <LoaderCircle size={14} aria-hidden="true" />}
          {completed ? (conversation.status === 'ERROR' ? 'Нужна проверка' : 'Готово') : 'Выполняется'}
        </span>
      </div>
    </Link>
  );
}

export function ActiveJobs(): ReactElement | null {
  const auth = useAuth();
  return auth.user ? (
    <Jobs key={`${auth.user.id}:${auth.session}`} userId={auth.user.id} sid={auth.session!} />
  ) : null;
}
function Jobs({ userId, sid }: { userId: number; sid: string }): ReactElement {
  const client = useQueryClient();
  const { join } = useRealtime();
  const tasks = useMutationState({
    filters: { mutationKey: ['media-task', userId] },
    select: (mutation) => ({
      id: mutation.mutationId,
      submittedAt: mutation.state.submittedAt,
      status: mutation.state.status,
      output: mutation.state.data as ITaskResponse | undefined,
      error: mutation.state.error,
      input: mutation.state.variables as IDirectMediaTask,
    }),
  }).filter((task) => task.input?.sid === sid);
  const pendingTasks = tasks.filter((task) => task.status === 'pending');
  const executions = useQuery({
    queryKey: ['active-tasks', userId],
    queryFn: ({ signal }) => api.tasks(signal, sid),
    refetchInterval: (query) => (query.state.data?.length || pendingTasks.length ? 5000 : false),
  });
  const taskNotices = useQuery<ITaskFinished[]>({
    queryKey: ['task-notices', userId],
    queryFn: () => [],
    initialData: [],
    enabled: false,
  });
  const remoteTasks = visibleTasks(
    executions.data || [],
    pendingTasks.map((task) => task.input.body.task.session),
  );
  const remoteNotices = taskNotices.data.filter(
    (task) =>
      !task.item.model.includes('CONVERSATION') &&
      (!task.item.parentTaskId ||
        ((task.result !== 'COMPLETED' || !!task.fileIds?.length) &&
          !executions.data?.some((item) => item.id === task.item.parentTaskId))) &&
      !tasks.some((local) => local.input.body.task.session === task.item.session),
  );
  const [dismissedTasks, setDismissedTasks] = useState<number[]>([]);
  const finishedTasks = tasks
    .filter((task) => ['success', 'error'].includes(task.status) && !dismissedTasks.includes(task.id))
    .slice(-8)
    .reverse();
  const taskRooms = pendingTasks
    .map((task) => task.input.body.task.session)
    .filter(Boolean)
    .join('|');
  useEffect(() => {
    const leave = taskRooms ? taskRooms.split('|').map(join) : [];
    return () => leave.forEach((release) => release());
  }, [taskRooms, join]);
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<IConversation[]>([]);
  const tracked = useRef(new Map<number, IConversation>());
  const query = useQuery({
    queryKey: ['active-jobs', userId],
    queryFn: ({ signal }) => api.conversations(userId, 0, signal, 'LOADING'),
    // Reconcile running jobs even if the final socket event was missed on another page.
    // Completed/idle sessions do not poll.
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === 'LOADING') || tracked.current.size
        ? 5000
        : false,
  });
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
        scheduleRefresh(client, userId, sid, ['messages'], c.id);
      }
      if (finished.length) {
        scheduleRefresh(client, userId, sid, ['files', 'conversations']);
      }
      if (finished.length) setNotices((previous) => [...finished, ...previous].slice(0, 8));
    });
    return () => {
      cancelled = true;
    };
  }, [query.dataUpdatedAt, query.isError, userId, sid]);
  const running = query.data?.items.filter((c) => c.userId === userId && c.status === 'LOADING') || [];
  const count = running.length + pendingTasks.length + remoteTasks.length;
  const unavailable = query.isError || executions.isError;
  const hasNotices = !!(notices.length || finishedTasks.length || remoteNotices.length);
  return (
    <>
      <button
        className="button jobs-button"
        aria-label={unavailable ? 'Статусы работ недоступны' : `Активные работы: ${count}`}
        onClick={() => setOpen(true)}
      >
        <BriefcaseBusiness size={18} aria-hidden="true" /> Работы{' '}
        <span>
          {unavailable ? '—' : count}
          {hasNotices ? ' •' : ''}
        </span>
      </button>
      {open && (
        <Modal
          title="Активные работы"
          className="jobs-modal"
          onClose={() => setOpen(false)}
          headerActions={
            <>
              <button
                type="button"
                className="icon-button"
                aria-label="Очистить уведомления"
                title="Очистить уведомления"
                disabled={!hasNotices}
                onClick={() => {
                  setNotices([]);
                  client.setQueryData(['task-notices', userId], []);
                  setDismissedTasks(
                    tasks.filter((task) => ['success', 'error'].includes(task.status)).map((task) => task.id),
                  );
                }}
              >
                <ListX size={18} aria-hidden="true" />
              </button>
              <Link
                to="/artifacts"
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
                onClick={() => {
                  void query.refetch();
                  void executions.refetch();
                }}
                disabled={query.isFetching || executions.isFetching}
              >
                <RefreshCw size={18} />
              </button>
            </>
          }
        >
          <div className="active-jobs-content">
            {query.isPending || executions.isPending ? (
              <p role="status">Загружаем работы…</p>
            ) : unavailable ? (
              <p role="alert">Не удалось обновить статусы. Попробуйте ещё раз.</p>
            ) : !count ? (
              <p>Нет выполняющихся работ.</p>
            ) : (
              <ul className="jobs-grid">
                {pendingTasks.map((task) => (
                  <li key={`task:${task.id}`}>
                    <TaskCard
                      item={{
                        id: String(task.id),
                        model: task.input.body.model,
                        createdDate: new Date(task.submittedAt).toISOString(),
                      }}
                      userId={userId}
                      sid={sid}
                      title={(task.input.recipe.workspaceInput?.idea || task.input.recipe.prompt).slice(
                        0,
                        100,
                      )}
                      onOpen={() => setOpen(false)}
                    />
                  </li>
                ))}
                {remoteTasks.map((task) => (
                  <li key={task.id}>
                    <TaskCard item={task} userId={userId} sid={sid} onOpen={() => setOpen(false)} />
                  </li>
                ))}
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
            {hasNotices && (
              <section className="completed-jobs" aria-label="Завершённые работы">
                <h3>Завершённые</h3>
                {notices.map((c) => (
                  <JobCard key={c.id} conversation={c} completed onOpen={() => setOpen(false)} />
                ))}
                {finishedTasks.map((task) => (
                  <TaskCard
                    key={`task:${task.id}`}
                    item={{
                      id: String(task.id),
                      model: task.input.body.model,
                      createdDate: new Date(task.submittedAt).toISOString(),
                    }}
                    userId={userId}
                    sid={sid}
                    completed
                    title={(task.input.recipe.workspaceInput?.idea || task.input.recipe.prompt).slice(0, 100)}
                    status={task.status === 'success' ? 'Готово' : 'Проверьте результат'}
                    error={task.error?.message}
                    file={task.output?.files?.[0]}
                    onOpen={() => setOpen(false)}
                  />
                ))}
                {remoteNotices.map((task) => (
                  <TaskCard
                    key={task.id}
                    item={task.item}
                    userId={userId}
                    sid={sid}
                    completed
                    fileId={task.fileIds?.[0]}
                    error={
                      task.result === 'FAILED' && task.error ? apiErrorMessage(task.error, 400) : undefined
                    }
                    status={
                      task.result === 'COMPLETED'
                        ? 'Готово'
                        : task.result === 'CANCELLED'
                          ? 'Отменено'
                          : 'Проверьте результат'
                    }
                    onOpen={() => setOpen(false)}
                  />
                ))}
              </section>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
