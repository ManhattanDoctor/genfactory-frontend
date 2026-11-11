import { GenerationDetails } from './FileGeneration';
import { FilePlaceholder } from './FilePlaceholder';
import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, MoreHorizontal } from 'lucide-react';
import { api, safeMediaUrl } from '../lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { IGnosisFile } from '../lib/types';
import { Modal } from './Modal';
export type MediaFile = Pick<IGnosisFile, 'name' | 'path' | 'type' | 'mime' | 'preview'>;
export function Media({
  file,
  controls = false,
  isPlaybackDisabled = false,
  className,
  autoPlay,
  onReady,
}: {
  file: MediaFile;
  controls?: boolean;
  isPlaybackDisabled?: boolean;
  className?: string;
  autoPlay?: boolean;
  onReady?: () => void;
}) {
  const original = safeMediaUrl(file.path);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const failSource = (source: string) =>
    setFailedSources((items) => (items.includes(source) ? items : [...items, source]));
  const isVideo = file.type === 'VIDEO' || file.mime?.startsWith('video/');
  const poster = file.preview?.image?.status === 'READY' ? safeMediaUrl(file.preview.image.url) : undefined;
  const clip = file.preview?.video?.status === 'READY' ? safeMediaUrl(file.preview.video.url) : undefined;
  const sources =
    isVideo && isPlaybackDisabled
      ? [poster, original]
      : controls
        ? [original]
        : isVideo
          ? [clip, poster, original]
          : [poster, original];
  const src = sources.find((source) => source && !failedSources.includes(source));
  const isImage = file.type === 'IMAGE' || file.mime?.startsWith('image/');
  const isAudio = file.type === 'AUDIO' || file.mime?.startsWith('audio/');
  if (!isImage && !isVideo) {
    if (!controls || !isAudio) {
      if (!controls && poster && !failedSources.includes(poster))
        return (
          <img
            className={className}
            onLoad={onReady}
            src={poster}
            alt={file.name}
            loading="lazy"
            onError={() => failSource(poster)}
          />
        );
      return <FilePlaceholder file={file} className={className} />;
    }
    if (src && !failedSources.includes(src))
      return (
        <audio
          className={className}
          onLoadedMetadata={onReady}
          src={src}
          controls
          onError={() => failSource(src)}
        />
      );
  }
  if (!src || failedSources.includes(src)) return <FilePlaceholder file={file} className={className} />;
  if (isVideo && !controls && src === poster)
    return (
      <img
        className={className}
        onLoad={onReady}
        src={src}
        alt={file.name}
        loading="lazy"
        onError={() => failSource(src)}
      />
    );
  return isVideo ? (
    <video
      className={className}
      src={src}
      poster={poster}
      onError={() => failSource(src)}
      controls={controls}
      autoPlay={autoPlay ?? (controls && !isPlaybackDisabled)}
      muted={!controls}
      preload="metadata"
      playsInline
      loop={!controls}
      onMouseEnter={(event) => {
        if (!controls && !isPlaybackDisabled && clip) void event.currentTarget.play().catch(() => {});
      }}
      onMouseLeave={(event) => {
        if (!controls) event.currentTarget.pause();
      }}
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        onReady?.();
        if (!controls && video.currentTime === 0 && Number.isFinite(video.duration) && video.duration > 0)
          video.currentTime = Math.min(0.1, video.duration / 2);
      }}
    />
  ) : (
    <img
      className={className}
      onLoad={onReady}
      src={src}
      alt={file.name}
      loading="lazy"
      onError={() => failSource(src)}
    />
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
  file: IGnosisFile;
  files?: IGnosisFile[];
  onClose: () => void;
  onUse?: (file: IGnosisFile) => void;
  onAnalyze?: (file: IGnosisFile) => void;
  onAnimate?: (file: IGnosisFile) => void;
}) {
  const navigate = useNavigate();
  const menu = useRef<HTMLDetailsElement>(null);
  const closeMenu = () => {
    if (menu.current) menu.current.open = false;
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) closeMenu();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        menu.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, []);
  const [current, setCurrent] = useState(file);
  const [notice, setNotice] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [creatingPreview, setCreatingPreview] = useState(false);
  const client = useQueryClient();
  const detail = useQuery({
    queryKey: ['file-preview', file.userId, current.id],
    queryFn: () => api.file(current.id),

    retry: 1,
  });
  const isText = current.mime?.split(';')[0] === 'text/plain';
  const textFile = useQuery({
    queryKey: ['file-text', current.userId, current.id],
    enabled: isText,
    retry: false,
    staleTime: 300000,
    queryFn: async ({ signal }) => (await api.fileText(current.id, signal)).text,
  });
  const mediaPreview = detail.data?.preview || current.preview;
  const statuses = [mediaPreview?.image, mediaPreview?.video].filter(Boolean);
  const pendingPreview = statuses.some(
    (media) => media?.status === 'PENDING' || media?.status === 'PROCESSING',
  );
  const failedPreview = statuses.some((media) => media?.status === 'FAILED');
  const createPreview = async () => {
    setCreatingPreview(true);
    setNotice('');
    try {
      const preview = await api.createPreview(current.id);
      client.setQueryData(['file-preview', file.userId, current.id], { ...current, preview });
      await client.invalidateQueries({ queryKey: ['files'] });
    } catch {
      setNotice('Не удалось запустить создание превью. Попробуйте ещё раз.');
    } finally {
      setCreatingPreview(false);
    }
  };
  const collection = [
    ...new Map([...files, file].filter((f) => f.userId === file.userId).map((f) => [f.id, f])).values(),
  ];
  const index = collection.findIndex((f) => f.id === current.id);
  const move = (delta: number) => {
    const next = collection[index + delta];
    if (next) {
      closeMenu();
      setCurrent(next);
      setNotice('');
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest('input,textarea,select,video,audio,.preview-menu') ||
        downloading
      )
        return;
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
      const blob = await api.downloadFile(current.id);
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
    <Modal
      title={current.name}
      onClose={onClose}
      wide
      headerActions={
        <details className="preview-menu" ref={menu}>
          <summary className="icon-button" aria-label="Действия с файлом">
            <MoreHorizontal size={20} />
          </summary>
          <div className="preview-menu-panel" aria-label="Действия с текущим файлом">
            {isText && textFile.data !== undefined && (
              <>
                <button
                  className="preview-menu-item"
                  onClick={async () => {
                    closeMenu();
                    try {
                      await navigator.clipboard.writeText(textFile.data!);
                      setNotice('Текст скопирован.');
                    } catch {
                      setNotice('Не удалось скопировать. Выделите текст вручную.');
                    }
                  }}
                >
                  Копировать текст
                </button>
                <button
                  className="preview-menu-item"
                  onClick={() => {
                    closeMenu();
                    onClose();
                    navigate('/audio', { state: { prompt: textFile.data, userId: current.userId } });
                  }}
                >
                  Озвучить текст
                </button>
                <button
                  className="preview-menu-item"
                  onClick={() => {
                    closeMenu();
                    onClose();
                    navigate('/prompt', { state: { prompt: textFile.data, userId: current.userId } });
                  }}
                >
                  В описание задачи
                </button>
              </>
            )}

            {['AUDIO', 'VIDEO'].includes(current.type) && (
              <button
                className="preview-menu-item"
                onClick={() => {
                  closeMenu();
                  onClose();
                  navigate('/audio?mode=stt', { state: { reference: current, userId: current.userId } });
                }}
              >
                Расшифровать
              </button>
            )}
            {onAnalyze && current.type === 'IMAGE' && (
              <button
                className="preview-menu-item"
                onClick={() => {
                  closeMenu();
                  onAnalyze(current);
                }}
              >
                Подготовить промпт
              </button>
            )}
            {onUse && current.type === 'IMAGE' && (
              <button
                className="preview-menu-item"
                onClick={() => {
                  closeMenu();
                  onUse(current);
                }}
              >
                Использовать как референс
              </button>
            )}
            {onAnimate && current.type === 'IMAGE' && (
              <button
                className="preview-menu-item"
                onClick={() => {
                  closeMenu();
                  onAnimate(current);
                }}
              >
                Анимировать
              </button>
            )}
            {safeMediaUrl(current.path) && (
              <>
                <button
                  className="preview-menu-item"
                  disabled={downloading}
                  onClick={() => {
                    closeMenu();
                    void download();
                  }}
                >
                  {downloading ? 'Скачиваем…' : 'Скачать файл'}
                </button>
                <a
                  className="preview-menu-item"
                  href={safeMediaUrl(current.path)}
                  onClick={closeMenu}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Открыть оригинал <ExternalLink size={16} />
                </a>
              </>
            )}

            {(current.type === 'IMAGE' || current.type === 'VIDEO') &&
              (!statuses.length || failedPreview) &&
              !pendingPreview && (
                <button
                  className="preview-menu-item"
                  disabled={creatingPreview}
                  onClick={() => {
                    closeMenu();
                    void createPreview();
                  }}
                >
                  {creatingPreview
                    ? 'Запускаем…'
                    : failedPreview
                      ? 'Повторить создание превью'
                      : 'Создать превью'}
                </button>
              )}
          </div>
        </details>
      }
    >
      <div className="preview-navigation">
        {collection.length > 1 && (
          <button
            className="button"
            disabled={index <= 0 || downloading}
            onClick={() => move(-1)}
            aria-label="Предыдущий файл"
          >
            ←
          </button>
        )}
        <time className="muted small preview-date" dateTime={current.createdDate}>
          {new Date(current.createdDate).toLocaleString('ru-RU')}
        </time>
        {collection.length > 1 && (
          <button
            className="button"
            disabled={index >= collection.length - 1 || downloading}
            onClick={() => move(1)}
            aria-label="Следующий файл"
          >
            →
          </button>
        )}
      </div>
      <div className="media-preview">
        {isText ? (
          textFile.isPending ? (
            <p role="status">Загружаем текст…</p>
          ) : textFile.error ? (
            <>
              <FilePlaceholder file={current} />
              <p role="alert">{textFile.error.message}</p>
            </>
          ) : (
            <pre className="file-text-preview">{textFile.data}</pre>
          )
        ) : (
          <Media key={current.id} file={{ ...current, preview: mediaPreview }} controls />
        )}
      </div>
      {(current.type === 'IMAGE' || current.type === 'VIDEO') && (pendingPreview || failedPreview) && (
        <div className="preview-status">
          <span className="muted small" role="status">
            {pendingPreview ? 'Превью создаётся…' : 'Не удалось создать превью полностью. Оригинал доступен.'}
          </span>
        </div>
      )}
      <GenerationDetails key={current.id} file={current} />
      {current.origin?.directoryFallback && (
        <p role="status">Папка результатов стала недоступна. Файл сохранён в корне библиотеки.</p>
      )}
      {notice && <p role="status">{notice}</p>}
    </Modal>
  );
}
