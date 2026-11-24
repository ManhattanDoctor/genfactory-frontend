import { useMediaVisibility } from '../../components/useMediaVisibility';
import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ITemplateCard } from '../content-studio/materials';
import './video-workspace.css';

export function VideoTemplateMedia({ item }: { item: ITemplateCard }) {
  const clip = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const { visible, seen } = useMediaVisibility(clip, true, item.src);
  useEffect(() => {
    if (!visible) clip.current?.pause();
  }, [visible]);
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
        if (!video.hasAttribute('src')) video.src = item.src;
        else if (video.error) video.load();
        void video.play().catch((reason) => {
          if (reason?.name !== 'AbortError') setError(true);
        });
      }}
    >
      <video
        key={item.src}
        ref={clip}
        className="img-face"
        poster={seen ? item.src.replace(/\.mp4$/, '.jpg') : undefined}
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
