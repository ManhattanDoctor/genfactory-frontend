import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { HomeImageViewer } from './HomeImageViewer';
import { modelReviews } from './modelReviewData';

export function ModelReviews() {
  return modelReviews.map((review) => <ModelReview key={review.id} review={review} />);
}

function ModelReview({ review }: { review: (typeof modelReviews)[number] }) {
  const [tab, setTab] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<{ image: (typeof review.images)[number]; from: DOMRect } | null>(
    null,
  );
  return (
    <section
      className={`model-review ${expanded ? 'is-expanded' : ''}`}
      aria-labelledby={`${review.id}-title`}
    >
      <h2 id={`${review.id}-title`}>{review.title}</h2>
      <p className="model-review-subtitle">{review.subtitle}</p>
      <div className="model-review-tabs" role="tablist" aria-label={`Обзор ${review.title}`}>
        {review.tabs.map((item, index) => (
          <button
            key={item.label}
            role="tab"
            id={`${review.id}-tab-${index}`}
            aria-controls={`${review.id}-panel-${index}`}
            aria-selected={tab === index}
            tabIndex={tab === index ? 0 : -1}
            onClick={() => setTab(index)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % review.tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + review.tabs.length - 1) % review.tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? review.tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              setTab(next);
              document.getElementById(`${review.id}-tab-${next}`)?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="model-review-panels">
        {review.tabs.map((item, index) => (
          <p
            key={item.label}
            role="tabpanel"
            id={`${review.id}-panel-${index}`}
            aria-labelledby={`${review.id}-tab-${index}`}
            hidden={index !== tab}
          >
            {item.text}
          </p>
        ))}
      </div>
      <div className="model-review-gallery" id={`${review.id}-gallery`}>
        {(expanded ? review.images : review.images.slice(0, 4)).map((item) => (
          <button
            key={item.src}
            className="model-review-frame"
            aria-label={`Открыть: ${item.alt}`}
            onClick={(event) =>
              setSelected({
                image: item,
                from: event.currentTarget.querySelector('img')!.getBoundingClientRect(),
              })
            }
          >
            <img src={item.src} alt={item.alt} width={item.width} height={item.height} loading="lazy" />
            {item.note && <span>{item.note}</span>}
          </button>
        ))}
      </div>
      <button
        className="model-review-more"
        aria-label={expanded ? 'Свернуть' : 'Развернуть'}
        aria-expanded={expanded}
        aria-controls={`${review.id}-gallery`}
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronDown size={22} aria-hidden="true" />
      </button>
      {selected && (
        <HomeImageViewer image={selected.image} from={selected.from} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
