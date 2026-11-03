import { AudioLines, FileText, FileSpreadsheet, FileCode2, File } from 'lucide-react';
import type { IGnosisFile } from '../lib/types';

export function FilePlaceholder({ file }: { file: IGnosisFile }) {
  const audio = file.type === 'AUDIO' || file.mime?.startsWith('audio/');
  const extension = file.name.split('.').pop()?.toUpperCase();
  const format = extension && /^[A-Z0-9]{1,7}$/.test(extension) ? extension : audio ? 'AUDIO' : 'FILE';
  const table = ['CSV', 'XLS', 'XLSX', 'ODS'].includes(format);
  const code = ['JSON', 'XML', 'YAML', 'YML'].includes(format);
  const document = file.type === 'DOCUMENT' || file.mime?.startsWith('text/');
  const Icon = audio ? AudioLines : table ? FileSpreadsheet : code ? FileCode2 : document ? FileText : File;
  const label = audio
    ? 'Аудиозапись'
    : table
      ? 'Таблица'
      : format === 'PDF'
        ? 'PDF-документ'
        : document
          ? 'Документ'
          : 'Файл';
  return (
    <div
      className={`file-placeholder ${audio ? 'file-placeholder-audio' : 'file-placeholder-document'}`}
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
