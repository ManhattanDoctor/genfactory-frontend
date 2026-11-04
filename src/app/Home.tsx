import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUp, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../features/auth/AuthProvider';
import { usePreferences } from '../features/workspace/preferences';
import { ConversationCover } from '../features/studio/ConversationCover';
import { api } from '../lib/api';
import { destinations } from './destinations';
import { ModelReviews } from './ModelReviews';

export function Home() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState('');
  const navigate = useNavigate();
  return (
    <div className="home studio-home page-enter">
      <section className="home-intro" aria-labelledby="home-title">
        <h1 id="home-title">
          Сначала задача. <span>Потом кадр.</span>
        </h1>
        <p>
          {user
            ? 'Семь окон одной студии. Ниже — ваши последние фото и ролики из этого браузера.'
            : 'Опишите сцену своими словами. Студия соберёт фото, ролик или текст для кадра - в том окне, которое для этого нужно.'}
        </p>
        <form
          className="home-task"
          onSubmit={(event) => {
            event.preventDefault();
            if (prompt.trim()) navigate('/chat', { state: { prompt: prompt.trim() } });
          }}
        >
          <label className="sr-only" htmlFor="home-task">
            Ваша задача
          </label>
          <textarea
            id="home-task"
            rows={1}
            value={prompt}
            maxLength={32000}
            required
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Спросите, что умеет сервис"
          />
          <span className="home-auto">Auto</span>
          <button type="submit" aria-label="Продолжить в студии">
            <ArrowUp size={22} />
          </button>
        </form>
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
      </div>
      <ModelReviews />
      <RecentWorks />
    </div>
  );
}

function RecentWorks() {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(false);
  const tabs = [
    ['all', 'Все'],
    ['image', 'Изображения'],
    ['video', 'Видео'],
    ['presentation', 'Презентации'],
    ['prompt', 'Промпты'],
  ];
  const { user } = useAuth();
  const preferences = usePreferences();
  const query = useQuery({
    queryKey: ['conversations', user?.id, 0, 'all'],
    enabled: !!user,
    queryFn: ({ signal }) => api.conversations(user!.id, 0, signal),
  });
  const own = (query.data?.items || []).filter(
    (item) => item.userId === user?.id && !preferences.value.archive.includes(item.id),
  );
  const items = own.filter((item) => filter === 'all' || item.tags?.includes(filter));
  return (
    <section
      className={`home-stories ${expanded ? 'is-open' : items.length > 4 ? 'is-tall' : ''}`}
      aria-labelledby="recent-title"
    >
      <div className="stories-bg" aria-hidden="true" />
      <div className="stories-head">
        <h2 id="recent-title">История</h2>
        <p>Изображения, ролики, презентации и промпты, которые вы уже собрали.</p>
      </div>
      {!!user && own.length > 0 && (
        <div className="stories-copy">
          <div className="stories-switch" role="tablist" aria-label="Что показать">
            {tabs.map(([key, label], index) => (
              <button
                key={key}
                id={`stories-tab-${key}`}
                type="button"
                role="tab"
                className={filter === key ? 'is-on' : ''}
                aria-selected={filter === key}
                aria-controls="stories-results"
                tabIndex={filter === key ? 0 : -1}
                onClick={() => {
                  setFilter(key);
                  setExpanded(false);
                }}
                onKeyDown={(event) => {
                  const next =
                    event.key === 'ArrowRight'
                      ? (index + 1) % tabs.length
                      : event.key === 'ArrowLeft'
                        ? (index + tabs.length - 1) % tabs.length
                        : null;
                  if (next === null) return;
                  event.preventDefault();
                  setFilter(tabs[next][0]);
                  setExpanded(false);
                  document.getElementById(`stories-tab-${tabs[next][0]}`)?.focus();
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {!user ? (
        <p className="stories-empty">Войдите, чтобы увидеть свою историю.</p>
      ) : query.isPending ? (
        <p className="stories-empty" role="status">
          Загружаем работы…
        </p>
      ) : query.isError ? (
        <p className="stories-empty" role="alert">
          Не удалось загрузить работы.{' '}
          <button className="text-button" onClick={() => void query.refetch()}>
            Повторить
          </button>
        </p>
      ) : (
        <div
          id="stories-results"
          role={own.length ? 'tabpanel' : undefined}
          aria-labelledby={own.length ? `stories-tab-${filter}` : undefined}
        >
          {items.length ? (
            <div className="stories-stage">
              <div className="stories-grid">
                {items.map((item) => (
                  <div className="stories-frame" key={item.id}>
                    <ConversationCover conversation={item} />
                  </div>
                ))}
              </div>
              <div className="stories-fade" aria-hidden="true" />
            </div>
          ) : (
            <p className="stories-empty">
              {own.length
                ? 'В этом списке пока ничего нет.'
                : 'Здесь появятся изображения, ролики, презентации и промпты.'}
            </p>
          )}
        </div>
      )}
      {items.length > 4 && (
        <button
          className="stories-more"
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? 'Свернуть' : 'Развернуть'}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown size={22} />
        </button>
      )}
    </section>
  );
}

function StudioBannerVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current!;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const play = () => {
      if (document.hidden || motion.matches) return;
      void video.play().catch(() => video.classList.remove('is-ready'));
    };
    const ready = () => video.classList.add('is-ready');
    const failed = () => video.classList.remove('is-ready');
    const visibility = () => (document.hidden ? video.pause() : play());
    const configure = () => {
      if (motion.matches) {
        video.pause();
        video.removeAttribute('src');
        failed();
        video.load();
      } else {
        video.src = '/media/prototype/studio-banner.mp4';
      }
    };
    video.addEventListener('canplay', play);
    video.addEventListener('playing', ready);
    video.addEventListener('error', failed);
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', configure);
    configure();
    return () => {
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
      preload="auto"
      width={1024}
      height={768}
      aria-hidden="true"
    />
  );
}
