import { useEffect, useRef, useState, type ReactElement } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { IGnosisFile } from '../lib/types';
import { api, getSession } from '../lib/api';
import { resolveFile, downloadFile } from '../lib/files';
import { Modal } from './Modal';
import { FileBrowser } from './FileBrowser';

/** Shared library actions; metadata is loaded only when editing or downloading. */
export function FileActions({
  file,
  disabled = false,
}: {
  file: IGnosisFile | Pick<IGnosisFile, 'id' | 'name' | 'type'>;
  disabled?: boolean;
}): ReactElement {
  const cache = useQueryClient();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const folder = file.type === 'DIRECTORY';
  const [working, setBusy] = useState(false);
  const busy = disabled || working;
  const [action, setAction] = useState<'edit' | 'move' | 'delete'>();
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [destination, setDestination] = useState<string | null>(null);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function edit(): Promise<void> {
    const sid = getSession();
    if (!sid || busy || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await api.file(file.id, sid);
      if (!alive.current || getSession() !== sid) return;
      setName(value.name);
      setTags(value.tags?.join(', ') || '');
      setAction('edit');
    } catch (error) {
      if (alive.current && getSession() === sid)
        setError(error instanceof Error ? error.message : 'Не удалось открыть файл.');
    } finally {
      lock.current = false;
      if (alive.current && getSession() === sid) setBusy(false);
    }
  }
  async function save(): Promise<void> {
    const sid = getSession();
    if (!sid || !action || busy || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') await api.removeFile(file.id, sid);
      else
        await api.editFile(
          file.id,
          action === 'move'
            ? { directory: destination }
            : {
                name: name.trim(),
                tags: [
                  ...new Set(
                    tags
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  ),
                ],
              },
          sid,
        );
      if (!alive.current || getSession() !== sid) return;
      setAction(undefined);
      await Promise.all(
        ['files', 'artifacts', 'file-preview', 'messages', 'conversation', 'conversations'].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
    } catch (error) {
      if (alive.current && getSession() === sid)
        setError(error instanceof Error ? error.message : 'Не удалось выполнить действие.');
    } finally {
      lock.current = false;
      if (alive.current && getSession() === sid) setBusy(false);
    }
  }
  const downloadLock = useRef(false);
  async function download(): Promise<void> {
    const sid = getSession();
    if (!sid || busy || downloadLock.current) return;
    downloadLock.current = true;
    setBusy(true);
    setError('');
    try {
      const original = await resolveFile('uid' in file ? file : await api.file(file.id, sid), sid);
      if (!alive.current || getSession() !== sid) return;
      await downloadFile(original, sid);
    } catch (error) {
      if (alive.current && getSession() === sid)
        setError(error instanceof Error ? error.message : 'Не удалось скачать файл.');
    } finally {
      downloadLock.current = false;
      if (alive.current && getSession() === sid) setBusy(false);
    }
  }
  return (
    <>
      <details
        className="file-actions"
        name="file-card-actions"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
          }
        }}
      >
        <summary aria-label={`Действия с «${file.name}»`}>
          <MoreHorizontal size={18} />
        </summary>
        <div
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('button'))
              event.currentTarget.closest('details')?.removeAttribute('open');
          }}
        >
          {!folder && (
            <button type="button" className="text-button" disabled={busy} onClick={() => void download()}>
              Скачать
            </button>
          )}
          <button type="button" className="text-button" disabled={busy} onClick={() => void edit()}>
            Название и теги
          </button>
          {!folder && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setDestination(null);
                setError('');
                setAction('move');
              }}
            >
              Переместить
            </button>
          )}
          <button
            type="button"
            className="text-button danger"
            disabled={busy}
            onClick={() => {
              setError('');
              setAction('delete');
            }}
          >
            Удалить
          </button>
        </div>
      </details>
      {error && !action && <p role="alert">{error}</p>}
      {action && (
        <Modal
          title={
            action === 'edit' ? 'Название и теги' : action === 'move' ? 'Переместить файл' : 'Удалить файл'
          }
          onClose={() => {
            if (!busy) setAction(undefined);
          }}
          wide={action === 'move'}
        >
          <form
            className="file-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            {action === 'edit' && (
              <>
                <label>
                  Название
                  <input
                    autoFocus
                    required
                    minLength={3}
                    maxLength={124}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={busy}
                  />
                </label>
                <label>
                  Теги через запятую
                  <input value={tags} onChange={(event) => setTags(event.target.value)} disabled={busy} />
                </label>
              </>
            )}
            {action === 'delete' && (
              <p>
                {folder
                  ? 'Папка и всё её содержимое будут удалены без возможности восстановления.'
                  : file.type === 'LINK'
                    ? 'Будет удалена только ссылка. Оригинал останется.'
                    : 'Файл и его превью будут удалены без возможности восстановления. Он станет недоступен в задачах, где использовался.'}{' '}
                «{file.name}»
              </p>
            )}
            {action === 'move' && (
              <>
                <p>Откройте папку назначения или выберите корень библиотеки.</p>
                <FileBrowser foldersOnly onDirectory={setDestination} />
              </>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="file-form-buttons">
              <button type="button" className="button" disabled={busy} onClick={() => setAction(undefined)}>
                Отмена
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={busy || (action === 'edit' && name.trim().length < 3)}
              >
                {busy
                  ? 'Сохраняем…'
                  : action === 'delete'
                    ? 'Удалить'
                    : action === 'move'
                      ? 'Переместить сюда'
                      : 'Сохранить'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
