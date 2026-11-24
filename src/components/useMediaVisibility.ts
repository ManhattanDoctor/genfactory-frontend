import { useEffect, useState, type RefObject } from 'react';

export function useMediaVisibility(
  ref: RefObject<Element | null>,
  enabled = true,
  sourceKey = '',
  once = false,
) {
  const [visible, setVisible] = useState(false);
  const [seenKey, setSeenKey] = useState<string>();
  const complete = once && seenKey === sourceKey;
  useEffect(() => {
    if (!enabled || complete || !ref.current) return;
    let intersects = false;
    const update = () => {
      const show = intersects && !document.hidden;
      setVisible(show);
      if (show) setSeenKey(sourceKey);
    };
    const observer = new IntersectionObserver(([entry]) => {
      intersects = entry.isIntersecting;
      update();
    });
    observer.observe(ref.current);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [enabled, complete, ref, sourceKey]);
  return { visible, seen: seenKey === sourceKey };
}
