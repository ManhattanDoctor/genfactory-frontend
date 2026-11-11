import type { IModelDescription, IToolConnection } from './types';

export const DEFAULT_ASSISTANT = { provider: 'OPEN_ROUTER_CONVERSATION', model: 'anthropic/claude-opus-5.5' };
const providers = new Set([
  'OPEN_ROUTER_CONVERSATION',
  'OPEN_ROUTER_TEXT',
  'OPEN_ROUTER_IMAGE',
  'OPEN_ROUTER_VIDEO',
  'OPEN_ROUTER_TTS',
  'OPEN_ROUTER_STT',
]);
export const isAllowedProvider = (provider: string | undefined) => !!provider && providers.has(provider);
export function assertAllowedProvider(provider: string | undefined): void {
  if (!isAllowedProvider(provider))
    throw new Error(
      'В этой студии доступны только модели OpenRouter. Выберите модель OpenRouter для нового запроса.',
    );
}
export function assertAllowedTools(tools?: Array<unknown>): void {
  for (const item of tools || []) {
    const uid = typeof item === 'string' ? item : (item as IToolConnection)?.uid;
    if (['IMAGE_OPEN_AI', 'TTS_OPEN_AI', 'STT_OPEN_AI', 'IMAGE_RECOGNITION'].includes(uid))
      throw new Error(
        'В этой студии доступны только инструменты с моделями OpenRouter. Отключите инструмент ' + uid + '.',
      );
    const provider = (item as { settings?: { model?: { provider?: string } } })?.settings?.model?.provider;
    if (provider !== undefined) assertAllowedProvider(provider);
  }
}

const toolProviders: Record<string, string> = {
  IMAGE: 'OPEN_ROUTER_IMAGE',
  IMAGE_OPEN_ROUTER: 'OPEN_ROUTER_IMAGE',
  VIDEO: 'OPEN_ROUTER_VIDEO',
  VIDEO_OPEN_ROUTER: 'OPEN_ROUTER_VIDEO',
  TTS: 'OPEN_ROUTER_TTS',
  STT: 'OPEN_ROUTER_STT',
  VIDEO_RECOGNITION: 'OPEN_ROUTER_TEXT',
};

/** Apply the same override semantics as the backend before validating the effective tools. */
export function effectiveTools(
  saved: (IToolConnection | string)[] = [],
  overrides: IToolConnection[] = [],
): IToolConnection[] {
  const tools = saved.map((item) => (typeof item === 'string' ? { uid: item } : { ...item }));
  const used = new Set<string>();
  for (const override of overrides) {
    const item = tools.find((item) => item.uid === override.uid);
    if (!item || used.has(override.uid))
      throw new Error('Инструмент не подключён или указан повторно: ' + override.uid);
    used.add(override.uid);
    item.isRequired = override.isRequired;
    item.input = override.input === undefined ? undefined : structuredClone(override.input);
    if (override.isRequired !== undefined && override.settings === undefined) continue;
    const settings = override.settings;
    const sameModel =
      item.settings?.model.provider === settings?.model.provider &&
      item.settings?.model.model === settings?.model.model;
    item.settings = settings
      ? {
          ...settings,
          options: sameModel ? { ...item.settings?.options, ...settings.options } : settings.options,
        }
      : undefined;
  }
  return tools;
}

/** Pin model-backed tools so the assistant cannot switch to a direct provider. */
export async function prepareAllowedTools(
  tools: (IToolConnection | string)[] | undefined,
  catalog: (provider: string) => Promise<IModelDescription[]>,
): Promise<IToolConnection[] | undefined> {
  if (!tools) return undefined;
  assertAllowedTools(tools);
  return Promise.all(
    tools.map(async (value) => {
      const item = typeof value === 'string' ? { uid: value } : value;
      const provider = toolProviders[item.uid];
      if (!provider && !item.settings) return item;
      let model = item.settings?.model;
      if (!model) {
        const models = await catalog(provider);
        model = models.find(
          (candidate) =>
            candidate.reference.provider === provider &&
            candidate.status !== 'DISABLED' &&
            candidate.status !== 'HIDDEN' &&
            (item.uid !== 'VIDEO_RECOGNITION' ||
              ['VIDEO_INPUT', 'TEXT_OUTPUT'].every((capability) =>
                candidate.capabilities?.includes(capability),
              )),
        )?.reference;
        if (!model) throw new Error('Нет доступной модели OpenRouter для инструмента ' + item.uid + '.');
      }
      return { ...item, settings: { ...item.settings, model, isLockSelection: true } };
    }),
  );
}
