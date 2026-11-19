import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ITemplateCard } from '../content-studio/materials';
import './video-workspace.css';

export function VideoTemplateMedia({ item }: { item: ITemplateCard }) {
  const clip = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const video = clip.current;
    if (!video) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) video.pause();
    });
    const pauseWhenHidden = () => {
      if (document.hidden) video.pause();
    };
    observer.observe(video);
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', pauseWhenHidden);
    };
  }, []);
  return (
    <button
      className="img-card video-template-player"
      type="button"
      style={{ aspectRatio: item.ratio.replace(':', ' / ') }}
      aria-label={`${playing ? 'Приостановить' : 'Посмотреть'}: ${item.title}`}
      onClick={() => {
        const video = clip.current;
        if (!video) return;
        if (!video.paused) {
          video.pause();
          return;
        }
        setError(false);
        if (video.error) video.load();
        void video.play().catch((reason) => {
          if (reason?.name !== 'AbortError') setError(true);
        });
      }}
    >
      <video
        ref={clip}
        className="img-face"
        src={item.src}
        poster={item.src.replace(/\.mp4$/, '.jpg')}
        preload="none"
        playsInline
        muted
        loop
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          setError(true);
          setPlaying(false);
        }}
      />
      <span className="video-template-play" aria-hidden="true">
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </span>
      {!playing && (
        <span className="img-cap">
          <span>{item.genre}</span>
          <strong>{item.title}</strong>
        </span>
      )}
      {error && (
        <span className="video-template-error" role="status">
          Не удалось открыть видео. Нажмите, чтобы повторить.
        </span>
      )}
    </button>
  );
}
