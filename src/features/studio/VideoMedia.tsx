import type { ReactElement, ReactPortal } from 'react';
import { FilePlaceholder } from '../../components/FilePlaceholder';
import { modelTitle, modelSummary } from '../catalog/presentation';
import { ModelMark } from '../content-studio/ModelMark';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ITemplate } from '../content-studio/materials';
import type { IGnosisFile } from '../../lib/types';
import { safeMediaUrl } from '../../lib/api';
import './video-workspace.css';

/** Load the short designer preview only while the card is visible. */
export function VideoTemplateMedia({ item }: { item: ITemplate }): ReactElement {
  const root = useRef<HTMLSpanElement>(null);
  const clip = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const update = () => {
      const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
        ?.saveData;
      setPlaying(visible && !document.hidden && !motion.matches && !saveData);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.intersectionRatio >= 0.15;
        update();
      },
      { threshold: [0, 0.15] },
    );
    if (root.current) observer.observe(root.current);
    document.addEventListener('visibilitychange', update);
    motion.addEventListener('change', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      motion.removeEventListener('change', update);
    };
  }, []);
  useEffect(() => {
    if (!playing) setReady(false);
  }, [playing]);
  useEffect(() => {
    if (playing && clip.current) void clip.current.play().catch(() => setReady(false));
  }, [playing]);
  const name = item.src.split('/').at(-1);
  return (
    <span ref={root} className="video-template-media">
      <img className="img-face" src={item.src.replace(/\.mp4$/, '.jpg')} alt="" loading="lazy" />
      {playing && (
        <video
          ref={clip}
          className={`img-face ${ready ? 'is-ready' : ''}`}
          src={`/media/prototype/content/video/previews/${name}`}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          onCanPlay={(event) => {
            void event.currentTarget.play().catch(() => setReady(false));
          }}
          onPlaying={() => setReady(true)}
          onError={() => setReady(false)}
        />
      )}
    </span>
  );
}

/** The designer opens the original in a dark video sheet, outside the gallery. */
export function VideoViewer({ file, onClose }: { file: IGnosisFile; onClose: () => void }): ReactPortal {
  const dialog = useRef<HTMLDialogElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    const video = player.current;
    element?.showModal();
    return () => {
      video?.pause();
      element?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="video-viewer"
      aria-label={file.name}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="video-viewer-card">
        {error ? (
          <FilePlaceholder file={file} />
        ) : (
          <video
            ref={player}
            src={safeMediaUrl(file.path)}
            poster={
              file.preview?.image?.status === 'READY' ? safeMediaUrl(file.preview.image.url) : undefined
            }
            controls
            autoPlay
            playsInline
            onError={() => setError(true)}
          />
        )}
        {error && <p role="alert">Видео не открылось.</p>}
      </div>
    </dialog>,
    document.body,
  );
}

export function VideoModelInfo({
  model,
  onClose,
  kind = 'video',
}: {
  kind?: import('../../lib/types').MediaKind;
  model: import('../../lib/types').IModelDescription;
  onClose: () => void;
}): ReactPortal {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.showModal();
    return () => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="video-viewer video-model-info"
      aria-label={`О модели ${modelTitle(model)}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="video-viewer-card">
        <header>
          <ModelMark id={model.reference.model} />
          <h2>{modelTitle(model)}</h2>
          <button type="button" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </header>
        <p>{modelSummary(model)}</p>
        {kind === 'video' && (
          <p>
            {model.schema.properties?.options?.properties?.inputReferences
              ? `Видео по тексту и референсам: до ${model.schema.properties.options.properties.inputReferences.maxItems} изображений. Начальный и конечный кадры задаются отдельно в Студии контента.`
              : `Видео по тексту и ${model.schema.properties?.options?.properties?.frameImages?.maxItems === 2 ? 'начальному и конечному кадрам' : 'одному стартовому кадру'}.`}
          </p>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
