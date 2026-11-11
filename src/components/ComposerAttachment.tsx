import { X } from 'lucide-react';
import { Media, type MediaFile } from './MediaPreview';
import { FilePlaceholder } from './FilePlaceholder';
import './composer-attachment.css';

export function ComposerAttachment({
  file,
  caption,
  unavailable = false,
  disabled = false,
  className = '',
  onRemove,
  onOpen,
}: {
  file: MediaFile;
  caption?: string;
  unavailable?: boolean;
  disabled?: boolean;
  className?: string;
  onRemove: () => void;
  onOpen?: () => void;
}) {
  return (
    <div className={`composer-attachment ${className}`}>
      <div className="composer-attachment-preview">
        {onOpen && !unavailable ? (
          <button
            type="button"
            className="composer-attachment-open"
            aria-label={`Открыть ${file.name}`}
            onClick={onOpen}
          >
            <Media file={file} isPlaybackDisabled />
          </button>
        ) : unavailable ? (
          <FilePlaceholder file={file} />
        ) : (
          <Media file={file} isPlaybackDisabled />
        )}
        <button
          type="button"
          className="composer-attachment-remove"
          aria-label={`Убрать ${file.name}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <X size={16} />
        </button>
      </div>
      {caption && (
        <span className="composer-attachment-caption" title={caption}>
          {caption}
        </span>
      )}
    </div>
  );
}
