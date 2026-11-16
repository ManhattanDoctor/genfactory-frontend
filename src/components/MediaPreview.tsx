import { FilePreviewRetry } from './FilePreviewRetry';
import { FileActions } from './FileActions';
import './media-loading.css';
import { Skeleton } from './Skeleton';
import { readFileText } from '../lib/files';
import type { ReactElement } from 'react';
import { FilePlaceholder } from './FilePlaceholder';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, safeMediaUrl } from '../lib/api';
import { useQuery } from '@tanstack/react-query';
import type { IGnosisFile } from '../lib/types';
import { Modal } from './Modal';
import { mediaUrlIdentity } from '../lib/mediaIdentity';
export type MediaFile = Pick<IGnosisFile, 'name' | 'type' | 'mime' | 'preview'> &
  Partial<Pick<IGnosisFile, 'path'>> & { isExternal?: boolean };
export type PreviewFile = MediaFile & Partial<IGnosisFile>;
interface MediaProps {
  file: MediaFile;
  controls?: boolean;
  isPlaybackDisabled?: boolean;
  className?: string;
  frameClassName?: string;
  showLoadingState?: boolean;
  autoPlay?: boolean;
  onReady?: () => void;
}
export function Media(props: MediaProps): ReactElement {
  const identity = JSON.stringify({
    type: props.file.type,
    mime: props.file.mime,
    path: mediaUrlIdentity(props.file.path),
    image: props.file.preview?.image && {
      ...props.file.preview.image,
      url: mediaUrlIdentity(props.file.preview.image.url),
    },
    video: props.file.preview?.video && {
      ...props.file.preview.video,
      url: mediaUrlIdentity(props.file.preview.video.url),
    },
  });
  const [readyFor, setReadyFor] = useState('');
  const [failedFor, setFailedFor] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(false);
  const [seen, setSeen] = useState(false);
  const frame = useRef<HTMLSpanElement>(null);
  const loading = readyFor !== identity;
  const externalPlaceholder =
    !props.controls &&
    props.file.isExternal &&
    (((!props.file.preview?.image?.url || props.file.preview.image.status !== 'READY') &&
      (!props.file.preview?.video?.url || props.file.preview.video.status !== 'READY')) ||
      failedFor === identity);
  const tracked =
    !externalPlaceholder &&
    (props.showLoadingState ?? !props.controls) &&
    (props.file.type === 'IMAGE' || props.file.type === 'VIDEO');
  useEffect(() => {
    if (!tracked || !frame.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) setSeen(true);
      },
      { rootMargin: '200px' },
    );
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [tracked]);
  useEffect(() => {
    if (!tracked || !visible || !loading) return;
    const timer = setTimeout(() => setFailedFor(identity), 30000);
    return () => clearTimeout(timer);
  }, [tracked, visible, loading, identity, attempt]);
  if (externalPlaceholder) return <FilePlaceholder file={props.file} className={props.className} />;
  if (!tracked) return <MediaContent {...props} />;
  const retry = (): void => {
    setFailedFor('');
    setAttempt((value) => value + 1);
  };
  return (
    <span
      ref={frame}
      className={`media-loading-frame ${props.frameClassName || ''}`}
      data-media-type={props.file.type}
      aria-busy={loading && failedFor !== identity}
      style={{
        aspectRatio: `var(--media-loading-ratio, ${
          props.file.preview?.image?.width && props.file.preview.image.height
            ? `${props.file.preview.image.width} / ${props.file.preview.image.height}`
            : loading
              ? '4 / 3'
              : 'auto'
        })`,
      }}
    >
      {seen && (
        <MediaContent
          key={`${identity}:${attempt}`}
          {...props}
          isPlaybackDisabled={props.isPlaybackDisabled || !visible}
          onUnavailable={() => {
            setReadyFor((current) => (current === identity ? '' : current));
            setFailedFor(identity);
          }}
          onReady={() => {
            setReadyFor(identity);
            props.onReady?.();
          }}
        />
      )}
      {loading &&
        (failedFor === identity ? (
          <span className="media-loading-error" role="status">
            Не удалось загрузить
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                retry();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  retry();
                }
              }}
            >
              Повторить
            </span>
          </span>
        ) : (
          <Skeleton className="media-loading-skeleton" />
        ))}
    </span>
  );
}
function useMediaUrl(value: string | undefined, failedSources: string[]): string | undefined {
  const identity = mediaUrlIdentity(value);
  const [current, setCurrent] = useState({ identity, value });
  // Keep the mounted source while only its signature changes. If it fails,
  // use the latest credentials before falling back to another media source.
  if (
    current.identity !== identity ||
    (current.value && failedSources.includes(current.value) && current.value !== value)
  ) {
    const next = { identity, value };
    setCurrent(next);
    return value;
  }
  return current.value;
}

