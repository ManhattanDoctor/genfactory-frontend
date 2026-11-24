import type { ITemplate, ITemplateCard } from './materials';
import archive from './templates.json';
import videoFeed from '../studio/video-feed.json';

export const mediaTemplates = archive.filter((item) => item.kind === 'image' || item.kind === 'video');

const archivedVideoCards = new Map(
  videoFeed.templates
    .filter((card) => card.archiveTemplateId || card.hideFromGallery)
    .map((card) => [card.id, card.archiveTemplateId]),
);

export function isGalleryTemplate(id: string): boolean {
  return !archivedVideoCards.has(id);
}

export function galleryTemplateFavoriteId(id: string): string {
  return archivedVideoCards.get(id) ?? id;
}

const loaders: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  image: () => import('./template-prompts/image.json'),
  video: () => import('./template-prompts/video.json'),
};

/** Native module caching shares one request per kind; cards never import prompt bodies. */
export async function loadTemplate(card: ITemplateCard): Promise<ITemplate> {
  if (card.kind !== 'image' && card.kind !== 'video') throw new Error('Неизвестный тип шаблона.');
  if ('prompt' in card && typeof card.prompt === 'string' && card.prompt.trim())
    return { ...card, prompt: card.prompt };
  const loader = loaders[card.kind];
  if (!loader) throw new Error('Неизвестный тип шаблона.');
  const prompts = (await loader()).default;
  const prompt = prompts[card.id];
  if (!prompt?.trim()) throw new Error('Не удалось загрузить текст шаблона.');
  return { ...card, prompt };
}
