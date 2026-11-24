import { LoadingRows } from '../components/Skeleton';
import { LazyImage } from '../components/LazyImage';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { imageModelIdsQuery } from '../features/catalog/catalogQuery';
import { HomeImageViewer } from './HomeImageViewer';
import { modelReviews } from './modelReviewData';
import './model-reviews.css';

export function ModelReviews() {
  const { user } = useAuth();
  const catalog = useQuery(imageModelIdsQuery(user?.id));
  const [limit, setLimit] = useState(6);
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<{ image: { src: string; alt: string }; from: DOMRect }>();
  const visibleReviews = modelReviews.filter(
    (review) => review.images.length && catalog.data?.has(review.model),
  );
  if (catalog.isPending) return <LoadingRows label="Загружаем модели…" />;
  if (catalog.isError)
    return (
      <button className="text-button" onClick={() => void catalog.refetch()}>
        Загрузить модели снова
      </button>
    );
  if (!visibleReviews.length) return null;
  const start = Math.min(Math.max(0, active - 2), Math.max(0, visibleReviews.length - 5));

  return (
    <section className="model-digests" aria-labelledby="model-digests-title">
      <h2 id="model-digests-title">Дайджесты моделей</h2>
      <div
        className="digest-grid"
        ref={track}
        onScroll={({ currentTarget }) => {
          const step = (currentTarget.children[1] as HTMLElement | undefined)?.offsetLeft;
          if (step)
            setActive(
              Math.min(visibleReviews.length - 1, Math.max(0, Math.round(currentTarget.scrollLeft / step))),
            );
        }}
      >
        {visibleReviews.map((review, index) => {
          return (
            <article
              key={review.model}
              className="digest-card"
              data-expanded={index < limit}
              aria-label={review.title}
            >
              <h3>{review.title}</h3>
              <dl>
                <dt>Когда брать</dt>
                <dd>{review.use}</dd>
                <dt>Когда не брать</dt>
                <dd>{review.avoid}</dd>
              </dl>
              {review.images.length > 0 && (
                <div className="digest-previews">
                  {review.images.map((image) => (
                    <button
                      key={image.src}
                      type="button"
                      aria-label={'Открыть: ' + image.alt}
                      onClick={({ currentTarget }) =>
                        setSelected({ image, from: currentTarget.getBoundingClientRect() })
                      }
                    >
                      <LazyImage src={image.src} alt={image.alt} loading="lazy" width={160} height={120} />
                    </button>
                  ))}
                </div>
              )}
              <Link className="button" to={'/image?' + new URLSearchParams({ model: review.model })}>
                Собрать изображение
              </Link>
            </article>
          );
        })}
      </div>
      {limit < visibleReviews.length && (
        <button className="button digest-more" type="button" onClick={() => setLimit(limit + 6)}>
          Показать ещё модели
        </button>
      )}
      <nav className="digest-pages" aria-label="Дайджесты моделей по порядку">
        {visibleReviews.slice(start, start + 5).map((item, i) => (
          <button
            type="button"
            key={item.model}
            aria-label={item.title}
            aria-current={start + i === active ? 'true' : undefined}
            onClick={() => {
              const card = track.current?.children[start + i] as HTMLElement | undefined;
              if (card) track.current?.scrollTo({ left: card.offsetLeft });
            }}
          />
        ))}
        <span>
          {active + 1} / {visibleReviews.length}
        </span>
      </nav>
      {selected && <HomeImageViewer {...selected} onClose={() => setSelected(undefined)} />}
    </section>
  );
}
