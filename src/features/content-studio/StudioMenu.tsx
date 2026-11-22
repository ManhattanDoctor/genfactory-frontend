import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useComposerMenu } from '../../components/useComposerMenu';
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
  fieldId,
  showPreviews = false,
  onSelect,
}: {
  label: string;
  value?: string;
  ariaLabel?: string;
  className?: string;
  options: string[];
  fieldId?: string;
  showPreviews?: boolean;
  disabled?: boolean;
  onSelect: (value: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
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
      className={`content-menu ${className === 'cw-shoot-row' ? 'content-shoot-menu' : 'cw-ratio-pick'}`}
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
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
        aria-haspopup="listbox"
        data-tooltip={value || label}
        onClick={() => {
          setOpen(!open);
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
        <div className={fieldId ? 'cw-shoot-list' : 'cw-model-menu'} role="listbox" aria-label={label}>
          {options.map((option) => (
            <div key={option}>
              <button
                type="button"
                role="option"
                aria-selected={(value || label) === option}
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
                    <strong>{option}</strong>
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
