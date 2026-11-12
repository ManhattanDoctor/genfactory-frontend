import type { ReactElement } from 'react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { destinations } from './destinations';
import { ModelReviews } from './ModelReviews';

export function Home(): ReactElement {
  const { user } = useAuth();
  return (
    <div className="home studio-home page-enter">
      <section className="home-intro" aria-labelledby="home-title">
        <h1 id="home-title">
          Сначала задача. <span>Потом кадр.</span>
        </h1>
        <p>
          {user
            ? 'Изображения, видео и проекты — всё для вашей следующей идеи.'
            : 'Опишите сцену своими словами. Студия соберёт фото, ролик или текст для кадра - в том окне, которое для этого нужно.'}
        </p>
      </section>
      <div className="home-signs">
        <section className="home-destinations" aria-label="Начать создание">
          {destinations.slice(0, 3).map((item) => (
            <Link className="home-destination" key={item.to} to={item.to}>
              {'cover' in item && (
                <img
                  className="home-destination-cover"
                  src={`/media/prototype/${item.cover}.jpg`}
                  alt=""
                  width={640}
                  height={640}
                  fetchPriority={item.to === '/chat' ? 'high' : 'auto'}
                />
              )}
              {item.to === '/chat' && <StudioBannerVideo />}
              <div className="home-destination-caption">
                <img src={`/media/prototype/${item.icon}.webp`} alt="" width={64} height={64} />
                <div>
                  <h2>{item.label}</h2>
                  <p>{item.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </section>
        <details className="home-tools-fold">
          <summary>Дополнительные инструменты</summary>
          <section className="home-tools" aria-label="Инструменты">
            {destinations.slice(3).map((item) => (
              <Link to={item.to} key={item.to}>
                <img src={`/media/prototype/${item.icon}.webp`} alt="" width={40} height={40} />
                <div>
                  <h2>{item.label}</h2>
                  <p>{item.description}</p>
                </div>
              </Link>
            ))}
          </section>
        </details>
      </div>
      <ModelReviews />
    </div>
  );
}

function StudioBannerVideo(): ReactElement {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current!;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let near = !('IntersectionObserver' in window);
    const play = () => {
      if (document.hidden || motion.matches || !near) return;
      void video.play().catch(() => video.classList.remove('is-ready'));
    };
    const ready = () => video.classList.add('is-ready');
    const failed = () => video.classList.remove('is-ready');
    const visibility = () => (document.hidden || !near ? video.pause() : play());
    const configure = () => {
      if (motion.matches) {
        video.pause();
        video.removeAttribute('src');
        failed();
        video.load();
      } else if (near) {
        if (!video.hasAttribute('src')) video.src = '/media/prototype/studio-banner.mp4';
        play();
      } else video.pause();
    };
    video.addEventListener('canplay', play);
    video.addEventListener('playing', ready);
    video.addEventListener('error', failed);
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', configure);
    const observer =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            (entries) => {
              near = entries.some((entry) => entry.isIntersecting);
              configure();
            },
            { rootMargin: '200px' },
          )
        : undefined;
    observer?.observe(video);
    configure();
    return () => {
      observer?.disconnect();
      video.pause();
      video.removeEventListener('canplay', play);
      video.removeEventListener('playing', ready);
      video.removeEventListener('error', failed);
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', configure);
    };
  }, []);
  return (
    <video
      ref={ref}
      className="home-destination-film"
      muted
      loop
      playsInline
      preload="none"
      width={1024}
      height={768}
      aria-hidden="true"
    />
  );
}
