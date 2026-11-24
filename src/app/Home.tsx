import { Masonry } from '../components/Masonry';
import { ModelDigest } from '../components/ModelDigest';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { catalogQuery } from '../features/catalog/catalogQuery';
import { useAuth } from '../features/auth/AuthProvider';
import { modes } from './home/HomeNavigation';
import { icons } from './home/icons';
import content from './home/content.json';
import './home/home.css';

const media = '/media/home/';
function ModeCard({ mode, index }: { mode: (typeof modes)[number]; index: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const poster = media + ['studio-poster.jpg', 'images.png', 'video-poster.jpg'][index];
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void el.play().catch(() => {});
        else el.pause();
      },
      { threshold: index === 2 ? 0.2 : 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [index]);
  return (
    <Link
      to={mode.to}
      aria-label={mode.action}
      title={mode.action}
      onMouseEnter={() => void video.current?.play().catch(() => {})}
      className={'gf-mode-card' + (index === 2 ? ' gf-mode-card-video' : '')}
    >
      {index === 2 && <img className="gf-mode-media gf-mode-media-still" src={poster} alt="" />}
      <video
        ref={video}
        className={'gf-mode-media' + (index === 2 ? ' gf-mode-media-video' : '')}
        poster={poster}
        muted
        playsInline
        loop
        autoPlay={index === 2}
        preload={index === 2 ? 'auto' : 'metadata'}
        src={media + ['studio.mp4', 'images.mp4', 'video.mp4'][index]}
      />
      <div className="gf-mode-shade" />
      <div className="gf-mode-badge">{icons[mode.icon]}</div>
      <div className="gf-mode-cta">
        <span>{mode.action}</span>
      </div>
      <div className="gf-mode-meta">
        <p className="gf-mode-title">{mode.label}</p>
        <p className="gf-mode-sub">{index === 0 ? 'Генерация в диалоге' : 'Моно-генерация'}</p>
      </div>
    </Link>
  );
}

export function Home() {
  const auth = useAuth();
  const catalog = useQuery(catalogQuery(auth.user?.id, 'OPEN_ROUTER_IMAGE'));
  const [tab, setTab] = useState('generations');
  const [limit, setLimit] = useState(9);
  const [detail, setDetail] = useState<(typeof content.digests)[number]>();
  function imageRoute(id: string) {
    return id &&
      (!catalog.data ||
        catalog.data.some(
          (item) => item.reference.model === id && item.capabilities?.includes('IMAGE_OUTPUT'),
        ))
      ? '/image?' + new URLSearchParams({ model: id })
      : undefined;
  }
  return (
    <>
      <h1 id="home-title" className="gf-sr-only">
        Главная GenFactory
      </h1>
      <section className="gf-modes" aria-label="Режимы работы">
        {modes.map((mode, index) => (
          <ModeCard key={mode.to} mode={mode} index={index} />
        ))}
      </section>
      <div className="gf-tabs" role="tablist" aria-label="Витрина моделей">
        {[
          ['generations', 'Генерации'],
          ['digests', 'Дайджесты'],
        ].map(([id, label]) => (
          <button
            key={id}
            id={'tab-' + id}
            aria-controls={'panel-' + id}
            role="tab"
            aria-selected={tab === id}
            className={'gf-tab' + (tab === id ? ' gf-is-active' : '')}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <section
        className="gf-panel"
        id="panel-generations"
        role="tabpanel"
        aria-labelledby="tab-generations"
        hidden={tab !== 'generations'}
      >
        <div className="gf-wall" aria-label="Стена генераций">
          <Masonry ordered>
            {content.wall.map((w, i) => {
              const digest = content.digests[w.model],
                to = imageRoute(digest.model);
              const card = (
                <>
                  <img
                    src={w.src}
                    width={w.width}
                    height={w.height}
                    alt=""
                    loading={i < 16 ? 'eager' : 'lazy'}
                    decoding="async"
                  />
                  <div className="gf-wall-overlay">
                    <p className="gf-wall-model">{digest.title}</p>
                    <span className="gf-wall-create">{to ? 'Создать' : 'Модель недоступна'}</span>
                  </div>
                </>
              );
              return to ? (
                <Link
                  key={w.src}
                  className="gf-wall-item"
                  aria-label={'Создать в модели ' + digest.title}
                  title={'Создать в модели ' + digest.title}
                  to={to}
                >
                  {card}
                </Link>
              ) : (
                <div className="gf-wall-item" tabIndex={0} key={w.src}>
                  {card}
                </div>
              );
            })}
          </Masonry>
        </div>
      </section>
      <section
        className="gf-panel"
        id="panel-digests"
        role="tabpanel"
        aria-labelledby="tab-digests"
        hidden={tab !== 'digests'}
      >
        <div className="gf-digests">
          <Masonry ordered>
            {content.digests.slice(0, limit).map((m) => (
              <button
                key={m.title}
                className="gf-digest-card"
                onClick={(event) => {
                  event.currentTarget.focus({ preventScroll: true });
                  setDetail(m);
                }}
                aria-label={'Открыть дайджест ' + m.title}
                title={'Открыть дайджест ' + m.title}
              >
                <div className="gf-digest-mosaic">
                  {m.covers.map((src) => (
                    <img key={src} src={src} alt="" loading="lazy" />
                  ))}
                  <div className="gf-digest-hover">
                    <span>Открыть дайджест</span>
                  </div>
                </div>
                <h3 className="gf-digest-name">{m.title}</h3>
              </button>
            ))}
          </Masonry>
        </div>
        {limit < content.digests.length && (
          <div className="gf-digest-more-wrap">
            <button className="gf-btn-more" onClick={() => setLimit((n) => n + 9)}>
              Показать ещё модели
            </button>
          </div>
        )}
      </section>
      {detail && (
        <ModelDigest detail={detail} onClose={() => setDetail(undefined)}>
          {imageRoute(detail.model) ? (
            <Link className="gf-btn-primary" to={imageRoute(detail.model)!}>
              Открыть в Изображениях
            </Link>
          ) : (
            <span>Модель недоступна</span>
          )}
        </ModelDigest>
      )}
    </>
  );
}
