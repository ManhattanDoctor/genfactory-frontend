import { FileShareButton } from './FileShareButton';
import { GenerationDetails } from './FileGeneration';
import { MediaPreview, type PreviewFile } from './MediaPreview';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { scheduleRefresh } from '../features/realtime/queryRefresh';
import { useAuth } from '../features/auth/AuthProvider';
import { useEffect, useLayoutEffect, useId, useRef, useState, type ReactElement } from 'react';
import { ChevronDown, ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { IGnosisFile } from '../lib/types';
import { api, getSession, safeMediaUrl } from '../lib/api';
import { directoryPath, resolveFile, downloadFile, readFileText } from '../lib/files';
import { Modal, ModalFooter } from './Modal';
import { FileBrowser } from './FileBrowser';

/** Shared file actions for cards and the viewer; incomplete metadata is loaded on opening. */
export function FileActions({
  file,
  disabled = false,
  variant = 'menu',
  onDeleted,
  onNotice,
  onUse,
  onAnimate,
  onNavigate,
  onOpenFile,
}: {
  file: Pick<PreviewFile, 'name' | 'type'> & Partial<PreviewFile>;
  disabled?: boolean;
  variant?: 'menu' | 'preview-menu' | 'delete-button';
  onDeleted?: () => void;
  onNotice?: (message: string) => void;
  onUse?: (file: IGnosisFile) => void;
  onAnalyze?: (file: IGnosisFile) => void;
  onAnimate?: (file: IGnosisFile) => void;
  onNavigate?: () => void;
  onOpenFile?: (file: IGnosisFile) => void;
}): ReactElement {
  const cache = useQueryClient();
  const navigate = useNavigate();
  const menu = useRef<HTMLDetailsElement>(null);
  const groupName = useId();
  const [open, setOpen] = useState(false);
  const closeMenu = (): void => {
    if (menu.current) {
      menu.current.open = false;
      menu.current.querySelectorAll('details').forEach((group) => {
        group.open = false;
      });
    }
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent): void => {
      if (!menu.current?.contains(event.target as Node)) closeMenu();
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !menu.current?.open) return;
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      menu.current.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const panel = menu.current?.querySelector<HTMLElement>('.preview-menu-panel');
    const trigger = menu.current?.querySelector('summary');
    if (!panel || !trigger) return;
    const fit = (): void => {
      const anchor = trigger.getBoundingClientRect();
      const width = Math.min(260, innerWidth - 32);
      const below = innerHeight - anchor.bottom - 22;
      const above = anchor.top - 22;
      const down = below >= Math.min(panel.scrollHeight, 300) || below >= above;
      const height = Math.max(0, Math.min(420, down ? below : above));
      Object.assign(panel.style, {
        position: 'fixed',
        margin: '0',
        right: 'auto',
        bottom: 'auto',
        width: `${width}px`,
        maxHeight: `${height}px`,
        left: `${Math.max(16, Math.min(anchor.right - width, innerWidth - width - 16))}px`,
        top: `${down ? anchor.bottom + 6 : Math.max(16, anchor.top - Math.min(panel.scrollHeight, height) - 6)}px`,
      });
    };
    panel.setAttribute('popover', 'manual');
    panel.showPopover();
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(panel);
    window.addEventListener('resize', fit);
    window.addEventListener('scroll', fit, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
      window.removeEventListener('scroll', fit, true);
      if (panel.matches(':popover-open')) panel.hidePopover();
      panel.removeAttribute('popover');
      panel.removeAttribute('style');
    };
  }, [open]);
  const { user } = useAuth();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const detail = useQuery({
    queryKey: ['file-preview', file.userId ?? user?.id, file.id],
    enabled: open && typeof file.id === 'number' && !file.isExternal && !file.path,
    queryFn: () => api.file(file.id!),
  });
  const current: PreviewFile = { mime: '', ...file, ...detail.data };
  const saved = typeof current.id === 'number' && !current.isExternal;
  const manageable = saved && !!user && (current.userId === undefined || current.userId === user.id);
  const folder = current.type === 'DIRECTORY';
  const [notice, setNotice] = useState('');
  const notify = (message: string): void => {
    setNotice(message);
    onNotice?.(message);
  };
  const [generationOpen, setGenerationOpen] = useState(false);
  const [source, setSource] = useState<IGnosisFile>();
  const mime = current.mime?.split(';')[0].trim().toLowerCase();
  const textFile = useQuery({
    queryKey: ['file-text', current.userId ?? user?.id, current.id],
    enabled: open && saved && (mime === 'text/plain' || mime === 'text/markdown'),
    retry: false,
    staleTime: 300000,
    queryFn: ({ signal }) => readFileText(current as IGnosisFile, signal),
  });
  const [working, setBusy] = useState(false);
  const busy = disabled || working;
  const [action, setAction] = useState<'edit' | 'move' | 'delete'>();
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [destination, setDestination] = useState<IGnosisFile[]>([]);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function edit(): Promise<void> {
    const sid = getSession();
    if (!sid || !manageable || busy || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await api.file(file.id!, sid);
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
    if (!sid || !manageable || !action || busy || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') await api.removeFile(file.id!, sid);
      else
        await api.editFile(
          file.id!,
          action === 'move'
            ? { directory: destination.length ? directoryPath(destination[destination.length - 1]) : null }
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
      if (user)
        scheduleRefresh(
          cache,
          user.id,
          sid,
          ['files', 'file-preview', 'messages', 'conversation', 'conversations'],
          undefined,
          file.id,
        );
      if (action === 'move') {
        onNavigate?.();
        navigate('/library', {
          state: { userId: user?.id, destination, movedFile: { id: file.id, name: current.name } },
        });
      }
      if (action === 'delete') onDeleted?.();
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
    if ((!sid && saved) || busy || downloadLock.current) return;
    downloadLock.current = true;
    setBusy(true);
    setError('');
    try {
      if (!saved) {
        const url = safeMediaUrl(current.path);
        if (!url) return;
        const link = document.createElement('a');
        link.href = url;
        link.download = current.name;
        link.click();
        return;
      }
      if (!sid) return;
      const original = await resolveFile(
        'uid' in current ? (current as IGnosisFile) : await api.file(current.id!, sid),
        sid,
      );
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
  const useFile = (path: string, callback?: (file: IGnosisFile) => void): void => {
    closeMenu();
    if (callback) callback(current as IGnosisFile);
    else {
      onNavigate?.();
      navigate(path, { state: { reference: current, userId: user?.id } });
    }
  };
  const remove = (): void => {
    closeMenu();
    setError('');
    setAction('delete');
  };
  const itemClass = 'preview-menu-item';
  return (
    <>
      {variant === 'delete-button' ? (
        <button
          type="button"
          className="icon-button"
          aria-label={`Удалить ${file.name}`}
          title="Удалить"
          disabled={busy || !manageable}
          onClick={remove}
        >
          <Trash2 size={18} />
        </button>
      ) : (
        <details
          ref={menu}
          className={variant === 'preview-menu' ? 'preview-menu' : 'file-actions'}
          name="file-card-actions"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && event.currentTarget.open) {
              event.preventDefault();
              event.stopPropagation();
              closeMenu();
              event.currentTarget.querySelector('summary')?.focus();
            }
          }}
          onToggle={(event) => setOpen(event.currentTarget.open)}
        >
          <summary
            className="icon-button"
            aria-label={variant === 'preview-menu' ? 'Действия с файлом' : `Действия с «${file.name}»`}
          >
            <MoreHorizontal size={18} />
          </summary>
          <div className="preview-menu-panel" aria-label="Действия с текущим файлом">
            {!folder && (
              <button
                type="button"
                className={itemClass}
                disabled={busy}
                onClick={() => {
                  closeMenu();
                  void download();
                }}
              >
                Скачать файл
              </button>
            )}
            {!folder && safeMediaUrl(current.path) && (
              <>
                {(['link', 'file'] as const).map((mode) => (
                  <FileShareButton
                    key={`${current.id}:${current.path}:${mode}`}
                    file={current}
                    mode={mode}
                    onNotice={notify}
                    onShared={closeMenu}
                  />
                ))}
              </>
            )}

            {((saved && current.type === 'IMAGE') || textFile.data !== undefined) && (
              <details className="file-menu-group" name={groupName}>
                <summary className={itemClass}>
                  Использовать в… <ChevronDown size={16} />
                </summary>
                <div className="file-menu-group-items">
                  {saved && current.type === 'IMAGE' && (
                    <button type="button" className={itemClass} onClick={() => useFile('/image', onUse)}>
                      Как референс
                    </button>
                  )}
                  {saved && current.type === 'IMAGE' && (
                    <>
                      <button
                        type="button"
                        className={itemClass}
                        onClick={() => useFile('/video', onAnimate)}
                      >
                        Анимировать
                      </button>
                    </>
                  )}
                  {textFile.data !== undefined && (
                    <>
                      <button
                        type="button"
                        className={itemClass}
                        onClick={async () => {
                          closeMenu();
                          try {
                            await navigator.clipboard.writeText(textFile.data!);
                            notify('Текст скопирован.');
                          } catch {
                            notify('Не удалось скопировать текст.');
                          }
                        }}
                      >
                        Копировать текст
                      </button>
                      <button
                        type="button"
                        className={itemClass}
                        onClick={() => {
                          closeMenu();
                          onNavigate?.();
                          navigate('/audio', { state: { prompt: textFile.data, userId: user?.id } });
                        }}
                      >
                        Озвучить текст
                      </button>
                      <button
                        type="button"
                        className={itemClass}
                        onClick={() => {
                          closeMenu();
                          onNavigate?.();
                          navigate('/prompt', { state: { prompt: textFile.data, userId: user?.id } });
                        }}
                      >
                        В описание задачи
                      </button>
                    </>
                  )}
                </div>
              </details>
            )}
            {(manageable || current.origin?.generation || (!folder && safeMediaUrl(current.path))) && (
              <details className="file-menu-group" name={groupName}>
                <summary className={itemClass}>
                  Дополнительно <ChevronDown size={16} />
                </summary>
                <div className="file-menu-group-items">
                  {!folder && safeMediaUrl(current.path) && (
                    <a
                      className={itemClass}
                      href={safeMediaUrl(current.path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={closeMenu}
                    >
                      Открыть оригинал <ExternalLink size={16} />
                    </a>
                  )}
                  {manageable && (
                    <button
                      type="button"
                      className={itemClass}
                      disabled={busy}
                      onClick={() => {
                        closeMenu();
                        void edit();
                      }}
                    >
                      Название и теги
                    </button>
                  )}
                  {manageable && !folder && (
                    <button
                      type="button"
                      className={itemClass}
                      disabled={busy}
                      onClick={() => {
                        closeMenu();
                        setDestination([]);
                        setError('');
                        setAction('move');
                      }}
                    >
                      Переместить
                    </button>
                  )}
                  {current.origin?.generation && (
                    <button
                      type="button"
                      className={itemClass}
                      onClick={() => {
                        closeMenu();
                        setGenerationOpen(true);
                      }}
                    >
                      Параметры генерации
                    </button>
                  )}
                </div>
              </details>
            )}
            {manageable && (
              <button
                type="button"
                className={`${itemClass} file-menu-delete danger`}
                disabled={busy}
                onClick={remove}
              >
                Удалить
              </button>
            )}
            {!onNotice && notice && <p role="status">{notice}</p>}
            {detail.isError && <p role="alert">Не удалось загрузить сведения о файле.</p>}
          </div>
        </details>
      )}
      {!onNotice &&
        !open &&
        notice &&
        createPortal(
          <Modal title="Действия с файлом" onClose={() => setNotice('')}>
            <p role="status">{notice}</p>
          </Modal>,
          document.body,
        )}
      {generationOpen &&
        createPortal(
          <Modal title="Параметры генерации" onClose={() => setGenerationOpen(false)}>
            <GenerationDetails
              file={current as IGnosisFile}
              onClose={() => setGenerationOpen(false)}
              onOpen={(value) => {
                setGenerationOpen(false);
                if (onOpenFile) onOpenFile(value);
                else setSource(value);
              }}
            />
          </Modal>,
          document.body,
        )}
      {source &&
        createPortal(<MediaPreview file={source} onClose={() => setSource(undefined)} />, document.body)}
      {error && !action && <p role="alert">{error}</p>}
      {action &&
        createPortal(
          <Modal
            title={
              action === 'edit' ? 'Название и теги' : action === 'move' ? 'Переместить файл' : 'Удалить файл'
            }
            onClose={() => {
              if (!busy) setAction(undefined);
            }}
            wide={action === 'move'}
            className={action === 'move' ? 'file-move-dialog' : undefined}
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
                <FileBrowser foldersOnly onOpen={setSource} onDestination={setDestination} />
              )}
              {error && <p role="alert">{error}</p>}
              <ModalFooter className="file-form-buttons">
                <button type="button" className="button" disabled={busy} onClick={() => setAction(undefined)}>
                  Отмена
                </button>
                <button
                  type="submit"
                  className="button primary"
                  aria-busy={working}
                  disabled={busy || (action === 'edit' && name.trim().length < 3)}
                >
                  {busy
                    ? action === 'delete'
                      ? 'Удаление…'
                      : action === 'move'
                        ? 'Перемещение…'
                        : 'Сохраняем…'
                    : action === 'delete'
                      ? 'Удалить'
                      : action === 'move'
                        ? 'Переместить сюда'
                        : 'Сохранить'}
                </button>
              </ModalFooter>
            </form>
          </Modal>,
          document.body,
        )}
    </>
  );
}
