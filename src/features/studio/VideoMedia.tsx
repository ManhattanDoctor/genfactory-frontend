import type { ReactElement } from 'react';
import { modelTitle, modelSummary } from '../catalog/presentation';
import { Modal } from '../../components/Modal';
import { useEffect, useRef, useState } from 'react';
import type { ITemplate } from '../content-studio/materials';
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

export function VideoModelInfo({
  model,
  onClose,
  kind = 'video',
}: {
  kind?: import('../../lib/types').MediaKind;
  model: import('../../lib/types').IModelDescription;
  onClose: () => void;
}): ReactElement {
  return (
    <Modal title={`О модели ${modelTitle(model)}`} onClose={onClose}>
      <p>{modelSummary(model)}</p>
      {kind === 'video' && (
        <p>
          {model.schema.properties?.options?.properties?.inputReferences
            ? `Видео по тексту и референсам: до ${model.schema.properties.options.properties.inputReferences.maxItems} изображений. Начальный и конечный кадры задаются отдельно в Студии контента.`
            : `Видео по тексту и ${model.schema.properties?.options?.properties?.frameImages?.maxItems === 2 ? 'начальному и конечному кадрам' : 'одному стартовому кадру'}.`}
        </p>
      )}
    </Modal>
  );
}
