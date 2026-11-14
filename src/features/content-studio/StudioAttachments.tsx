import type { ReactElement } from 'react';
import { ComposerAttachment } from '../../components/ComposerAttachment';
import type { ITemplateCard } from './materials';
import type { IAttachment } from './studioTypes';

interface Props {
  picked: ITemplateCard[];
  attachments: IAttachment[];
  attachmentBusy: boolean;
  onRemoveTemplate: (id: string) => void;
  onRemoveAttachment: (file: IAttachment) => void;
}
export function StudioAttachments({
  picked,
  attachments,
  attachmentBusy,
  onRemoveTemplate,
  onRemoveAttachment,
}: Props): ReactElement | false {
  return (
    (picked.length > 0 || attachments.length > 0) && (
      <div className="cw-files">
        {picked.map((item) => (
          <ComposerAttachment
            key={item.id}
            file={{
              name: item.title,
              path: item.src,
              type: item.kind === 'video' ? 'VIDEO' : 'IMAGE',
              mime: item.kind === 'video' ? 'video/mp4' : 'image/jpeg',
            }}
            caption={`Шаблон: ${item.title}`}
            disabled={attachmentBusy}
            onRemove={() => onRemoveTemplate(item.id)}
          />
        ))}
        {attachments.map((file) => (
          <ComposerAttachment
            key={file.id + file.slot}
            file={
              file.saved || {
                name: file.name,
                path: file.url,
                type: file.type.startsWith('video/')
                  ? 'VIDEO'
                  : file.type.startsWith('image/')
                    ? 'IMAGE'
                    : 'DOCUMENT',
                mime: file.type,
              }
            }
            caption={`${file.slot ? `${file.slot === 'start' ? 'Начальный' : 'Конечный'} кадр: ` : ''}${file.name}${file.isUnavailable ? ' · Недоступен' : ''}`}
            unavailable={file.isUnavailable}
            disabled={attachmentBusy}
            onRemove={() => onRemoveAttachment(file)}
          />
        ))}
      </div>
    )
  );
}
