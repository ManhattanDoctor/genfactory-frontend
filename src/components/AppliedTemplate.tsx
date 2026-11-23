import { ComposerTemplateFields } from '../features/content-studio/ComposerTemplateFields';
import type { ComponentProps, ReactNode } from 'react';
import { RequiredPhotoSlots } from './RequiredPhotoSlots';
import '../features/studio/feed-template.css';

interface Props {
  title: string;
  disabled: boolean;
  photoDisabled: boolean;
  photoHintDismissed: boolean;
  photoCount: number;
  missingPhotos: number;
  video: boolean;
  onReset: () => void;
  onDismissPhotoHint: () => void;
  onAdd: () => void;
  fields?: Omit<ComponentProps<typeof ComposerTemplateFields>, 'disabled'>;
  children?: ReactNode;
}

export function AppliedTemplate({
  title,
  disabled,
  photoDisabled,
  photoHintDismissed,
  photoCount,
  missingPhotos,
  video,
  onReset,
  onDismissPhotoHint,
  onAdd,
  fields,
  children,
}: Props) {
  return (
    <>
      <div className="feed-template-chips">
        <span>
          {title}
          <button type="button" disabled={disabled} onClick={onReset} aria-label="Сбросить шаблон">
            ×
          </button>
        </span>
        {missingPhotos > 0 && !photoHintDismissed && (
          <span>
            + Фото
            <button type="button" onClick={onDismissPhotoHint} aria-label="Скрыть метку фото">
              ×
            </button>
          </span>
        )}
      </div>
      {fields && fields.recipe.variables.length > 0 && (
        <ComposerTemplateFields {...fields} disabled={disabled} />
      )}
      {(children || missingPhotos > 0) && (
        <div className="img-files">
          {children}
          <RequiredPhotoSlots
            tiles
            count={photoCount + missingPhotos}
            filled={photoCount}
            disabled={photoDisabled}
            onAdd={onAdd}
          />
        </div>
      )}
      {video && missingPhotos > 0 && <p className="video-template-hint">Для шаблона приложите своё фото</p>}
    </>
  );
}
