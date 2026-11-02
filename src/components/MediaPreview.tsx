import { useEffect, useState } from 'react';
import { ExternalLink, ImageOff } from 'lucide-react';
import { safeMediaUrl } from '../lib/api';
import type { GnosisFile } from '../lib/types';
import { Modal } from './Modal';
export function Media({ file, controls = false }: { file: GnosisFile; controls?: boolean }) {
  const src = safeMediaUrl(file.path);
  const [failedSource, setFailedSource] = useState<string>();
  if (!src || failedSource === src)
    return (
      <div className="media-missing">
        <ImageOff />
        <span>Предпросмотр недоступен</span>
      </div>
    );
  if (
    file.type !== 'IMAGE' &&
    !file.mime?.startsWith('image/') &&
    file.type !== 'VIDEO' &&
    !file.mime?.startsWith('video/')
  )
    return file.mime?.startsWith('audio/') && controls ? (
      <audio src={src} controls onError={() => setFailedSource(src)} />
    ) : (
      <div className="media-missing">
        <ExternalLink />
        <span>{file.name}</span>
        <span>{file.mime?.startsWith('audio/') ? 'Аудиозапись' : 'Документ'}</span>
      </div>
    );
  return file.type === 'VIDEO' || file.mime?.startsWith('video/') ? (
    <video
      src={src}
      onError={() => setFailedSource(src)}
      controls={controls}
      muted={!controls}
      preload="metadata"
      playsInline
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        if (!controls && video.currentTime === 0 && Number.isFinite(video.duration) && video.duration > 0)
          video.currentTime = Math.min(0.1, video.duration / 2);
      }}
    />
  ) : (
    <img src={src} alt={file.name} loading="lazy" onError={() => setFailedSource(src)} />
  );
}
export function MediaPreview({
  file,
  files = [],
  onClose,
  onUse,
  onAnalyze,
  onAnimate,
}: {
  file: GnosisFile;
  files?: GnosisFile[];
  onClose: () => void;
  onUse?: (file: GnosisFile) => void;
  onAnalyze?: (file: GnosisFile) => void;
  onAnimate?: (file: GnosisFile) => void;
}) {
  const [current, setCurrent] = useState(file);
  const [compare, setCompare] = useState('');
  const [notice, setNotice] = useState('');
  const [downloading, setDownloading] = useState(false);
  const collection = [
    ...new Map([...files, file].filter((f) => f.userId === file.userId).map((f) => [f.id, f])).values(),
  ];
  const index = collection.findIndex((f) => f.id === current.id);
  const images = collection.filter((f) => f.type === 'IMAGE' && f.id !== current.id);
  const other = images.find((f) => String(f.id) === compare);
  const move = (delta: number) => {
    const next = collection[index + delta];
    if (next) {
      setCurrent(next);
      setCompare('');
      setNotice('');
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input,textarea,select') || downloading) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        move(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        move(1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current.id, files, downloading]);
  const download = async () => {
    const url = safeMediaUrl(current.path);
    if (!url) return;
    setDownloading(true);
    setNotice('');
    try {
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const object = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = object;
      a.download = current.name.replace(/[\\/:*?"<>|]/g, '_');
      a.click();
      setTimeout(() => URL.revokeObjectURL(object), 1000);
    } catch {
      setNotice('Не удалось скачать файл. Откройте оригинал и сохраните его средствами браузера.');
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Modal title={current.name} onClose={onClose} wide>
      {collection.length > 1 && (
        <div className="preview-navigation">
          <button
            className="button"
            disabled={index <= 0 || downloading}
            onClick={() => move(-1)}
            aria-label="Предыдущий файл"
          >
            ←
          </button>
          <span>
            {index + 1} / {collection.length}
          </span>
          <button
            className="button"
            disabled={index >= collection.length - 1 || downloading}
            onClick={() => move(1)}
            aria-label="Следующий файл"
          >
            →
          </button>
        </div>
      )}
      {current.type === 'IMAGE' && !!images.length && (
        <label className="setting-field">
          <span>Сравнить с изображением</span>
          <select value={compare} onChange={(e) => setCompare(e.target.value)}>
            <option value="">Без сравнения</option>
            {images.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className={`media-preview ${other ? 'comparison' : ''}`}>
        {other && (
          <figure>
            <Media file={other} />
            <figcaption>{other.name}</figcaption>
          </figure>
        )}
        <figure>
          <Media key={current.id} file={current} controls />
          {other && <figcaption>{current.name}</figcaption>}
        </figure>
      </div>
      <div className="modal-actions preview-actions">
        <span className="muted small">{new Date(current.createdDate).toLocaleString('ru-RU')}</span>
        {onAnalyze && current.type === 'IMAGE' && (
          <button className="button" onClick={() => onAnalyze(current)}>
            Подготовить промпт
          </button>
        )}
        {onUse && current.type === 'IMAGE' && (
          <button className="button" onClick={() => onUse(current)}>
            Использовать как референс
          </button>
        )}
        {onAnimate && current.type === 'IMAGE' && (
          <button className="button" onClick={() => onAnimate(current)}>
            Анимировать
          </button>
        )}
        {safeMediaUrl(current.path) && (
          <>
            <button className="button" disabled={downloading} onClick={() => void download()}>
              {downloading ? 'Скачиваем…' : 'Скачать файл'}
            </button>
            <a
              className="button primary"
              href={safeMediaUrl(current.path)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть оригинал <ExternalLink size={16} />
            </a>
          </>
        )}
      </div>
      {notice && <p role="status">{notice}</p>}
    </Modal>
  );
}
