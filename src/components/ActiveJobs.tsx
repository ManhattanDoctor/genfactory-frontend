import { LoadingRows } from './Skeleton';
import { createPortal } from 'react-dom';
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
import { Link, useLocation } from 'react-router-dom';
import { apiErrorMessage } from '../lib/errorMessages';
import { api, getSession } from '../lib/api';
import {
  selectedImageTaskKey,
  taskView,
  visibleTasks,
  visibleTaskNotices,
} from '../features/studio/activeTasks';
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
  localRequest,
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
  localRequest?: boolean;
  status?: string;
  error?: string;
  file?: IGnosisFile;
  fileId?: number;
  completed?: boolean;
  onOpen: () => void;
}): ReactElement {
  const client = useQueryClient();
  const view = taskView(item);
  return (
    <>
      <Link
        className={`job-card${completed ? ' completed-job' : ''}`}
        to={view.path}
        onClick={() => {
          if (view.path === '/image')
            client.setQueryData(
              selectedImageTaskKey(userId),
              `${localRequest ? 'task' : 'execution'}:${item.id}`,
            );
          onOpen();
        }}
      >
        <div className="job-card-preview">
          {completed ? (
            <TaskPreview item={item} userId={userId} sid={sid} file={file} fileId={fileId} />
          ) : (
            <FilePlaceholder file={{ name: view.title, type: view.type, mime: view.mime }} />
          )}
        </div>
        <div className="job-card-content">
          <b className="job-card-title">{title || view.title}</b>
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
        <b className="job-card-title">{conversation.name}</b>
        <small className="job-card-id">Диалог №{conversation.id}</small>
        <span className="job-card-status">
          {!completed && <LoaderCircle size={14} aria-hidden="true" />}
          {completed ? (conversation.status === 'ERROR' ? 'Нужна проверка' : 'Готово') : 'Выполняется'}
        </span>
      </div>
    </Link>
  );
}

interface JobNotice {
  key: string;
  label: string;
}

function JobPopup({ label, onOpen }: { label: string; onOpen: () => void }): ReactElement | null {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="job-popup">
      <span role="status">{label}</span>
      <button
        type="button"
        className="text-button"
        onClick={() => {
          setVisible(false);
          onOpen();
        }}
      >
        Работы
      </button>
    </div>
  );
}

const openJobsEvent = 'genfactory:open-jobs';

export function openActiveJobs(): void {
  window.dispatchEvent(new Event(openJobsEvent));
}

type JobTrigger = (status: string, label: string, show: () => void) => ReactElement;

export function ActiveJobs({ renderTrigger }: { renderTrigger?: JobTrigger } = {}): ReactElement | null {
  const auth = useAuth();
  return auth.user ? (
    <Jobs
      renderTrigger={renderTrigger}
      key={`${auth.user.id}:${auth.session}`}
      userId={auth.user.id}
      sid={auth.session!}
    />
  ) : null;
}
function Jobs({
  userId,
  sid,
  renderTrigger,
}: {
  userId: number;
  sid: string;
  renderTrigger?: JobTrigger;
}): ReactElement {
  const client = useQueryClient();
  const { pathname, search } = useLocation();
  const selectedImage = useQuery<string | null>({
    queryKey: selectedImageTaskKey(userId),
    queryFn: () => null,
    enabled: false,
  });
  const imageConversation = new URLSearchParams(search).get('conversation');
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
  const remoteNotices = visibleTaskNotices(
    taskNotices.data,
    executions.data || [],
    tasks.map((task) => task.input.body.task.session),
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
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(openJobsEvent, show);
    return () => window.removeEventListener(openJobsEvent, show);
  }, []);
  const [notices, setNotices] = useState<IConversation[]>([]);
  const tracked = useRef(new Map<number, IConversation>());
  const query = useQuery({
    queryKey: ['active-jobs', userId],
    queryFn: ({ signal }) => api.conversations(userId, 0, signal, 'LOADING'),
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
  const completions: JobNotice[] = [
    ...notices.map((c) => ({
      key: `chat:${c.id}:${c.lastMessageDate}`,
      label: `Диалог №${c.id} · ${c.name} · ${c.status === 'ERROR' ? 'Нужна проверка' : 'Готово'}`,
    })),
    ...finishedTasks.map((task) => ({
      key: `task:${task.input.body.task.session || task.id}`,
      label: task.status === 'success' ? 'Готово' : 'Проверьте результат',
    })),
    ...remoteNotices.map((notice) => ({
      key: `execution:${notice.id}`,
      label:
        notice.result === 'COMPLETED'
          ? 'Готово'
          : notice.result === 'CANCELLED'
            ? 'Отменено'
            : 'Проверьте результат',
    })),
  ];
  const relevantPopup = (item: JobNotice) =>
    pathname !== '/image' ||
    (imageConversation ? item.key.startsWith(`chat:${imageConversation}:`) : item.key === selectedImage.data);
  const previousCompletions = useRef(new Set(completions.map((item) => item.key)));
  const [popups, setPopups] = useState<JobNotice[]>([]);
  useEffect(() => {
    const arrived = completions.filter(
      (item) => relevantPopup(item) && !previousCompletions.current.has(item.key),
    );
    previousCompletions.current = new Set(completions.map((item) => item.key));
    if (arrived.length)
      setPopups((current) =>
        [...arrived, ...current.filter((item) => !arrived.some((next) => next.key === item.key))].slice(0, 3),
      );
  }, [completions]);
  return (
    <>
      {createPortal(
        <div className="job-popups" hidden={open}>
          {popups.filter(relevantPopup).map((item) => (
            <JobPopup key={item.key} label={item.label} onOpen={() => setOpen(true)} />
          ))}
        </div>,
        document.body,
      )}
      {renderTrigger ? (
        renderTrigger(
          (unavailable ? '-' : String(count)) + (hasNotices ? ' •' : ''),
          unavailable ? 'Статусы работ недоступны' : `Активные работы: ${count}`,
          () => setOpen(true),
        )
      ) : (
        <button
          className="button jobs-button"
          aria-label={unavailable ? 'Статусы работ недоступны' : `Активные работы: ${count}`}
          onClick={() => setOpen(true)}
        >
          <BriefcaseBusiness size={18} aria-hidden="true" /> Работы{' '}
          <span>
            {unavailable ? '-' : count}
            {hasNotices ? ' •' : ''}
          </span>
        </button>
      )}
      {open &&
        createPortal(
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
                  disabled={!hasNotices}
                  onClick={() => {
                    setNotices([]);
                    setPopups([]);
                    client.setQueryData(['task-notices', userId], []);
                    setDismissedTasks(
                      tasks
                        .filter((task) => ['success', 'error'].includes(task.status))
                        .map((task) => task.id),
                    );
                  }}
                >
                  <ListX size={18} aria-hidden="true" />
                </button>
                <Link
                  to="/artifacts"
                  className="icon-button"
                  aria-label="Вся история"
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
                <LoadingRows label="Загружаем работы…" />
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
                          id: task.input.body.task.session || String(task.id),
                          model: task.input.body.model,
                          createdDate: new Date(task.submittedAt).toISOString(),
                        }}
                        userId={userId}
                        sid={sid}
                        localRequest
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
                        id: task.input.body.task.session || String(task.id),
                        model: task.input.body.model,
                        createdDate: new Date(task.submittedAt).toISOString(),
                      }}
                      userId={userId}
                      sid={sid}
                      completed
                      localRequest
                      title={(task.input.recipe.workspaceInput?.idea || task.input.recipe.prompt).slice(
                        0,
                        100,
                      )}
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
          </Modal>,
          document.body,
        )}
    </>
  );
}