function MediaContent({
  file,
  controls = false,
  isPlaybackDisabled = false,
  className,
  autoPlay,
  onReady,
  onUnavailable,
}: MediaProps & { onUnavailable?: () => void }): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playingSource, setPlayingSource] = useState('');
  const [previewActive, setPreviewActive] = useState(false);
  useEffect(() => {
    if (isPlaybackDisabled) videoRef.current?.pause();
  }, [isPlaybackDisabled]);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const original = useMediaUrl(
    controls || !file.isExternal ? safeMediaUrl(file.path) : undefined,
    failedSources,
  );
  const failSource = (source: string): void => {
    setFailedSources((items) => (items.includes(source) ? items : [...items, source]));
  };
  const isVideo = file.type === 'VIDEO' || file.mime?.startsWith('video/');
  const poster = useMediaUrl(
    file.preview?.image?.status === 'READY' ? safeMediaUrl(file.preview.image.url) : undefined,
    failedSources,
  );
  const clip = useMediaUrl(
    file.preview?.video?.status === 'READY' ? safeMediaUrl(file.preview.video.url) : undefined,
    failedSources,
  );
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
    if (placeholder) {
      if (onUnavailable) onUnavailable();
      else onReady?.();
    }
  }, [placeholder, onReady, onUnavailable]);
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
  const video = isVideo ? (
    <video
      ref={videoRef}
      className={className}
      src={src}
      poster={poster}
      onError={() => failSource(src)}
      controls={controls}
      autoPlay={autoPlay ?? (!isPlaybackDisabled && (controls || (previewActive && !!poster)))}
      muted={!controls}
      preload={isPlaybackDisabled ? 'none' : 'metadata'}
      playsInline
      loop={!controls}
      onMouseEnter={(event) => {
        if (!controls && !isPlaybackDisabled && clip)
          void event.currentTarget.play().catch(() => setPlayingSource(''));
      }}
      onMouseLeave={(event) => {
        if (!controls) event.currentTarget.pause();
      }}
      onPlaying={() => setPlayingSource(src)}
      onWaiting={() => setPlayingSource('')}
      onPause={() => setPlayingSource('')}
      onLoadedData={onReady}
      onLoadedMetadata={(event) => {
        if (controls) onReady?.();
        const video = event.currentTarget;
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
  if (!isVideo || controls || !poster || failedSources.includes(poster)) return video;
  return (
    <span
      className="media-video-preview"
      onMouseEnter={() => setPreviewActive(true)}
      onMouseLeave={() => {
        setPreviewActive(false);
        setPlayingSource('');
      }}
    >
      <img
        className={`media-video-poster ${playingSource === src && previewActive && !isPlaybackDisabled ? 'is-playing' : ''}`}
        src={poster}
        alt={file.name}
        onLoad={onReady}
        onError={() => failSource(poster)}
      />
      {previewActive && !isPlaybackDisabled && video}
    </span>
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
  const [current, setCurrent] = useState(file);
  const mediaKey = `${current.id ?? ''}:${mediaUrlIdentity(current.path)}`;
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
    queryFn: ({ signal }) => readFileText(saved!, signal),
  });
  const mediaPreview = detail.data?.preview || current.preview;
  const statuses = [mediaPreview?.image, mediaPreview?.video].filter(Boolean);
  const pendingPreview = statuses.some(
    (media) => media?.status === 'PENDING' || media?.status === 'PROCESSING',
  );
  const failedPreview = statuses.some((media) => media?.status === 'FAILED');
  const collection = [
    ...new Map(
      [...files, file].filter((f) => f.userId === file.userId).map((f) => [f.id ?? f.path, f]),
    ).values(),
  ];
  const index = collection.findIndex((f) => (f.id ?? f.path) === (current.id ?? current.path));
  const move = (delta: number): void => {
    const next = collection[index + delta];
    if (next) {
      setCurrent(next);
      setNotice('');
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,video,audio,.preview-menu')) return;
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
  }, [current.id, files]);
  return (
    <Modal
      title={detail.data?.name || current.name}
      className="file-preview-dialog"
      onClose={onClose}
      wide
      headerActions={
        <FileActions
          key={`${current.id}:${current.path}`}
          file={detail.data || current}
          variant="preview-menu"
          onDeleted={onClose}
          onNavigate={onClose}
          onOpenFile={setCurrent}
          onNotice={setNotice}
          onUse={onUse}
          onAnalyze={onAnalyze}
          onAnimate={onAnimate}
        />
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
          {saved && failedPreview && !pendingPreview && (
            <FilePreviewRetry key={saved.id} file={detail.data || saved} onNotice={setNotice} />
          )}
        </div>
      )}
      {current.origin?.directoryFallback && (
        <p role="status">Папка результатов стала недоступна. Файл сохранён в корне библиотеки.</p>
      )}
      {notice && <p role="status">{notice}</p>}
    </Modal>
  );
}
