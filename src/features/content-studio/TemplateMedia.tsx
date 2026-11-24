import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Media } from '../../components/MediaPreview';
import type { ITemplateCard } from './materials';

export function TemplateMedia({
  item,
}: {
  item: Pick<ITemplateCard, 'kind' | 'src' | 'poster' | 'previewSrc'>;
}): ReactElement {
  const isVideo = item.kind === 'video';
  const preview = item.previewSrc || item.src;
  const poster = isVideo ? item.poster || item.src.replace(/\.mp4$/, '.jpg') : item.src;
  const [active, setActive] = useState(false);
  const [requested, setRequested] = useState(false);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const update = () => {
      const shouldPlay = visible && !document.hidden && !motion.matches;
      setActive(shouldPlay);
      if (shouldPlay) setRequested(true);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.2;
        update();
      },
      { threshold: 0.2 },
    );
    observer.observe(video);
    document.addEventListener('visibilitychange', update);
    motion.addEventListener('change', update);
    return () => {
      observer.disconnect();
      video.pause();
      document.removeEventListener('visibilitychange', update);
      motion.removeEventListener('change', update);
    };
  }, [isVideo, preview]);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (active && requested) void video.play().catch(() => {});
    else video.pause();
  }, [active, preview, requested]);
  return (
    <span className="template-card-media">
      <Media file={{ type: 'IMAGE', name: '', mime: 'image/jpeg', path: poster }} />
      {isVideo && (
        <video
          className={playing ? 'is-ready' : undefined}
          aria-hidden="true"
          ref={ref}
          src={requested ? preview : undefined}
          muted
          loop
          playsInline
          preload="none"
          onPlaying={() => setPlaying(true)}
          onError={() => setPlaying(false)}
        />
      )}
    </span>
  );
}
