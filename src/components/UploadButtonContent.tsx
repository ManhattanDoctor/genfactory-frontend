import type { ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { IUploadProgress } from '../lib/api';

export function UploadButtonContent({
  busy,
  progress,
  children,
  compact = false,
}: {
  busy: boolean;
  progress?: IUploadProgress;
  children: ReactNode;
  compact?: boolean;
}) {
  if (!busy) return children;
  const percent = progress?.total
    ? Math.min(99, Math.floor((progress.loaded / progress.total) * 100))
    : undefined;
  const label =
    progress?.phase === 'processing'
      ? 'Сохранение…'
      : percent !== undefined
        ? `Загрузка… ${percent}%`
        : progress
          ? 'Загрузка…'
          : 'Подготовка…';
  return (
    <span className="upload-button-status" role="status" title={progress?.fileName}>
      <LoaderCircle size={17} className="upload-button-spinner" aria-hidden="true" />
      <span className={compact ? 'sr-only' : undefined}>{label}</span>
    </span>
  );
}
