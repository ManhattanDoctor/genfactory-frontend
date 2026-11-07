import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { IModelDescription } from '../../lib/types';

/** Saved selections can remain readable/runnable while excluded from the new-selection catalogue. */
export function useRetainedModel(
  reference: IModelDescription['reference'] | undefined,
  models: IModelDescription[] | undefined,
  userId: number | undefined,
) {
  const active =
    reference &&
    models?.find(
      (model) => model.reference.provider === reference.provider && model.reference.model === reference.model,
    );
  const saved = useQuery({
    queryKey: ['retained-model', userId, reference?.provider, reference?.model],
    enabled: !!userId && !!reference && models !== undefined && !active,
    retry: false,
    queryFn: async ({ signal }) => {
      const value = await api.modelDescription(reference!, signal);
      if (!value?.reference || !value.schema) throw new Error('Сохранённая модель недоступна.');
      return value;
    },
  });
  return active || saved.data;
}
