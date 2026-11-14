import { scheduleRefresh } from '../features/realtime/queryRefresh';
import { SkeletonCards } from './Skeleton';
import type { ReactElement } from 'react';
import './file-browser.css';
import { FileCard } from './FileCard';
import { FileActions } from './FileActions';
import { UploadButtonContent } from './UploadButtonContent';
import type { IUploadProgress } from '../lib/api';
import { FileTagFilter } from './FileTagFilter';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Folder,
  FolderUp,
  Upload,
  ArrowLeft,
  CircleAlert,
  House,
  LayoutGrid,
  Image as ImageIcon,
  Video,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api, getSession } from '../lib/api';
import { directoryPath, folderTrail, mediaType, resolveFile } from '../lib/files';
import type { IGnosisFile } from '../lib/types';
import { useAuth } from '../features/auth/AuthProvider';
import { Modal, ModalFooter } from './Modal';
const FILE_TAG_FILTER_ENABLED = false;

interface IFileBrowserProps {
  allowBatchRemove?: boolean;
  onOpen?: (file: IGnosisFile, files: IGnosisFile[]) => void;
  selected?: number[];
  marked?: Array<number>;
  multiple?: boolean;
  acceptedTypes?: string[];
  foldersOnly?: boolean;
  onCreate?: () => void;
  onDirectory?: (directory: string | null) => void;
}
export function FileBrowser({
  allowBatchRemove = false,
  onOpen,
  selected = [],
  marked = [],
  multiple = false,
  acceptedTypes,
  foldersOnly = false,
  onDirectory,
  onCreate,
}: IFileBrowserProps): ReactElement {
  const { user } = useAuth();
  const cache = useQueryClient();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const closeMenus = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      const menus = document.querySelectorAll<HTMLDetailsElement>('.file-actions[open]');
      if (event instanceof KeyboardEvent && menus.length) event.preventDefault();
      menus.forEach((menu) => {
        if (event instanceof KeyboardEvent || !menu.contains(event.target as Node)) menu.open = false;
      });
    };
    document.addEventListener('click', closeMenus);
    document.addEventListener('keydown', closeMenus);
    return () => {
      document.removeEventListener('click', closeMenus);
      document.removeEventListener('keydown', closeMenus);
    };
  }, []);
  const [trail, setTrail] = useState<IGnosisFile[]>([]);
  const directory = trail.length ? directoryPath(trail[trail.length - 1]) : null;
  const [page, setPage] = useState(0);
  const [type, setType] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMatch, setTagMatch] = useState<'all' | 'any'>('all');
  const setTagFilter = (tags: string[]): void => {
    setSelectedTags(tags);
    setPage(0);
  };
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<{ kind: 'create' }>();
  const [selecting, setSelecting] = useState(false);
  const [batch, setBatch] = useState<Array<IGnosisFile>>([]);
  const [confirmBatch, setConfirmBatch] = useState(false);
  const batchLock = useRef(false);
  const batchFiles = batch.filter((file) => file.userId === user?.id);
  const selectionMode = multiple || selecting;
  const markedIds = selecting ? batchFiles.map((file) => file.id) : marked;
  function toggleBatch(file: IGnosisFile): void {
    if (busy || batchLock.current || file.type === 'DIRECTORY' || file.userId !== user?.id) return;
    setError('');
    if (batchFiles.some((item) => item.id === file.id))
      setBatch(batchFiles.filter((item) => item.id !== file.id));
    else if (batchFiles.length >= 100) setError('За один раз можно удалить до 100 файлов.');
    else setBatch([...batchFiles, file]);
  }
  async function removeBatch(): Promise<void> {
    const sid = getSession();
    if (!sid || busy || batchLock.current || !batchFiles.length) return;
    const requested = batchFiles;
    batchLock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await api.removeFiles(
        requested.map((file) => file.id),
        sid,
      );
      if (!alive.current || getSession() !== sid) return;
      const results = new Map(response.items.map((item) => [item.id, item]));
      const deleted = requested.filter((file) => results.get(file.id)?.status === 'DELETED');
      const failed = requested.filter((file) => results.get(file.id)?.status !== 'DELETED');
      setBatch(failed);
      setConfirmBatch(false);
      if (!failed.length) setSelecting(false);
      setNotice(`Удалено: ${deleted.length} из ${requested.length}`);
      if (failed.length)
        setError(
          failed
            .map((file) => `${file.name}: ${results.get(file.id)?.message || 'Удаление не подтверждено.'}`)
            .join('\n'),
        );
      if (user)
        scheduleRefresh(cache, user.id, sid, [
          'files',
          'file-preview',
          'messages',
          'conversation',
          'conversations',
        ]);
    } catch (error) {
      if (alive.current && getSession() === sid)
        setError(
          `${error instanceof Error ? error.message : 'Не удалось удалить файлы.'} Обновите библиотеку перед повторной попыткой: часть файлов могла быть удалена.`,
        );
    } finally {
      batchLock.current = false;
      if (alive.current && getSession() === sid) setBusy(false);
    }
  }
  const [name, setName] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<IUploadProgress>();
  const [uploadBatch, setUploadBatch] = useState<{ index: number; total: number }>();
  const uploadLock = useRef(false);
  async function uploadFiles(selectedFiles: File[]): Promise<void> {
    const sid = getSession();
    if (!selectedFiles.length || !sid || busy || uploadLock.current) return;
    uploadLock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let completed = 0;
    const failures: string[] = [];
    try {
      for (const [index, file] of selectedFiles.entries()) {
        if (!alive.current || getSession() !== sid) break;
        setUploadBatch({ index: index + 1, total: selectedFiles.length });
        setUploadProgress(undefined);
        try {
          await api.upload(file, sid, { directory }, (progress) => {
            if (alive.current && getSession() === sid) setUploadProgress(progress);
          });
          completed++;
        } catch (e) {
          failures.push(`${file.name}: ${e instanceof Error ? e.message : 'Не удалось загрузить'}`);
        }
      }
      if (alive.current && getSession() === sid) {
        await refresh();
        setNotice(
          selectedFiles.length === 1 && completed === 1
            ? 'Файл загружен'
            : `Загружено: ${completed} из ${selectedFiles.length}`,
        );
        if (failures.length) setError(`Не загружены: ${failures.join('; ')}`);
      }
    } finally {
      uploadLock.current = false;
      if (alive.current && getSession() === sid) {
        setBusy(false);
        setUploadProgress(undefined);
        setUploadBatch(undefined);
      }
    }
  }
  const files = useQuery({
    queryKey: [
      'files',
      user?.id,
      'browser',
      directory,
      query,
      page,
      foldersOnly,
      type,
      selectedTags,
      tagMatch,
    ],
    queryFn: ({ signal }) =>
      api.browseFiles(page, directory, query, foldersOnly, type, selectedTags, tagMatch, signal),
    enabled: !!user,
  });
  useEffect(() => {
    if (search.trim() === query) return;
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, query]);
  useEffect(() => {
    onDirectory?.(directory);
  }, [directory, onDirectory]);
  useEffect(() => {
    if (files.data && page > 0 && page >= files.data.pages) setPage(Math.max(0, files.data.pages - 1));
  }, [files.data, page]);
  const refresh = (): void => {
    const sid = getSession();
    if (user && sid) scheduleRefresh(cache, user.id, sid, ['files']);
  };
  async function run(work: () => Promise<unknown>, message = ''): Promise<void> {
    const sid = getSession();
    if (busy || !sid) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      if (!alive.current || getSession() !== sid) return;
      setAction(undefined);
      setNotice(message);
    } catch (e) {
      if (alive.current && getSession() === sid)
        setError(e instanceof Error ? e.message : 'Не удалось выполнить действие.');
    } finally {
      if (alive.current && getSession() === sid) setBusy(false);
    }
  }
  function navigate(items: IGnosisFile[]): void {
    setTrail(items);
    setSelectedTags([]);
    setType('');
    setSearch('');
    setQuery('');
    setPage(0);
  }
  async function open(file: IGnosisFile): Promise<void> {
    const sid = getSession();
    if (!sid || busy) return;
    if (file.type === 'DIRECTORY') {
      if (query || selectedTags.length)
        await run(async () => {
          const folders = await folderTrail(file);
          if (alive.current && getSession() === sid) navigate(folders);
        });
      else navigate([...trail, file]);
      return;
    }
    if (selecting) {
      toggleBatch(file);
      return;
    }
    await run(async () => {
      const original = await resolveFile(file, sid);
      if (acceptedTypes && !acceptedTypes.includes(original.type))
        throw new Error('Этот тип файла не подходит для выбранной задачи.');
      if (selected.includes(original.id)) throw new Error('Этот файл уже добавлен.');
      if (!alive.current || getSession() !== sid) return;
      onOpen?.(original, [
        original,
        ...(files.data?.items || []).filter(
          (item) => item.type !== 'DIRECTORY' && item.type !== 'LINK' && item.id !== original.id,
        ),
      ]);
    });
  }
  return (
    <section className="file-browser" aria-label={foldersOnly ? 'Выбор папки' : 'Файлы'}>
      <nav className="file-breadcrumbs" aria-label="Путь к папке">
        {!!trail.length && (
          <button
            type="button"
            className="icon-button file-back"
            aria-label="Назад в родительскую папку"
            disabled={busy}
            onClick={() => navigate(trail.slice(0, -1))}
          >
            <ArrowLeft size={18} />
          </button>
        )}
        {(!!trail.length || !!query || !!selectedTags.length) && (
          <button
            type="button"
            className="icon-button file-back"
            aria-label="Корень библиотеки"
            title="Корень библиотеки"
            disabled={busy}
            onClick={() => navigate([])}
          >
            <House size={18} />
          </button>
        )}
        {!query &&
          !selectedTags.length &&
          trail.map((folder, index) => (
            <span key={folder.id}>
              {' '}
              /{' '}
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => navigate(trail.slice(0, index + 1))}
              >
                {folder.name}
              </button>
            </span>
          ))}
        {(query || !!selectedTags.length) && <span> / Результаты поиска во всех папках</span>}
      </nav>
      {!foldersOnly && (
        <div className="file-controls">
          <div className="file-toolbar">
            {allowBatchRemove && (
              <button
                type="button"
                className="button"
                disabled={busy}
                aria-pressed={selecting}
                onClick={() => {
                  setSelecting(!selecting);
                  setBatch([]);
                  setError('');
                  setNotice('');
                }}
              >
                {selecting ? 'Отменить выбор' : 'Выбрать для удаления'}
              </button>
            )}
            <input
              aria-label="Поиск по всем файлам"
              placeholder="Поиск по всем файлам"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              className="button"
              disabled={busy || !!query || !!selectedTags.length}
              aria-label="Новая папка"
              title="Новая папка"
              onClick={() => {
                setName('');
                setAction({ kind: 'create' });
                setError('');
              }}
            >
              <Folder size={16} />
              <span className="file-action-label">Новая папка</span>
            </button>
            <button
              type="button"
              className="button"
              disabled={busy || !!query || !!selectedTags.length}
              aria-label="Загрузить файл"
              title="Загрузить файл"
              aria-busy={!!uploadBatch}
              onClick={() => upload.current?.click()}
            >
              <UploadButtonContent busy={!!uploadBatch} progress={uploadProgress}>
                <Upload size={16} />
                <span className="file-action-label">Загрузить файл</span>
              </UploadButtonContent>
              {uploadBatch && uploadBatch.total > 1 && (
                <span className="file-upload-count">
                  {uploadBatch.index}/{uploadBatch.total}
                </span>
              )}
            </button>
            <input
              hidden
              ref={upload}
              type="file"
              multiple
              onChange={(e) => {
                const selectedFiles = Array.from(e.target.files || []);
                e.target.value = '';
                void uploadFiles(selectedFiles);
              }}
            />
          </div>
          <div className="file-filters">
            <div className="chips" aria-label="Тип файлов">
              {(
                [
                  ['', 'Все', LayoutGrid],
                  ['IMAGE', 'Изображения', ImageIcon],
                  ['VIDEO', 'Видео', Video],
                  ['DOCUMENT', 'Документы', FileText],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  type="button"
                  key={value}
                  className={`chip ${type === value ? 'active' : ''}`}
                  aria-pressed={type === value}
                  aria-label={label}
                  title={label}
                  onClick={() => {
                    setType(value);
                    setPage(0);
                  }}
                >
                  <Icon size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
            {FILE_TAG_FILTER_ENABLED && (
              <FileTagFilter
                tags={selectedTags}
                match={tagMatch}
                onChange={setTagFilter}
                onMatch={(value) => {
                  setTagMatch(value);
                  setPage(0);
                }}
              />
            )}
          </div>
        </div>
      )}
      {!action && error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {user && files.isPending && <SkeletonCards label="Загружаем файлы…" />}
      {files.error && (
        <p role="alert">
          {files.error.message}{' '}
          <button type="button" className="text-button" onClick={() => void files.refetch()}>
            Повторить
          </button>
        </p>
      )}
      <div className={foldersOnly ? 'file-folder-list' : 'library-grid'}>
        {!!trail.length && !query && !selectedTags.length && (
          <article className="file-entry file-parent">
            <button
              type="button"
              className="library-card"
              aria-label="На уровень выше"
              title="На уровень выше"
              disabled={busy}
              onClick={() => navigate(trail.slice(0, -1))}
            >
              <div className="library-media">
                <div className="file-folder-icon">
                  <FolderUp size={44} />
                </div>
              </div>
              <div>
                <b>...</b>
                <span>Папка</span>
                <span className="file-generation-summary" title={trail.at(-2)?.name || 'Библиотека'}>
                  {trail.at(-2)?.name || 'Библиотека'}
                </span>
              </div>
            </button>
          </article>
        )}
        {files.data?.items.map((file) => {
          const folder = file.type === 'DIRECTORY';
          const incompatible = !folder && !!acceptedTypes && !acceptedTypes.includes(mediaType(file));
          const already = selected.includes(file.linkTo ?? file.id);
          const checked = markedIds.includes(selecting ? file.id : (file.linkTo ?? file.id));
          return (
            <article className={`file-entry${incompatible ? ' is-incompatible' : ''}`} key={file.id}>
              <FileCard
                file={file}
                onOpen={() => void open(file)}
                disabled={busy}
                incompatible={incompatible}
                already={already}
                checked={checked}
                selectionMode={selectionMode}
              />
              {incompatible && (
                <button
                  type="button"
                  className="file-incompatible"
                  aria-label="Почему файл не подходит"
                  aria-describedby={`file-incompatible-${file.id}`}
                >
                  <CircleAlert size={18} aria-hidden="true" />
                  <span role="tooltip" id={`file-incompatible-${file.id}`}>
                    Не подходит для этой задачи
                  </span>
                </button>
              )}
              {!foldersOnly && FILE_TAG_FILTER_ENABLED && !!file.tags?.length && (
                <div className="file-tag-chips" aria-label={`Теги файла ${file.name}`}>
                  {file.tags.map((tag) => (
                    <button
                      type="button"
                      className="chip"
                      key={tag}
                      disabled={!FILE_TAG_FILTER_ENABLED}
                      onClick={() => setTagFilter([tag.trim().toLocaleLowerCase('ru')])}
                      aria-label={`Файлы с тегом ${tag}`}
                      title={tag}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
              {!foldersOnly && file.userId === user?.id && <FileActions file={file} disabled={busy} />}
            </article>
          );
        })}
      </div>
      {selecting && (
        <div className="file-batch-bar">
          <span role="status">Выбрано: {batchFiles.length} из 100</span>
          <button
            type="button"
            className="button"
            disabled={busy || !batchFiles.length}
            onClick={() => {
              setError('');
              setConfirmBatch(true);
            }}
          >
            Удалить выбранные ({batchFiles.length})
          </button>
        </div>
      )}
      {confirmBatch && (
        <Modal
          title="Удалить выбранные файлы"
          onClose={() => {
            if (!batchLock.current) setConfirmBatch(false);
          }}
        >
          <p>
            Будет удалено файлов: {batchFiles.length}. Файлы и их превью станут недоступны в задачах, где
            использовались. Это действие нельзя отменить. Для ссылок удаляется только ссылка, оригинал
            остаётся.
          </p>
          <ul>
            {batchFiles.map((file) => (
              <li key={file.id}>{file.name}</li>
            ))}
          </ul>
          {error && <p role="alert">{error}</p>}
          <ModalFooter className="file-form-buttons">
            <button type="button" className="button" disabled={busy} onClick={() => setConfirmBatch(false)}>
              Отмена
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void removeBatch()}
            >
              {busy ? 'Удаляем…' : 'Удалить безвозвратно'}
            </button>
          </ModalFooter>
        </Modal>
      )}
      {files.data &&
        !files.data.items.length &&
        !directory &&
        !query &&
        !type &&
        !selectedTags.length &&
        onCreate && (
          <div className="empty-state">
            <h2>Здесь начинается ваша коллекция</h2>
            <button type="button" className="button primary" onClick={onCreate}>
              Создать изображение
            </button>
          </div>
        )}
      {files.data && !files.data.items.length && (
        <p className="empty-state">
          {query || selectedTags.length
            ? 'По вашему запросу ничего не найдено.'
            : foldersOnly
              ? 'Нет вложенных папок. Можно выбрать текущую.'
              : type === 'DOCUMENT'
                ? 'Документов пока нет. Загрузите первый файл.'
                : type === 'VIDEO'
                  ? 'Видео пока нет.'
                  : type === 'IMAGE'
                    ? 'Изображений пока нет.'
                    : 'В этой папке пока нет файлов.'}
        </p>
      )}
      {files.data && files.data.pages > 1 && (
        <div className="pagination">
          <button
            type="button"
            className="button"
            aria-label="Предыдущая страница"
            title="Предыдущая страница"
            disabled={!page || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <span>
            {page + 1} / {files.data.pages}
          </span>
          <button
            type="button"
            className="button"
            aria-label="Следующая страница"
            title="Следующая страница"
            disabled={page + 1 >= files.data.pages || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      {action && (
        <Modal
          title="Новая папка"
          onClose={() => {
            if (!busy) setAction(undefined);
          }}
        >
          <form
            className="file-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await api.createDirectory(name.trim(), directory);
                await refresh();
              }, 'Готово');
            }}
          >
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
            {error && <p role="alert">{error}</p>}
            <ModalFooter className="file-form-buttons">
              <button type="button" className="button" disabled={busy} onClick={() => setAction(undefined)}>
                Отмена
              </button>
              <button type="submit" className="button primary" disabled={busy || name.trim().length < 3}>
                {busy ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}
    </section>
  );
}
