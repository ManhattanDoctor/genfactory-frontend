import type { GnosisFile } from '../lib/types';
import { Media } from './MediaPreview';
export function ReferenceList({
  files,
  onChange,
  video = false,
  disabled = false,
}: {
  files: GnosisFile[];
  onChange: (files: GnosisFile[]) => void;
  video?: boolean;
  disabled?: boolean;
}) {
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
          <div className="reference">
            <Media file={file} />
          </div>
          <div className="reference-meta">
            <b title={file.name}>{file.name}</b>
            <span>{video ? (i === 0 ? 'Первый кадр' : 'Последний кадр') : `Материал ${i + 1}`}</span>
            <div className="reference-actions">
              <button
                className="icon-button"
                disabled={disabled || i === 0}
                aria-label={`Переместить ${file.name} раньше`}
                onClick={() => move(i, -1)}
              >
                ←
              </button>
              <button
                className="icon-button"
                disabled={disabled || i === files.length - 1}
                aria-label={`Переместить ${file.name} позже`}
                onClick={() => move(i, 1)}
              >
                →
              </button>
              <button
                className="icon-button"
                disabled={disabled}
                aria-label={`Убрать ${file.name}`}
                onClick={() => onChange(files.filter((f) => f.id !== file.id))}
              >
                ×
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
