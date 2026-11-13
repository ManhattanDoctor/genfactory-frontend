import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Heart } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useComposerMenu } from '../../components/useComposerMenu';
import { ModelTitleWithInfo } from '../catalog/ModelTitleWithInfo';
import { favoritesFirst } from '../catalog/presentation';
import { ModelMark } from './ModelMark';
import type { StudioMode } from './studioTypes';
import fieldIcons from './fieldIcons.json';
import settingPreviews from './settingPreviews.json';

function FieldPreview({
  fieldId,
  value,
  images,
}: {
  fieldId: string;
  value: string;
  images: boolean;
}): ReactElement {
  const src = images
    ? (settingPreviews as Record<string, Record<string, string>>)[fieldId]?.[value]
    : undefined;
  return src ? (
    <img className="cw-ref cw-setting-preview" src={src} alt="" loading="lazy" decoding="async" />
  ) : (
    <i
      className="cw-ref"
      dangerouslySetInnerHTML={{
        __html: (fieldIcons as Record<string, Record<string, string>>)[fieldId]?.[value] || '',
      }}
    />
  );
}

export function StudioMenu({
  disabled = false,
  label,
  value,
  ariaLabel,
  className = 'cw-chip',
  options,
  descriptions,
  titles,
  selection,
  searchTerms,
  favorites,
  onFavorite,
  error,
  modelIcon,
  fieldId,
  showPreviews = false,
  onSelect,
}: {
  label: string;
  value?: string;
  ariaLabel?: string;
  className?: string;
  options: string[];
  descriptions?: string[];
  titles?: string[];
  selection?: string;
  searchTerms?: string[];
  favorites?: string[];
  onFavorite?: (key: string) => void;
  error?: string;
  modelIcon?: StudioMode;
  fieldId?: string;
  showPreviews?: boolean;
  disabled?: boolean;
  onSelect: (value: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [info, setInfo] = useState<number>();
  const visibleOptions = favoritesFirst(
    options
      .map((option, i) => ({ option, i }))
      .sort((a, b) =>
        searchTerms
          ? (titles?.[a.i] || a.option).localeCompare(titles?.[b.i] || b.option, 'ru', { numeric: true })
          : 0,
      ),
    ['Auto', ...(favorites || [])],
    ({ option }) => option,
  ).filter(
    ({ option, i }) =>
      !searchTerms ||
      option === 'Auto' ||
      `${titles?.[i]} ${descriptions?.[i]} ${searchTerms[i]}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const ref = useRef<HTMLDivElement>(null);
  useComposerMenu(open, ref);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div
      className={`content-menu ${className === 'cw-shoot-row' ? 'content-shoot-menu' : className === 'cw-model' ? 'cw-model-pick' : 'cw-ratio-pick'}`}
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && info === undefined) {
          setOpen(false);
          ref.current?.querySelector('button')?.focus();
        }
      }}
    >
      <button
        className={className}
        disabled={disabled}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup={searchTerms ? 'dialog' : 'listbox'}
        title={value || label}
        onClick={() => {
          setOpen(!open);
          setSearch('');
        }}
      >
        {value ? (
          <>
            <span>{label}</span>
            <span className="cw-picked">
              {fieldId && <FieldPreview fieldId={fieldId} value={value} images={showPreviews} />}
              <b>{value}</b>
            </span>
          </>
        ) : (
          <span className="content-control-label">{label}</span>
        )}
      </button>
      {open && (
        <div
          className={fieldId ? 'cw-shoot-list' : `cw-model-menu${modelIcon ? ' content-model-menu' : ''}`}
          role={searchTerms ? 'dialog' : 'listbox'}
          aria-label={label}
        >
          {searchTerms && (
            <>
              <input
                className="cw-model-search"
                type="search"
                aria-label="Поиск модели"
                placeholder="Поиск модели"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </>
          )}
          {visibleOptions.map(({ option, i }) =>
            modelIcon ? (
              <div
                key={option}
                className="content-model-row"
                role="option"
                tabIndex={disabled ? -1 : 0}
                aria-label={titles?.[i] || option}
                aria-selected={(selection || label) === option}
                aria-disabled={disabled}
                onClick={() => {
                  if (!disabled) {
                    onSelect(option);
                    setOpen(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && ['Enter', ' '].includes(e.key)) {
                    e.preventDefault();
                    if (!disabled) {
                      onSelect(option);
                      setOpen(false);
                    }
                  }
                }}
              >
                <ModelMark id={option} />
                <span className="cw-model-copy">
                  <span className="content-model-title">
                    <strong>
                      <ModelTitleWithInfo
                        title={titles?.[i] || option}
                        onInfo={searchTerms && option !== 'Auto' ? () => setInfo(i) : undefined}
                        infoClassName="content-model-about"
                        icon={CircleAlert}
                      />
                    </strong>
                  </span>
                  {descriptions?.[i] && <small>{descriptions[i]}</small>}
                </span>
                {favorites && option !== 'Auto' && (
                  <button
                    type="button"
                    className="content-model-favorite"
                    aria-label={`${favorites.includes(option) ? 'Убрать из избранных' : 'В избранные'}: ${titles?.[i] || option}`}
                    aria-pressed={favorites.includes(option)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFavorite?.(option);
                    }}
                  >
                    <Heart size={16} fill={favorites.includes(option) ? 'currentColor' : 'none'} />
                  </button>
                )}
              </div>
            ) : (
              <div key={option}>
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={(selection || value || label) === option}
                  aria-label={searchTerms ? titles?.[i] || option : undefined}
                  disabled={disabled}
                  className="cw-model-option"
                  onClick={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                >
                  {fieldId ? (
                    <>
                      <FieldPreview fieldId={fieldId} value={option} images={showPreviews} />
                      <span>{option}</span>
                    </>
                  ) : (
                    <span className="cw-model-copy">
                      <strong>{titles?.[i] || option}</strong>
                      {descriptions?.[i] && <small>{descriptions[i]}</small>}
                    </span>
                  )}
                </button>
              </div>
            ),
          )}
          {searchTerms && visibleOptions.every(({ option }) => option === 'Auto') && (
            <p role="status" className="cw-menu-title">
              {'Модели не найдены.'}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          {info !== undefined && (
            <Modal title={titles?.[info] || options[info]} onClose={() => setInfo(undefined)}>
              <p>{descriptions?.[info]}</p>
              <p className="small muted">{searchTerms?.[info]}</p>
            </Modal>
          )}
        </div>
      )}
    </div>
  );
}
