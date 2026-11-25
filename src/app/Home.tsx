import { LoadingRows } from '../components/Skeleton';
import { useMediaVisibility } from '../components/useMediaVisibility';
import { LazyImage } from '../components/LazyImage';
import { Masonry } from '../components/Masonry';
import { ModelDigest } from '../components/ModelDigest';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { imageModelIdsQuery } from '../features/catalog/catalogQuery';
import { useAuth } from '../features/auth/AuthProvider';
import { modes } from './home/HomeNavigation';
import { icons } from './home/icons';
import content from './home/content.json';
import './home/home.css';

const media = '/media/home/';
function ModeCard({ mode, index }: { mode: (typeof modes)[number]; index: number }) {
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const clip = media + ['studio', 'images', 'video'][index];
  const { visible, seen } = useMediaVisibility(video);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      if (visible && !motion.matches) void el.play().catch(() => {});
      else el.pause();
    };
    update();
    motion.addEventListener('change', update);
    return () => motion.removeEventListener('change', update);
  }, [visible]);
  return (
    <Link
      to={mode.to}
      aria-label={mode.action}
      className={'gf-mode-card' + (index === 2 ? ' gf-mode-card-video' : '')}
    >
      <LazyImage className="gf-mode-media" src={clip + '-poster.jpg'} alt="" />
      <video
        ref={video}
        className={'gf-mode-media' + (index === 2 ? ' gf-mode-media-video' : '')}
        style={{ visibility: playing ? 'visible' : 'hidden' }}
        onPlaying={() => setPlaying(true)}
        onError={() => setPlaying(false)}
        muted
        playsInline
        loop
        preload="none"
        src={seen ? clip + '.mp4' : undefined}
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
  const catalog = useQuery(imageModelIdsQuery(auth.user?.id));
  const [tab, setTab] = useState('generations');
  const [limit, setLimit] = useState(9);
  const [detail, setDetail] = useState<(typeof content.digests)[number]>();
  const digests = content.digests.filter((item) => catalog.data?.has(item.model));
  const imageRoute = (id: string) => '/image?' + new URLSearchParams({ model: id });
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
      {catalog.isPending && <LoadingRows label="Загружаем модели…" />}
      {catalog.isError && (
        <button className="text-button" onClick={() => void catalog.refetch()}>
          Загрузить модели снова
        </button>
      )}
      <section
        className="gf-panel"
        id="panel-generations"
        role="tabpanel"
        aria-labelledby="tab-generations"
        hidden={tab !== 'generations'}
      >
        <div className="gf-wall" aria-label="Стена генераций">
          <Masonry ordered>
            {content.wall
              .filter((w) => catalog.data?.has(content.digests[w.model].model))
              .map((w) => {
                const digest = content.digests[w.model],
                  to = imageRoute(digest.model);
                const card = (
                  <>
                    <LazyImage
                      src={w.src}
                      width={w.width}
                      height={w.height}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="gf-wall-overlay">
                      <p className="gf-wall-model">{digest.title}</p>
                      <span className="gf-wall-create">Создать</span>
                    </div>
                  </>
                );
                return (
                  <Link
                    key={w.src}
                    className="gf-wall-item"
                    aria-label={'Создать в модели ' + digest.title}
                    to={to}
                  >
                    {card}
                  </Link>
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
            {digests.slice(0, limit).map((m) => (
              <button
                key={m.title}
                className="gf-digest-card"
                onClick={(event) => {
                  event.currentTarget.focus({ preventScroll: true });
                  setDetail(m);
                }}
                aria-label={'Открыть дайджест ' + m.title}
              >
                <div className="gf-digest-mosaic">
                  {m.covers.map((src) => (
                    <LazyImage key={src} src={src} alt="" loading="lazy" />
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
        {limit < digests.length && (
          <div className="gf-digest-more-wrap">
            <button className="gf-btn-more" onClick={() => setLimit((n) => n + 9)}>
              Показать ещё модели
            </button>
          </div>
        )}
      </section>
      {detail && catalog.data?.has(detail.model) && (
        <ModelDigest detail={detail} onClose={() => setDetail(undefined)}>
          <Link className="gf-btn-primary" to={imageRoute(detail.model)}>
            Открыть в Изображениях
          </Link>
        </ModelDigest>
      )}
    </>
  );
}
