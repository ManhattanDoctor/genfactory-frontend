import { ComposerAttachmentRow } from './ComposerAttachment';
import { ComposerTemplateFields } from '../features/content-studio/ComposerTemplateFields';
import type { ComponentProps, ReactNode } from 'react';
import { RequiredPhotoSlots } from './RequiredPhotoSlots';
import '../features/studio/feed-template.css';

interface Props {
  title: string;
  disabled: boolean;
  photoDisabled: boolean;
  photoCount: number;
  missingPhotos: number;
  video: boolean;
  onReset: () => void;
  onAdd: () => void;
  fields?: Omit<ComponentProps<typeof ComposerTemplateFields>, 'disabled'>;
  children?: ReactNode;
}

export function AppliedTemplate({
  title,
  disabled,
  photoDisabled,
  photoCount,
  missingPhotos,
  video,
  onReset,
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
      </div>
      {fields && fields.recipe.variables.length > 0 && (
        <ComposerTemplateFields {...fields} disabled={disabled} />
      )}
      {(children || missingPhotos > 0) && (
        <ComposerAttachmentRow>
          {children}
          <RequiredPhotoSlots
            tiles
            count={photoCount + missingPhotos}
            filled={photoCount}
            disabled={photoDisabled}
            onAdd={onAdd}
          />
        </ComposerAttachmentRow>
      )}
      {video && missingPhotos > 0 && <p className="video-template-hint">Не хватает фото: {missingPhotos}.</p>}
    </>
  );
}
