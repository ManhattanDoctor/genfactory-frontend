import { HistoryCardBody } from './HistoryCardBody';
import type { ReactElement } from 'react';
import { Check, Folder, Link as LinkIcon } from 'lucide-react';
import type { IGnosisFile } from '../lib/types';
import { Media } from './MediaPreview';
import { CardPreview } from './CardPreview';
import { GenerationSummary } from './FileGeneration';

export type IFileCardData = Pick<
  IGnosisFile,
  'id' | 'name' | 'type' | 'mime' | 'createdDate' | 'preview' | 'origin' | 'groupId'
> &
  Partial<Pick<IGnosisFile, 'path'>>;

const typeLabels: Record<string, string> = {
  IMAGE: 'Изображение',
  VIDEO: 'Видео',
  AUDIO: 'Аудио',
  DOCUMENT: 'Документ',
  DIRECTORY: 'Папка',
  LINK: 'Ссылка на файл',
};

/** Existing library card; shared with the artifact feed. */
export function FileCard({
  file,
  source,
  compact = false,
  onOpen,
  disabled = false,
  incompatible = false,
  already = false,
  checked = false,
  selectionMode = false,
}: {
  file: IFileCardData;
  source?: string;
  compact?: boolean;
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
      {compact ? (
        <HistoryCardBody
          title={file.name}
          source={source}
          metadata={
            <>
              {already && 'Уже добавлен · '}
              {file.groupId != null && 'Групповой · '}
              {file.origin?.generation ? <GenerationSummary file={file} /> : typeLabels[file.type] || 'Файл'}
            </>
          }
          date={
            <time dateTime={file.createdDate}>{new Date(file.createdDate).toLocaleDateString('ru-RU')}</time>
          }
        />
      ) : (
        <div>
          {file.groupId != null ? (
            <div className="file-group-title">
              <b title={file.name}>{file.name}</b>
              <span className="compact-tag">Групповой</span>
            </div>
          ) : (
            <b title={file.name}>{file.name}</b>
          )}
          {source && <span className="history-source">{source}</span>}
          <GenerationSummary file={file} />
          {!file.origin?.generation && (
            <span>
              {file.type === 'LINK' ? (
                <>
                  <LinkIcon size={14} /> Ссылка на файл
                </>
              ) : (
                typeLabels[file.type] || 'Файл'
              )}
            </span>
          )}
          {already && <span>Уже добавлен</span>}
          <span>
            <time dateTime={file.createdDate}>{new Date(file.createdDate).toLocaleDateString('ru-RU')}</time>
          </span>
        </div>
      )}
    </button>
  );
}
