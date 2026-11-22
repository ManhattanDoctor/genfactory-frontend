import type { ITemplate } from './materials';
import previews from './designPreviews.json';
const media: Record<string, { src: string; poster: string; tags: string[]; previewRatio: string }> = previews;
import images from '../studio/image-feed.json';
import videos from '../studio/video-feed.json';

export const studioTemplates: ITemplate[] = [...images.templates, ...videos.templates]
  .filter((card) => media[card.id])
  .map((card) => {
    const video = !!card.poster;
    return {
      id: card.id,
      title: card.title,
      genre: video ? 'Ролик' : 'Фото',
      kind: video ? 'video' : 'image',
      ratio: card.ratio || '1:1',
      ...media[card.id],
      prompt: card.prompt,
      references: { min: card.photos },
      recommendedDuration: card.duration || undefined,
      modelTitle: card.modelTitle,
      model: { provider: video ? 'OPEN_ROUTER_VIDEO' : 'OPEN_ROUTER_IMAGE', model: card.modelId },
    };
  });
