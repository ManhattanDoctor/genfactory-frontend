import { scheduleRefresh } from '../realtime/queryRefresh';
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type InfiniteData,
} from '@tanstack/react-query';
import { api, getSession } from '../../lib/api';
import type { IGnosisFile, IPagination, ITaskRequest, ITaskResponse, MediaKind } from '../../lib/types';
import { selectedImageTaskKey, visibleTasks } from './activeTasks';
import { saveFileRecipe, type IGenerationRecipe } from './variants';

export interface IDirectMediaTask {
  userId: number;
  sid: string;
  kind: MediaKind;
  body: ITaskRequest;
  recipe: IGenerationRecipe;
}

export function useDirectMediaTask(
  userId: number | undefined,
  kind: MediaKind,
): UseMutationResult<ITaskResponse, Error, IDirectMediaTask> & {
  pending: boolean;
  pendingCount: number;
  pendingTasks: Array<{ id: string; model: string; createdDate: string; localRequest?: boolean }>;
} {
  const client = useQueryClient();
  const mutationKey = ['media-task', userId, kind];
  const mutation = useMutation({
    mutationKey,
    retry: false,
    onMutate: (input) => {
      if (input.kind === 'image' && input.body.task.session)
        client.setQueryData(selectedImageTaskKey(input.userId), `task:${input.body.task.session}`);
    },
    mutationFn: async (input: IDirectMediaTask) => {
      const response = await api.task(input.body, input.sid);
      const type = input.kind === 'video' ? 'VIDEO' : 'IMAGE';
      if (
        !response.files?.length ||
        response.files.some((file) => file.userId !== input.userId || file.type !== type)
      )
        throw new Error(
          'Сервер не вернул сохранённый результат. Проверьте библиотеку перед повторным запуском.',
        );
      return response;
    },
    onSuccess: (response, input) => {
      if (getSession() !== input.sid) return;
      const saved = response.files || [];
      if (input.kind === 'image' && saved.length) {
        client.setQueryData<InfiniteData<IPagination<IGnosisFile>>>(
          ['files', input.userId, 'image-wall'],
          (current) => {
            const first = current?.pages[0];
            if (!current || !first) return current;
            const known = new Set(current.pages.flatMap((page) => page.items.map((file) => file.id)));
            const added = saved.filter((file) => !known.has(file.id));
            if (!added.length) return current;
            return {
              ...current,
              pages: [
                { ...first, items: [...added, ...first.items], total: first.total + added.length },
                ...current.pages.slice(1),
              ],
            };
          },
        );
      }
      response.files?.forEach((file) => saveFileRecipe(input.userId, file.id, input.recipe));
    },
    onSettled: (_response, _error, input) => {
      scheduleRefresh(client, input.userId, input.sid, [
        'files',
        'active-tasks',
        'active-jobs',
        'account',
        'transactions',
      ]);
    },
  });
  // A pending HTTP task remains tracked when its page unmounts and mounts again.
  const local = useMutationState({
    filters: { mutationKey, status: 'pending' },
    select: (item) => ({
      input: item.state.variables as IDirectMediaTask,
      submittedAt: item.state.submittedAt,
    }),
  }).filter((item) => item.input?.sid === getSession());
  const active = useQuery({
    queryKey: ['active-tasks', userId],
    queryFn: ({ signal }) => api.tasks(signal),
    enabled: !!userId,
  });
  const remote = visibleTasks(
    active.data || [],
    local.map((item) => item.input.body.task.session),
  ).filter((item) => item.model.includes(kind.toUpperCase()));
  const pendingTasks = [
    ...local.map(({ input, submittedAt }) => ({
      id: input.body.task.session || `local:${submittedAt}`,
      localRequest: true,
      model: input.body.model,
      createdDate: new Date(submittedAt).toISOString(),
    })),
    ...remote,
  ];
  const pendingCount = pendingTasks.length;
  return { ...mutation, pending: pendingCount > 0, pendingCount, pendingTasks };
}
