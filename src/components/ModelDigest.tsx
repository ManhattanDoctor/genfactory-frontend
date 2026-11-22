import { useEffect, useRef, type ReactNode } from 'react';
interface Digest {
  title: string;
  verdict: string;
  gallery: string[];
  take: string[];
  avoid: string[];
  start?: string;
}
export function ModelDigest({
  detail,
  onClose,
  children,
}: {
  detail: Digest;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    el?.showModal();
    return () => {
      el?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="gf-detail"
      aria-labelledby="digest-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="gf-detail-panel">
        <div className="gf-detail-bar">
          <button type="button" className="gf-btn-back" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 6 9 12l6 6"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Назад
          </button>
          <h2 className="gf-detail-title" id="digest-title">
            {detail.title}
          </h2>
        </div>
        <div className="gf-detail-body">
          <div className="gf-detail-gallery">
            {detail.gallery.map((src) => (
              <img key={src} src={src} alt="" loading="lazy" />
            ))}
          </div>
          <div className="gf-detail-copy">
            <p className="gf-detail-verdict">{detail.verdict}</p>
            {[
              { items: detail.take, title: 'Когда брать', cls: 'gf-is-good' },
              { items: detail.avoid, title: 'Когда не брать', cls: 'gf-is-bad' },
            ].map(({ items, title, cls }) => (
              <div key={title}>
                <h3 className="gf-detail-h">{title}</h3>
                <ul className={'gf-detail-list ' + cls}>
                  {items.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
            {detail.start && <p>{detail.start}</p>}
            {children}
          </div>
        </div>
      </div>
    </dialog>
  );
}
