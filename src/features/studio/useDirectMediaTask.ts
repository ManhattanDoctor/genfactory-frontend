import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getSession } from '../../lib/api';
import type { ITaskRequest, MediaKind } from '../../lib/types';
import { visibleTasks } from './activeTasks';
import { saveFileRecipe, type IGenerationRecipe } from './variants';

export interface IDirectMediaTask {
  userId: number;
  sid: string;
  kind: MediaKind;
  body: ITaskRequest;
  recipe: IGenerationRecipe;
}

export function useDirectMediaTask(userId: number | undefined, kind: MediaKind) {
  const client = useQueryClient();
  const mutationKey = ['media-task', userId, kind];
  const mutation = useMutation({
    mutationKey,
    retry: false,
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
      response.files?.forEach((file) => saveFileRecipe(input.userId, file.id, input.recipe));
    },
    onSettled: (_response, _error, input) => {
      void client.invalidateQueries({ queryKey: ['files', input.userId] });
      void client.invalidateQueries({ queryKey: ['active-tasks', input.userId] });
      if (getSession() === input.sid) {
        void client.invalidateQueries({ queryKey: ['account'] });
        void client.invalidateQueries({ queryKey: ['transactions'] });
        window.dispatchEvent(new Event('genfactory:generation-finished'));
      }
    },
  });
  // A pending HTTP task remains tracked when its page unmounts and mounts again.
  const local = useMutationState({
    filters: { mutationKey, status: 'pending' },
    select: (item) => item.state.variables as IDirectMediaTask,
  }).filter((item) => item?.sid === getSession());
  const active = useQuery({
    queryKey: ['active-tasks', userId],
    queryFn: ({ signal }) => api.tasks(signal),
    enabled: !!userId,
    retry: 1,
    refetchInterval: (query) => (query.state.data?.length || local.length ? 5000 : false),
  });
  const remote = visibleTasks(
    active.data || [],
    local.map((item) => item.body.task.session),
  ).filter((item) => item.model.includes(kind.toUpperCase()));
  const pendingCount = local.length + remote.length;
  return { ...mutation, pending: pendingCount > 0, pendingCount };
}
