import type { ReactElement, ReactNode } from 'react';
import { Play } from 'lucide-react';
import './card-preview.css';

export function CardPreview({
  children,
  className = '',
  isVideo = false,
}: {
  children: ReactNode;
  className?: string;
  isVideo?: boolean;
}): ReactElement {
  return (
    <div
      className={`card-preview ${className}`}
      onLoadCapture={(event) => {
        const image = event.target;
        if (image instanceof HTMLImageElement) {
          image.classList.toggle('portrait-preview', !isVideo && image.naturalHeight > image.naturalWidth);
        }
      }}
    >
      {children}
      {isVideo && <Play className="card-preview-video" size={20} aria-label="Видео" />}
    </div>
  );
}
