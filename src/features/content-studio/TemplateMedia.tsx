import type { ReactElement } from 'react';
import { useEffect, useRef } from 'react';
import type { ITemplate } from './materials';

export function TemplateMedia({ item }: { item: ITemplate }): ReactElement {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const update = () => {
      if (visible && !document.hidden && !motion.matches) void video.play().catch(() => {});
      else video.pause();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
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
  }, [item.src]);
  return item.kind === 'video' ? (
    <>
      <img className="cw-still" src={item.src.replace(/\.mp4$/, '.jpg')} alt="" loading="lazy" />
      <video ref={ref} src={item.src} muted loop playsInline preload="metadata" />
    </>
  ) : (
    <img src={item.src} alt="" loading="lazy" />
  );
}
