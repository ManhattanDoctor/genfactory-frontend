import { ExternalLink, ImageOff } from 'lucide-react';
import { safeMediaUrl } from '../lib/api';
import type { GnosisFile } from '../lib/types';
import { Modal } from './Modal';
export function Media({ file, controls = false }: { file: GnosisFile; controls?: boolean }) {
  const src = safeMediaUrl(file.path);
  if (!src)
    return (
      <div className="media-missing">
        <ImageOff />
        <span>Предпросмотр недоступен</span>
      </div>
    );
  return file.type === 'VIDEO' || file.mime?.startsWith('video/') ? (
    <video src={src} controls={controls} muted={!controls} preload="metadata" playsInline />
  ) : (
    <img src={src} alt={file.name} loading="lazy" />
  );
}
export function MediaPreview({
  file,
  onClose,
  onUse,
}: {
  file: GnosisFile;
  onClose: () => void;
  onUse?: () => void;
}) {
  return (
    <Modal title={file.name} onClose={onClose} wide>
      <div className="media-preview">
        <Media file={file} controls />
      </div>
      <div className="modal-actions">
        <span className="muted small">{new Date(file.createdDate).toLocaleString('ru-RU')}</span>
        {onUse && (
          <button className="button" onClick={onUse}>
            Использовать как референс
          </button>
        )}
        {safeMediaUrl(file.path) && (
          <a
            className="button primary"
            href={safeMediaUrl(file.path)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть оригинал <ExternalLink size={16} />
          </a>
        )}
      </div>
    </Modal>
  );
}
