import { downloadFile } from '../lib/files';
import type { ReactElement } from 'react';
import { GenerationDetails } from './FileGeneration';
import { FilePlaceholder } from './FilePlaceholder';
import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, MoreHorizontal } from 'lucide-react';
import { api, safeMediaUrl } from '../lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { IGnosisFile } from '../lib/types';
import { Modal } from './Modal';
export type MediaFile = Pick<IGnosisFile, 'name' | 'type' | 'mime' | 'preview'> &
  Partial<Pick<IGnosisFile, 'path'>>;
export type PreviewFile = MediaFile & Partial<IGnosisFile>;
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
}): ReactElement {
  const original = safeMediaUrl(file.path);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const failSource = (source: string): void => {
    setFailedSources((items) => (items.includes(source) ? items : [...items, source]));
  };
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
  const placeholder =
    !isImage && !isVideo && (!controls || !isAudio)
      ? controls || !poster || failedSources.includes(poster)
      : !src;
  useEffect(() => {
    if (placeholder) onReady?.();
  }, [placeholder, onReady]);
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
  autoPlay,
}: {
  file: PreviewFile;
  files?: IGnosisFile[];
  autoPlay?: boolean;
  onClose: () => void;
  onUse?: (file: IGnosisFile) => void;
  onAnalyze?: (file: IGnosisFile) => void;
  onAnimate?: (file: IGnosisFile) => void;
}): ReactElement {
  const navigate = useNavigate();
  const menu = useRef<HTMLDetailsElement>(null);
  const closeMenu = (): void => {
    if (menu.current) menu.current.open = false;
  };
  useEffect(() => {
    const outside = (event: PointerEvent): void => {
      if (!menu.current?.contains(event.target as Node)) closeMenu();
    };
    const escape = (event: KeyboardEvent): void => {
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
  const [generationOpen, setGenerationOpen] = useState(false);
  const mediaKey = `${current.id ?? ''}:${current.path ?? ''}`;
  const [readyMedia, setReadyMedia] = useState<string>();
  const mediaReady = useCallback((): void => setReadyMedia(mediaKey), [mediaKey]);
  const saved =
    typeof current.id === 'number' &&
    typeof current.userId === 'number' &&
    typeof current.uid === 'string' &&
    typeof current.createdDate === 'string'
      ? (current as IGnosisFile)
      : undefined;
  const [notice, setNotice] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [creatingPreview, setCreatingPreview] = useState(false);
  const client = useQueryClient();
  const detail = useQuery({
    queryKey: ['file-preview', file.userId, current.id],
    enabled: !!saved,
    queryFn: () => api.file(saved!.id),
  });
  const mime = current.mime?.split(';')[0].trim().toLowerCase();
  const isMarkdown = mime === 'text/markdown';
  const isText = mime === 'text/plain' || isMarkdown;
  const textFile = useQuery({
    queryKey: ['file-text', current.userId, current.id],
    enabled: isText && !!saved,
    retry: false,
    staleTime: 300000,
    queryFn: async ({ signal }) => {
      if (!isMarkdown) return (await api.fileText(saved!.id, signal)).text;
      const limit = 2 * 1024 * 1024;
      if ((current.size ?? 0) > limit) throw new Error('Текст больше 2 МБ. Скачайте оригинал файла.');
      const blob = await api.downloadFile(saved!.id);
      if (blob.size > limit) throw new Error('Текст больше 2 МБ. Скачайте оригинал файла.');
      return blob.text();
    },
  });
  const mediaPreview = detail.data?.preview || current.preview;
  const statuses = [mediaPreview?.image, mediaPreview?.video].filter(Boolean);
  const pendingPreview = statuses.some(
    (media) => media?.status === 'PENDING' || media?.status === 'PROCESSING',
  );
  const failedPreview = statuses.some((media) => media?.status === 'FAILED');
  const createPreview = async (): Promise<void> => {
    if (!saved) return;
    setCreatingPreview(true);
    setNotice('');
    try {
      const preview = await api.createPreview(saved!.id);
      client.setQueryData(['file-preview', file.userId, current.id], { ...current, preview });
      await client.invalidateQueries({ queryKey: ['files'] });
    } catch {
      setNotice('Не удалось запустить создание превью. Попробуйте ещё раз.');
    } finally {
      setCreatingPreview(false);
    }
  };
  const collection = [
    ...new Map(
      [...files, file].filter((f) => f.userId === file.userId).map((f) => [f.id ?? f.path, f]),
    ).values(),
  ];
  const index = collection.findIndex((f) => (f.id ?? f.path) === (current.id ?? current.path));
  const move = (delta: number): void => {
    const next = collection[index + delta];
    if (next) {
      closeMenu();
      setCurrent(next);
      setGenerationOpen(false);
      setNotice('');
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
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
  const download = async (): Promise<void> => {
    const url = safeMediaUrl(current.path);
    if (!url) return;
    if (!saved) {
      const link = document.createElement('a');
      link.href = url;
      link.download = current.name;
      link.click();
      return;
    }
    setDownloading(true);
    setNotice('');
    try {
      await downloadFile(saved);
    } catch {
      setNotice('Не удалось скачать файл. Откройте оригинал и сохраните его средствами браузера.');
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Modal
      title={current.name}
      className="file-preview-dialog"
      onClose={onClose}
      wide
      headerActions={
        <>
          <details className="preview-menu" ref={menu}>
            <summary className="icon-button" aria-label="Действия с файлом">
              <MoreHorizontal size={20} />
            </summary>
            <div className="preview-menu-panel" aria-label="Действия с текущим файлом">
              {saved?.origin?.generation && (
                <button
                  type="button"
                  className="preview-menu-item"
                  onClick={() => {
                    closeMenu();
                    setGenerationOpen(true);
                    menu.current?.querySelector('summary')?.focus();
                  }}
                >
                  Параметры генерации
                </button>
              )}
              {isText && textFile.data !== undefined && (
                <>
                  <button
                    type="button"
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
                    type="button"
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
                    type="button"
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

              {saved && ['AUDIO', 'VIDEO'].includes(current.type) && (
                <button
                  type="button"
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
              {saved && onAnalyze && current.type === 'IMAGE' && (
                <button
                  type="button"
                  className="preview-menu-item"
                  onClick={() => {
                    closeMenu();
                    onAnalyze(saved!);
                  }}
                >
                  Подготовить промпт
                </button>
              )}
              {saved && onUse && current.type === 'IMAGE' && (
                <button
                  type="button"
                  className="preview-menu-item"
                  onClick={() => {
                    closeMenu();
                    onUse(saved!);
                  }}
                >
                  Использовать как референс
                </button>
              )}
              {saved && onAnimate && current.type === 'IMAGE' && (
                <button
                  type="button"
                  className="preview-menu-item"
                  onClick={() => {
                    closeMenu();
                    onAnimate(saved!);
                  }}
                >
                  Анимировать
                </button>
              )}
              {safeMediaUrl(current.path) && (
                <>
                  <button
                    type="button"
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

              {saved &&
                (current.type === 'IMAGE' || current.type === 'VIDEO') &&
                (!statuses.length || failedPreview) &&
                !pendingPreview && (
                  <button
                    type="button"
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
        </>
      }
    >
      <div
        className="media-preview"
        aria-busy={isText && saved ? textFile.isPending : readyMedia !== mediaKey}
      >
        {!(isText && saved) && readyMedia !== mediaKey && (
          <div className="media-preview-loader" role="status" aria-label="Загрузка файла">
            <span className="spinner" aria-hidden="true" />
          </div>
        )}
        {isText && saved ? (
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
          <Media
            key={mediaKey}
            file={{ ...current, preview: mediaPreview }}
            controls
            onReady={mediaReady}
            autoPlay={autoPlay}
          />
        )}
      </div>
      {(current.type === 'IMAGE' || current.type === 'VIDEO') && (pendingPreview || failedPreview) && (
        <div className="preview-status">
          <span className="muted small" role="status">
            {pendingPreview ? 'Превью создаётся…' : 'Не удалось создать превью полностью. Оригинал доступен.'}
          </span>
        </div>
      )}
      {generationOpen && saved && (
        <GenerationDetails key={saved.id} file={saved} onClose={() => setGenerationOpen(false)} />
      )}
      {current.origin?.directoryFallback && (
        <p role="status">Папка результатов стала недоступна. Файл сохранён в корне библиотеки.</p>
      )}
      {notice && <p role="status">{notice}</p>}
    </Modal>
  );
}
