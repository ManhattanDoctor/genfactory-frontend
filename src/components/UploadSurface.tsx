import { useState, type ReactNode } from 'react';
export function UploadSurface({
  children,
  onFiles,
  disabled = false,
}: {
  children: ReactNode;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`upload-surface ${over ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          if (!disabled) setOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        if (!disabled) onFiles(Array.from(e.dataTransfer.files));
      }}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files);
        if (!files.length) return;
        e.preventDefault();
        if (!disabled) onFiles(files);
      }}
    >
      {over && (
        <span className="drop-hint" aria-live="polite">
          Отпустите файлы, чтобы прикрепить
        </span>
      )}
      {children}
    </div>
  );
}
