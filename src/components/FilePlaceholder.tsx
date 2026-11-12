import type { ReactElement } from 'react';
import {
  AudioLines,
  FileText,
  FileSpreadsheet,
  FileCode2,
  File,
  Image,
  Clapperboard,
  FileArchive,
  Presentation,
} from 'lucide-react';
import type { IGnosisFile } from '../lib/types';

export function FilePlaceholder({
  file,
  className = '',
}: {
  file: Pick<IGnosisFile, 'type' | 'mime' | 'name'>;
  className?: string;
}): ReactElement {
  const audio = file.type === 'AUDIO' || file.mime?.startsWith('audio/');
  const image = file.type === 'IMAGE' || file.mime?.startsWith('image/');
  const video = file.type === 'VIDEO' || file.mime?.startsWith('video/');
  const document = file.type === 'DOCUMENT' || file.mime?.startsWith('text/');
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() : undefined;
  const format =
    extension && /^[A-Z0-9]{1,7}$/.test(extension)
      ? extension
      : audio
        ? 'AUDIO'
        : image
          ? 'IMAGE'
          : video
            ? 'VIDEO'
            : document
              ? 'TEXT'
              : 'FILE';
  const table = ['CSV', 'XLS', 'XLSX', 'ODS'].includes(format);
  const code = ['JSON', 'XML', 'YAML', 'YML'].includes(format);
  const archive = ['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(format);
  const presentation = ['PPT', 'PPTX', 'ODP'].includes(format);
  const Icon = audio
    ? AudioLines
    : image
      ? Image
      : video
        ? Clapperboard
        : archive
          ? FileArchive
          : presentation
            ? Presentation
            : table
              ? FileSpreadsheet
              : code
                ? FileCode2
                : document
                  ? FileText
                  : File;
  const label = audio
    ? 'Аудиозапись'
    : image
      ? 'Изображение'
      : video
        ? 'Видео'
        : archive
          ? 'Архив'
          : presentation
            ? 'Презентация'
            : table
              ? 'Таблица'
              : format === 'PDF'
                ? 'PDF-документ'
                : document
                  ? 'Документ'
                  : 'Файл';
  return (
    <div
      className={`file-placeholder ${audio ? 'file-placeholder-audio' : 'file-placeholder-document'} ${className}`}
      role="img"
      aria-label={`${label}: ${file.name}`}
    >
      <div className="file-placeholder-icon">
        <Icon aria-hidden="true" strokeWidth={1.35} />
      </div>
      <span className="file-placeholder-label">{label}</span>
      <span className="file-placeholder-format">{format}</span>
    </div>
  );
}
