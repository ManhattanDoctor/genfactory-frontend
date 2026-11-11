import { useState } from 'react';
import { X } from 'lucide-react';
import { Media, MediaPreview, type PreviewFile } from './MediaPreview';
import { FilePlaceholder } from './FilePlaceholder';
import './composer-attachment.css';

export function ComposerAttachment({
  file,
  caption,
  unavailable = false,
  disabled = false,
  className = '',
  onRemove,
}: {
  file: PreviewFile;
  caption?: string;
  unavailable?: boolean;
  disabled?: boolean;
  className?: string;
  onRemove: () => void;
}) {
  const label = caption ?? file.name;
  const [preview, setPreview] = useState(false);
  return (
    <>
      <div className={`composer-attachment ${className}`}>
        <button
          type="button"
          className="composer-attachment-open"
          aria-label={`Открыть ${file.name}`}
          disabled={unavailable}
          onClick={() => setPreview(true)}
        >
          <span className="composer-attachment-preview">
            {unavailable ? <FilePlaceholder file={file} /> : <Media file={file} isPlaybackDisabled />}
          </span>
          {label && (
            <span className="composer-attachment-caption" title={label}>
              {label}
            </span>
          )}
        </button>
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
      {preview && <MediaPreview file={file} autoPlay={false} onClose={() => setPreview(false)} />}
    </>
  );
}
