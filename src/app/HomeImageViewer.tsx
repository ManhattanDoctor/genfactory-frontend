import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Shared image viewer follows prototype/home-board.js, images-wall.js and krea.css. */
export function HomeImageViewer({
  image,
  from,
  onClose,
}: {
  image: { src: string; alt: string };
  from: DOMRect;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const shot = useRef<HTMLImageElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const frames = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closingRef = useRef(false);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [active, setActive] = useState(false);
  const [closing, setClosing] = useState(false);
  const [rect, setRect] = useState({
    left: from.left,
    top: from.top,
    width: from.width,
    height: from.height,
  });
  function fit() {
    const node = shot.current;
    if (!node?.naturalWidth || closingRef.current) return;
    const scale = Math.min(
      Math.min(innerWidth * 0.86, 1200) / node.naturalWidth,
      (innerHeight * 0.86) / node.naturalHeight,
    );
    const width = node.naturalWidth * scale;
    const height = node.naturalHeight * scale;
    setRect({ left: (innerWidth - width) / 2, top: (innerHeight - height) / 2, width, height });
  }
  function grow() {
    if (closingRef.current) return;
    setLoadState('ready');
    frames.current.push(
      requestAnimationFrame(() => {
        frames.current.push(
          requestAnimationFrame(() => {
            if (closingRef.current) return;
            setActive(true);
            fit();
          }),
        );
      }),
    );
  }
  function close() {
    if (closingRef.current) return;
    closingRef.current = true;
    frames.current.forEach(cancelAnimationFrame);
    setClosing(true);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setRect({ left: from.left, top: from.top, width: from.width, height: from.height });
    timer.current = setTimeout(onClose, 240);
  }
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    node?.showModal();
    closeButton.current?.focus();
    window.addEventListener('resize', fit);
    return () => {
      frames.current.forEach(cancelAnimationFrame);
      clearTimeout(timer.current);
      window.removeEventListener('resize', fit);
      node?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className={`home-image-view ${active && !closing ? 'is-on' : ''}`}
      aria-label={image.alt}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <img
        ref={shot}
        className="home-image-view-shot"
        src={image.src}
        alt={image.alt}
        onLoad={grow}
        onError={() => {
          if (closingRef.current) return;
          setLoadState('error');
          setActive(true);
        }}
        hidden={loadState === 'error'}
        style={{ ...rect, objectFit: active && !closing ? 'contain' : 'cover' }}
      />
      {loadState !== 'ready' && (
        <p className="home-image-view-note" role={loadState === 'error' ? 'alert' : 'status'}>
          {loadState === 'error' ? 'Изображение не открылось.' : 'Открывается'}
        </p>
      )}
      <button
        ref={closeButton}
        className="home-image-view-close"
        type="button"
        aria-label="Закрыть"
        onClick={close}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6 6 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </dialog>,
    document.body,
  );
}
