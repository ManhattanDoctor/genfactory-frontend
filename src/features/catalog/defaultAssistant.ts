import type { IModelDescription } from '../../lib/types';

import { DEFAULT_ASSISTANT, isAllowedProvider } from '../../lib/modelPolicy';
export { DEFAULT_ASSISTANT } from '../../lib/modelPolicy';

export function defaultAssistant(models: IModelDescription[]) {
  const available = models.filter(
    (item) =>
      isAllowedProvider(item.reference.provider) &&
      !['HIDDEN', 'DISABLED'].includes(item.status || '') &&
      item.capabilities?.includes('TOOLS'),
  );
  return (
    available.find(
      (item) =>
        item.reference.provider === DEFAULT_ASSISTANT.provider &&
        item.reference.model === DEFAULT_ASSISTANT.model,
    ) || available[0]
  );
}
