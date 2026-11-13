import type { ReactElement } from 'react';
import type { IGnosisFile } from '../lib/types';
import { ComposerAttachment } from './ComposerAttachment';
export function ReferenceList({
  files,
  onChange,
  video = false,
  disabled = false,
}: {
  files: IGnosisFile[];
  onChange: (files: IGnosisFile[]) => void;
  video?: boolean;
  disabled?: boolean;
}): ReactElement {
  const move = (index: number, delta: number) => {
    const copy = [...files];
    [copy[index], copy[index + delta]] = [copy[index + delta], copy[index]];
    onChange(copy);
  };
  return (
    <div className="reference-list">
      {files.map((file, i) => (
        <div
          className="reference-item"
          key={file.id}
          draggable={!disabled}
          onDragStart={(e) => e.dataTransfer.setData('application/x-genfactory-reference', String(file.id))}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-genfactory-reference')) e.preventDefault();
          }}
          onDrop={(e) => {
            const id = Number(e.dataTransfer.getData('application/x-genfactory-reference'));
            const from = files.findIndex((f) => f.id === id);
            if (disabled || from < 0) return;
            e.preventDefault();
            const copy = [...files];
            const [item] = copy.splice(from, 1);
            copy.splice(i, 0, item);
            onChange(copy);
          }}
        >
          <ComposerAttachment
            file={file}
            caption={
              video && file.type === 'IMAGE'
                ? `${i === 0 ? 'Первый' : 'Последний'} кадр: ${file.name}`
                : file.name
            }
            disabled={disabled}
            onRemove={() => onChange(files.filter((f) => f.id !== file.id))}
          />
          {files.length > 1 && (
            <div className="reference-actions">
              <button
                type="button"
                className="icon-button"
                disabled={disabled || i === 0}
                aria-label={`Переместить ${file.name} раньше`}
                onClick={() => move(i, -1)}
              >
                ←
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={disabled || i === files.length - 1}
                aria-label={`Переместить ${file.name} позже`}
                onClick={() => move(i, 1)}
              >
                →
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
