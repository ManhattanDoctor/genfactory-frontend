import { useMemo, useState, type ComponentProps, type ReactElement } from 'react';
import { Download, RotateCcw, Trash2 } from 'lucide-react';
import images from './image-feed.json';
import videos from './video-feed.json';
import type { IModelDescription } from '../../lib/types';
import { findTemplateModel } from '../catalog/presentation';
import type { ITemplateCard } from '../content-studio/materials';
import { shuffle } from 'lodash';
import { TemplateMedia } from '../content-studio/TemplateMedia';
import { isGalleryTemplate } from '../content-studio/templateCatalog';
import { Masonry } from '../../components/Masonry';

export type FeedCard = (typeof images.templates)[number] & { previewWidth?: number; previewHeight?: number };
export const feeds: Record<'image' | 'video', { templates: FeedCard[]; generations: FeedCard[] }> = {
  image: images,
  video: videos,
};
const videoTemplateSources = new Set(videos.templates.map((card) => card.src));
const tabs = [
  {
    key: 'templates',
    name: 'Шаблоны',
    icon: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </>
    ),
  },
  {
    key: 'generations',
    name: 'Генерации',
    icon: (
      <>
        <rect x="7" y="8" width="12" height="12" rx="2" />
        <path d="M5 16V6a2 2 0 0 1 2-2h10" />
        <circle cx="11" cy="12.5" r="1.2" />
        <path d="M8.5 17.5l2.4-2.8 1.8 1.6 2.8-3.3 2 2.5" />
      </>
    ),
  },
  { key: 'shuffle', name: 'Перемешать', icon: <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /> },
] as const;
export type FeedTab = (typeof tabs)[number]['key'];
export function DesignFeed({
  kind,
  models,
  tab,
  onTab,
  archive,
  onApplyArchive,
  onApply,
  busy,
  children = [],
  layout,
}: {
  kind: 'image' | 'video';
  models: IModelDescription[];
  tab: FeedTab;
  onTab: (tab: FeedTab) => void;
  archive: ITemplateCard[];
  onApplyArchive: (card: ITemplateCard) => void;
  onApply: (card: FeedCard) => void;
  busy: boolean;
  children?: ReactElement[];
  layout?: Omit<ComponentProps<typeof Masonry>, 'children'>;
}) {
  const feed = feeds[kind];
  const hints: Record<FeedTab, string> = {
    templates: kind === 'video' ? 'Выбрать шаблон ролика' : 'Выбрать шаблон изображения',
    generations: kind === 'video' ? 'Посмотреть свои видео' : 'Посмотреть свои изображения и примеры',
    shuffle: 'Перемешать шаблоны и примеры',
  };
  const [revision, setRevision] = useState(0);
  const [hidden, setHidden] = useState<string[]>([]);
  const templates = useMemo(
    () => [
      ...archive,
      ...feed.templates.filter(
        (card) => isGalleryTemplate(card.id) && findTemplateModel(models, card.modelId, card.modelTitle),
      ),
    ],
    [feed, models, archive],
  );
  const generations = useMemo(
    () =>
      feed.generations.filter(
        (card) =>
          (kind !== 'video' || !videoTemplateSources.has(card.src)) &&
          findTemplateModel(models, card.modelId, card.modelTitle),
      ),
    [feed, kind, models],
  );
  const mixed = useMemo(
    () => shuffle([...templates, ...generations]).slice(0, 40),
    [templates, generations, revision],
  );
  const cards = tab === 'shuffle' ? mixed : tab === 'templates' ? templates : generations;
  const feedCards = cards
    .filter((c) => !hidden.includes(c.id))
    .map((card) => {
      const archived = 'kind' in card;
      const template = archived || feed.templates.includes(card);
      const apply = () => (archived ? onApplyArchive(card) : onApply(card));
      const aspectRatio = archived
        ? card.previewRatio || card.ratio.replace(':', ' / ')
        : card.previewWidth && card.previewHeight
          ? `${card.previewWidth} / ${card.previewHeight}`
          : kind === 'video'
            ? '16 / 9'
            : '1';
      return (
        <article key={card.id} className="card" data-kind={template ? 'template' : 'gen'}>
          <button
            type="button"
            className="feed-preview"
            style={{ aspectRatio }}
            aria-label={(template ? 'Использовать шаблон ' : 'Повторить ') + card.title}
            disabled={busy}
            onClick={apply}
          >
            <TemplateMedia
              key={card.src}
              item={{
                kind,
                src: card.src,
                poster: card.poster,
                previewSrc: archived ? card.previewSrc : undefined,
              }}
            />
            <span className="card-overlay">
              <span className="card-title">{template ? card.title : card.modelTitle}</span>
              <span className="card-cta">{template ? 'Использовать шаблон' : 'Создать похожее'}</span>
            </span>
          </button>
          {!template && (
            <div className="card-actions">
              <a className="icon-btn" href={card.src} download aria-label="Скачать">
                <Download />
              </a>
              <button className="icon-btn" aria-label="Повторить" disabled={busy} onClick={apply}>
                <RotateCcw />
              </button>
              <button
                className="icon-btn"
                aria-label="Удалить из ленты"
                onClick={() => setHidden((ids) => [...ids, card.id])}
              >
                <Trash2 />
              </button>
            </div>
          )}
        </article>
      );
    });
  const content = [...children, ...feedCards];
  return (
    <div className="design-feed">
      <div className="feed-top">
        <div className="feed-tabs" role="tablist" aria-label="Что показать">
          {tabs.map(({ key, name, icon }) => (
            <button
              key={key}
              role="tab"
              className={'feed-tab' + (key === tab ? ' is-active' : '')}
              aria-label={name}
              aria-description={hints[key]}
              aria-selected={tab === key}
              onClick={() => {
                onTab(key);
                if (key === 'shuffle') setRevision((n) => n + 1);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {icon}
              </svg>
            </button>
          ))}
        </div>
      </div>
      <div className={tab === 'generations' ? 'wall generation-wall' : 'wall'} role="tabpanel">
        <Masonry {...layout} ordered={tab !== 'generations'}>
          {content}
        </Masonry>
      </div>
    </div>
  );
}
