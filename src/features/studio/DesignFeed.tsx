import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Download, RotateCcw, Trash2 } from 'lucide-react';
import images from './image-feed.json';
import videos from './video-feed.json';
import { shuffle } from 'lodash';

export type FeedCard = (typeof images.templates)[number] & { previewWidth?: number; previewHeight?: number };
export const feeds: Record<'image' | 'video', { templates: FeedCard[]; generations: FeedCard[] }> = {
  image: images,
  video: videos,
};
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
  tab,
  onTab,
  onApply,
  busy,
  children,
}: {
  kind: 'image' | 'video';
  tab: FeedTab;
  onTab: (tab: FeedTab) => void;
  onApply: (card: FeedCard) => void;
  busy: boolean;
  children?: ReactNode;
}) {
  const feed = feeds[kind];
  const hints: Record<FeedTab, string> = {
    templates: kind === 'video' ? 'Выбрать шаблон ролика' : 'Выбрать шаблон изображения',
    generations:
      kind === 'video' ? 'Посмотреть свои видео и примеры' : 'Посмотреть свои изображения и примеры',
    shuffle: 'Перемешать шаблоны и примеры',
  };
  const wall = useRef<HTMLDivElement>(null);
  const [revision, setRevision] = useState(0);
  const [hidden, setHidden] = useState<string[]>([]);
  const mixed = useMemo(
    () => shuffle([...feed.templates, ...feed.generations]).slice(0, 40),
    [feed, revision],
  );
  const cards = tab === 'shuffle' ? mixed : feed[tab];
  useEffect(() => {
    if (kind !== 'video' || !wall.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.2) void video.play().catch(() => {});
          else video.pause();
        }
      },
      { rootMargin: '120px 0px', threshold: [0, 0.2, 0.5, 1] },
    );
    wall.current.querySelectorAll('video').forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, [kind, cards, hidden]);
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
              data-tooltip={hints[key]}
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
      <div ref={wall} className="wall" role="tabpanel">
        {children}
        {cards
          .filter((c) => !hidden.includes(c.id))
          .map((card) => {
            const template = feed.templates.includes(card);
            return (
              <article key={card.id} className="card" data-kind={template ? 'template' : 'gen'}>
                <button
                  type="button"
                  className="feed-preview"
                  aria-label={(template ? 'Использовать шаблон ' : 'Повторить ') + card.title}
                  disabled={busy}
                  onClick={() => onApply(card)}
                >
                  {kind === 'image' ? (
                    <img src={card.src} alt="" loading="lazy" />
                  ) : (
                    <video
                      muted
                      playsInline
                      loop
                      preload="none"
                      width={card.previewWidth}
                      height={card.previewHeight}
                      poster={card.poster}
                      src={card.src}
                    />
                  )}
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
                    <button
                      className="icon-btn"
                      aria-label="Повторить"
                      disabled={busy}
                      onClick={() => onApply(card)}
                    >
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
          })}
      </div>
    </div>
  );
}
