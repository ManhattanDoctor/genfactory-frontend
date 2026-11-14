import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { ITemplateCard } from './materials';

export function TemplateMedia({ item }: { item: ITemplateCard }): ReactElement {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const update = () => {
      setActive(visible && !document.hidden && !motion.matches);
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
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (active) {
      video.load();
      void video.play().catch(() => {});
    } else {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }, [active]);
  return item.kind === 'video' ? (
    <>
      <img className="cw-still" src={item.src.replace(/\.mp4$/, '.jpg')} alt="" loading="lazy" />
      <video
        ref={ref}
        src={active ? item.previewSrc || item.src : undefined}
        muted
        loop
        playsInline
        preload="none"
      />
    </>
  ) : (
    <img src={item.src} alt="" loading="lazy" decoding="async" />
  );
}
