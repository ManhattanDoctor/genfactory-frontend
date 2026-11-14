import type { ITemplate, ITemplateCard } from './materials';

const loaders: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  image: () => import('./template-prompts/image.json'),
  video: () => import('./template-prompts/video.json'),
  presentation: () => import('./template-prompts/presentation.json'),
};

/** Native module caching shares one request per kind; cards never import prompt bodies. */
export async function loadTemplate(card: ITemplateCard): Promise<ITemplate> {
  const loader = loaders[card.kind];
  if (!loader) throw new Error('Неизвестный тип шаблона.');
  const prompts = (await loader()).default;
  const prompt = prompts[card.id];
  if (!prompt?.trim()) throw new Error('Не удалось загрузить текст шаблона.');
  return { ...card, prompt };
}
