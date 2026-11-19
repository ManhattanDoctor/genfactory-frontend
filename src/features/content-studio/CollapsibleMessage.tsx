import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function CollapsibleMessage({ children }: { children: ReactNode }) {
  const id = useId();
  const content = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const node = content.current!;
    const measure = () => {
      const height = node.getBoundingClientRect().height;
      setOverflows(height > 7 * parseFloat(getComputedStyle(node).lineHeight) + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="studio-message-text">
      <div
        id={id}
        className={expanded ? undefined : 'studio-message-preview'}
        onFocusCapture={() => {
          if (overflows) setExpanded(true);
        }}
      >
        <div ref={content} className="studio-message-content">
          {children}
        </div>
      </div>
      {overflows && (
        <button
          type="button"
          className="studio-thread-link"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Свернуть' : 'Показать ещё'}
        </button>
      )}
    </div>
  );
}
