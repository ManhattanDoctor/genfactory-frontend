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
    const provider = (item as { settings?: { model?: { provider?: string } } })?.settings?.model?.provider;
    if (provider !== undefined) assertAllowedProvider(provider);
  }
}
