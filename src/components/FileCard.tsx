import type { ReactElement } from 'react';
import { Check, Folder, Link as LinkIcon } from 'lucide-react';
import type { IGnosisFile } from '../lib/types';
import { Media } from './MediaPreview';
import { CardPreview } from './CardPreview';
import { GenerationSummary } from './FileGeneration';

export type IFileCardData = Pick<
  IGnosisFile,
  'id' | 'name' | 'type' | 'mime' | 'createdDate' | 'preview' | 'origin'
> &
  Partial<Pick<IGnosisFile, 'path'>>;

/** Existing library card; shared with the artifact feed. */
export function FileCard({
  file,
  source,
  onOpen,
  disabled = false,
  incompatible = false,
  already = false,
  checked = false,
  selectionMode = false,
}: {
  file: IFileCardData;
  source?: string;
  onOpen: () => void;
  disabled?: boolean;
  incompatible?: boolean;
  already?: boolean;
  checked?: boolean;
  selectionMode?: boolean;
}): ReactElement {
  const folder = file.type === 'DIRECTORY';
  return (
    <button
      type="button"
      className={`library-card${checked ? ' is-selected' : ''}`}
      aria-pressed={selectionMode && !folder ? checked : undefined}
      disabled={disabled || incompatible || already}
      onClick={onOpen}
    >
      <CardPreview
        className="library-media"
        isVideo={file.type === 'VIDEO' || file.mime?.startsWith('video/')}
      >
        {source && <span className="history-source file-source">{source}</span>}
        {selectionMode && !folder && !incompatible && (
          <span className={`file-select-mark${checked ? ' is-selected' : ''}`} aria-hidden="true">
            {checked && <Check size={16} />}
          </span>
        )}
        {folder ? (
          <div className="file-folder-icon">
            <Folder size={44} />
          </div>
        ) : (
          <Media file={file} isPlaybackDisabled={incompatible} />
        )}
      </CardPreview>
      <div>
        <b title={file.name}>{file.name}</b>
        <span>
          {folder ? (
            'Папка'
          ) : file.type === 'LINK' ? (
            <>
              <LinkIcon size={14} /> Ссылка на файл
            </>
          ) : (
            new Date(file.createdDate).toLocaleDateString('ru-RU')
          )}
        </span>
        <GenerationSummary file={file} />
        {already && <span>Уже добавлен</span>}
      </div>
    </button>
  );
}
