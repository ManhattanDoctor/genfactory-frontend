import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ModelDigest } from '../../components/ModelDigest';
import home from '../../app/home/content.json';
import videoDigests from './videoDigests.json';
import { Modal } from '../../components/Modal';
import type { IModelDescription } from '../../lib/types';
import { ModelPickerList } from './ModelPickerList';
import { imageModelGuide } from './imageModelGuide';
import { favoritesFirst, modelKey, modelSummary, modelTitle } from './presentation';

const videoModelTags: Record<string, string> = {
  'runway/gen-4.5': 'Без звука',
  'x-ai/grok-imagine-video-1.5-lite': 'Черновик',
  'bytedance/seedance-2.5': 'Кампания',
  'google/veo-3.1': 'Кино',
  'alibaba/wan-3.0': 'Видеореференс',
};

function guide(model: IModelDescription, kind: string) {
  if (kind === 'image') return imageModelGuide(model);
  const use = modelSummary(model);
  const fields = model.schema.properties?.options?.properties;
  const frames = fields?.frameImages?.maxItems || 0;
  const references = fields?.inputReferences?.maxItems || 0;
  const tags = [];
  if (frames || references) tags.push('Из фото');
  const tag = videoModelTags[model.reference.model];
  if (tag) tags.push(tag);
  const sound = fields?.generateAudio;
  if (sound?.enum?.includes(true)) tags.push('Со звуком');
  if (fields?.aspectRatio?.enum?.includes('9:16')) tags.push('9:16');
  return {
    use,
    summary: use.length <= 80 ? use : use.slice(0, 79).replace(/\s+\S*$/, '') + '…',
    tags: tags.slice(0, 2),
    avoid:
      frames || references
        ? 'Для задач, где нужно больше исходных кадров, чем поддерживает модель.'
        : 'Для задач, где нужен исходный кадр.',
    start: references
      ? `Опишите движение и приложите до ${references} референсов.`
      : frames
        ? `Опишите движение. Можно добавить ${frames === 1 ? 'стартовый кадр' : 'начальный и конечный кадры'}.`
        : 'Опишите сцену, действие и движение камеры.',
  };
}

export function MediaModelPicker({
  models,
  kind,
  selected,
  label,
  name,
  disabled,
  mobile,
  studio,
  composer,
  favorites,
  onFavorite,
  error,
  onSelect,
}: {
  models: IModelDescription[];
  kind: string;
  selected?: string;
  label: string;
  name: string;
  disabled?: boolean;
  mobile: boolean;
  studio?: boolean;
  composer?: boolean;
  favorites?: string[];
  onFavorite?: (key: string) => void;
  error?: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<IModelDescription>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const swipe = useRef<number | undefined>(undefined);
  const close = () => {
    setOpen(false);
    setInfo(undefined);
    trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open || mobile || info) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, mobile, info]);
  const detail = info && guide(info, kind);
  const digest =
    info &&
    (kind === 'image'
      ? home.digests.find((d) => d.model === info.reference.model)
      : videoDigests.find(
          (d) =>
            d.title.toLowerCase() === modelTitle(info).toLowerCase() ||
            info.reference.model.endsWith('/' + d.id),
        ));
  const content = open && (
    <>
      <ModelPickerList
        items={favoritesFirst(
          models
            .map((m) => ({ id: modelKey(m), title: modelTitle(m), ...guide(m, kind) }))
            .sort((a, b) => a.title.localeCompare(b.title, 'ru', { numeric: true })),
          favorites ?? [],
          (item) => item.id,
        )}
        onClose={composer ? close : undefined}
        selected={selected}
        favorites={favorites}
        onFavorite={onFavorite}
        onInfo={(id) => setInfo(models.find((m) => modelKey(m) === id))}
        onSelect={(id) => {
          onSelect(id);
          close();
        }}
      />
      {error && <p role="alert">{error}</p>}
      {info && digest && (
        <ModelDigest detail={digest} onClose={() => setInfo(undefined)}>
          <button
            type="button"
            className="gf-btn-primary"
            onClick={() => {
              onSelect(modelKey(info));
              close();
            }}
          >
            Выбрать эту модель
          </button>
        </ModelDigest>
      )}
      {info && detail && !digest && (
        <Modal title={`О модели ${modelTitle(info)}`} onClose={() => setInfo(undefined)}>
          <p>
            <strong>Когда брать</strong>
            <br />
            {detail.use}
          </p>
          <p>
            <strong>Когда не брать</strong>
            <br />
            {detail.avoid}
          </p>
          <p>
            <strong>Как стартовать</strong>
            <br />
            {detail.start}
          </p>
        </Modal>
      )}
    </>
  );
  return (
    <div
      ref={root}
      className={studio ? 'content-menu cw-model-pick' : 'image-menu image-model-menu'}
      onKeyDown={(e) => {
        if (info) return;
        if (e.key === 'Escape' && open && !mobile) {
          e.stopPropagation();
          close();
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          setOpen(true);
          requestAnimationFrame(() => {
            const rows = Array.from(
              root.current?.querySelectorAll<HTMLButtonElement>('.gf-model-choice') || [],
            );
            const index = rows.indexOf(document.activeElement as HTMLButtonElement);
            rows[
              index < 0
                ? e.key === 'ArrowDown'
                  ? 0
                  : rows.length - 1
                : (index + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
            ]?.focus();
          });
        }
      }}
    >
      <button
        ref={trigger}
        className={studio ? 'cw-model' : 'cw-chip'}
        type="button"
        aria-label={name}
        data-tooltip={label}
        aria-haspopup={mobile ? 'dialog' : 'listbox'}
        aria-expanded={open}
        disabled={disabled}
        onClick={(e) => {
          e.currentTarget.focus({ preventScroll: true });
          setOpen(!open);
        }}
      >
        <span className="content-control-label gf-model-trigger-name">{label}</span>
        {!studio && !composer && <ChevronDown size={12} />}
      </button>
      {open &&
        (mobile ? (
          <Modal title="Выбор модели" className="studio-mobile-sheet studio-model-sheet" onClose={close}>
            <div
              className="studio-model-grip"
              aria-hidden="true"
              onPointerDown={(e) => {
                swipe.current = e.clientY;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerCancel={() => {
                swipe.current = undefined;
              }}
              onPointerUp={(e) => {
                if (swipe.current !== undefined && e.clientY - swipe.current >= 48) close();
                swipe.current = undefined;
              }}
            />
            <div className="studio-model-scroll">{content}</div>
          </Modal>
        ) : (
          <div
            className="cw-model-menu content-model-menu media-model-popup"
            role="listbox"
            aria-label={name}
          >
            {content}
          </div>
        ))}
    </div>
  );
}
