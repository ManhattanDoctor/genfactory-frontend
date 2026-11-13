import './library-picker.css';
import { useState, type ReactElement } from 'react';
import { useAuth } from '../features/auth/AuthProvider';
import type { IGnosisFile } from '../lib/types';
import { Modal, ModalFooter } from './Modal';
import { FileBrowser } from './FileBrowser';

export function LibraryPicker({
  onPick,
  onPickMany,
  onClose,
  selected = [],
  imagesOnly = true,
  acceptedTypes,
  multiple = false,
  maxFiles = 4,
  validateFile,
}: {
  onPick?: (file: IGnosisFile) => void;
  onPickMany?: (files: Array<IGnosisFile>) => void;
  onClose: () => void;
  selected?: Array<number>;
  imagesOnly?: boolean;
  acceptedTypes?: Array<string>;
  multiple?: boolean;
  maxFiles?: number;
  validateFile?: (file: IGnosisFile) => string | undefined;
}): ReactElement {
  const { user } = useAuth();
  const [pending, setPending] = useState<Array<IGnosisFile>>([]);
  const [error, setError] = useState('');
  const isMultiple = multiple && maxFiles > 1;
  const files = pending.filter((file) => file.userId === user?.id && !selected.includes(file.id));
  function pick(file: IGnosisFile): void {
    if (file.userId !== user?.id) return;
    if (isMultiple && files.some((item) => item.id === file.id)) {
      setPending(files.filter((item) => item.id !== file.id));
      setError('');
      return;
    }
    const issue = validateFile?.(file);
    if (issue) {
      setError(issue);
      return;
    }
    setError('');
    if (multiple && maxFiles < 1) {
      setError('Достигнут лимит вложений. Уберите один из добавленных файлов.');
      return;
    }
    if (!isMultiple) {
      if (onPickMany) onPickMany([file]);
      else onPick?.(file);
      onClose();
      return;
    }
    if (files.length >= maxFiles) {
      setError(`Можно добавить ещё файлов: ${Math.max(0, maxFiles)}.`);
    } else setPending([...files, file]);
  }
  function confirm(): void {
    if (!files.length || files.length > maxFiles) return;
    const types = acceptedTypes || (imagesOnly ? ['IMAGE'] : ['IMAGE', 'DOCUMENT', 'AUDIO']);
    for (const file of files) {
      const issue = !types.includes(file.type)
        ? 'Тип выбранного файла больше не подходит для этого поля.'
        : validateFile?.(file);
      if (issue) {
        setError(issue);
        return;
      }
    }
    if (onPickMany) onPickMany(files);
    else files.forEach((file) => onPick?.(file));
    onClose();
  }
  return (
    <Modal title="Библиотека" className="library-picker" onClose={onClose} wide>
      <FileBrowser
        key={user?.id}
        selected={selected}
        marked={files.map((file) => file.id)}
        multiple={isMultiple}
        acceptedTypes={acceptedTypes || (imagesOnly ? ['IMAGE'] : ['IMAGE', 'DOCUMENT', 'AUDIO'])}
        onOpen={pick}
      />
      {error && <p role="alert">{error}</p>}
      {isMultiple && (
        <ModalFooter className="library-selection-bar">
          <span role="status">
            Выбрано: {files.length} из {Math.max(0, maxFiles)}
          </span>
          <button
            type="button"
            className="button primary"
            disabled={!files.length || files.length > maxFiles}
            onClick={confirm}
          >
            Добавить ({files.length})
          </button>
        </ModalFooter>
      )}
    </Modal>
  );
}
