import { LibrarySearch } from './LibrarySearch';
import { HistoryCardBody } from './HistoryCardBody';
import { previewCardStyle } from './previewCardStyle';
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
import { api, getSession, MAX_UPLOAD_BYTES } from '../lib/api';
import { validatePhotoUpload } from '../lib/image-upload';
import { directoryPath, folderTrail, mediaType, resolveFile } from '../lib/files';
import type { IGnosisFile } from '../lib/types';
import { useAuth } from '../features/auth/AuthProvider';
import { Modal, ModalFooter } from './Modal';
function fileCountLabel(count: number): string {
  switch (new Intl.PluralRules('ru').select(count)) {
    case 'one':
      return 'файл';
    case 'few':
      return 'файла';
    default:
      return 'файлов';
  }
}
const FILE_TAG_FILTER_ENABLED = false;

interface IFileBrowserProps {
  layout?: 'page' | 'picker';
  allowBatchRemove?: boolean;
  onOpen?: (file: IGnosisFile, files: IGnosisFile[]) => void;
  selected?: number[];
  marked?: Array<number>;
  multiple?: boolean;
  acceptedTypes?: string[];
  foldersOnly?: boolean;
  onDirectory?: (directory: string | null) => void;
  onDestination?: (trail: IGnosisFile[]) => void;
  initialTrail?: IGnosisFile[];
  movedFile?: Pick<IGnosisFile, 'id' | 'name'>;
}
export function FileBrowser({
  allowBatchRemove = false,
  onOpen,
  selected = [],
  marked = [],
  multiple = false,
  acceptedTypes,
  foldersOnly = false,
  layout,
  onDirectory,
  onDestination,
  initialTrail = [],
  movedFile,
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
  const [trail, setTrail] = useState<IGnosisFile[]>(initialTrail);
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
  const [failedUploads, setFailedUploads] = useState<
    Array<{
      file: File;
      directory: string | null;
      sid: string;
      message: string;
    }>
  >([]);
  const visibleFailures = failedUploads.filter(
    (item) => item.sid === getSession() && item.directory === directory,
  );
  async function uploadFiles(selectedFiles: File[]): Promise<void> {
    const sid = getSession();
    if (!selectedFiles.length || !sid || busy || uploadLock.current) return;
    uploadLock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let completed = 0;

    try {
      for (const [index, file] of selectedFiles.entries()) {
        if (!alive.current || getSession() !== sid) break;
        setUploadBatch({ index: index + 1, total: selectedFiles.length });
        setUploadProgress(undefined);
        try {
          if (file.size <= MAX_UPLOAD_BYTES) await validatePhotoUpload(file);
          if (!alive.current || getSession() !== sid) break;
          await api.upload(file, sid, { directory }, (progress) => {
            if (alive.current && getSession() === sid) setUploadProgress(progress);
          });
          if (alive.current && getSession() === sid)
            setFailedUploads((current) =>
              current.filter(
                (item) => item.file !== file || item.directory !== directory || item.sid !== sid,
              ),
            );
          completed++;
        } catch (e) {
          if (!alive.current || getSession() !== sid) break;
          const message = e instanceof Error ? e.message : 'Не удалось загрузить файл. Попробуйте ещё раз.';
          setFailedUploads((current) => [
            ...current.filter(
              (item) => item.file !== file || item.directory !== directory || item.sid !== sid,
            ),
            { file, directory, sid, message },
          ]);
        }
      }
      if (alive.current && getSession() === sid) {
        await refresh();
        setNotice(
          selectedFiles.length === 1 && completed === 1
            ? 'Файл загружен'
            : `Загружено: ${completed} из ${selectedFiles.length}`,
        );
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
      !!onDestination,
      type,
      selectedTags,
      tagMatch,
    ],
    queryFn: ({ signal }) =>
      api.browseFiles(
        page,
        directory,
        query,
        foldersOnly && !onDestination,
        type,
        selectedTags,
        tagMatch,
        signal,
      ),
    enabled: !!user,
  });
  useEffect(() => {
    onDestination?.(trail);
  }, [trail, onDestination]);
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
  const sectionTitle = trail.at(-1)?.name || (layout === 'page' ? 'Готово' : undefined);
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
            data-tooltip="Корень библиотеки"
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
      {onDestination && files.isPending && user && (
        <p className="muted small" role="status">
          Загружаем содержимое папки…
        </p>
      )}
      {movedFile &&
        trail === initialTrail &&
        !query &&
        !type &&
        !selectedTags.length &&
        files.data &&
        files.data.pages > 1 &&
        !files.data.items.some((item) => item.id === movedFile.id) && (
          <button
            type="button"
            className="text-button"
            onClick={() =>
              void run(async () => {
                const sid = getSession();
                if (!sid) return;
                const file = await api.file(movedFile.id, sid);
                if (!alive.current || getSession() !== sid) return;
                if (file.userId !== user?.id || (file.directory ?? null) !== directory)
                  throw new Error('Файл больше не находится в этой папке.');
                const original = await resolveFile(file, sid);
                if (alive.current && getSession() === sid) onOpen?.(original, [original]);
              })
            }
          >
            Открыть перемещённый файл «{movedFile.name}»
          </button>
        )}
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
            <LibrarySearch
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
              data-tooltip="Новая папка"
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
              data-tooltip={
                acceptedTypes?.length === 1 && acceptedTypes[0] === 'IMAGE'
                  ? 'Загрузить фото: JPG, PNG, WebP, HEIC/HEIF'
                  : 'Загрузить файл'
              }
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
                  data-tooltip={label}
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
      {!!visibleFailures.length && (
        <div className="file-upload-failures" role="alert">
          {visibleFailures.map((item) => (
            <div key={failedUploads.indexOf(item)}>
              <strong>{item.file.name}</strong>
              <p>{item.message}</p>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => void uploadFiles([item.file])}
              >
                Повторить
              </button>{' '}
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => {
                  setFailedUploads((current) => current.filter((failure) => failure !== item));
                  setNotice('');
                }}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {user && !onDestination && files.isPending && (
        <SkeletonCards label="Загружаем файлы…" className="library-grid" />
      )}
      {files.error && (
        <p role="alert">
          {files.error.message}{' '}
          <button type="button" className="text-button" onClick={() => void files.refetch()}>
            Повторить
          </button>
        </p>
      )}
      {layout && files.data && (sectionTitle || files.data.total > 0) && (
        <header className="library-section-heading">
          {sectionTitle && <h2>{sectionTitle}</h2>}
          {files.data.total > 0 && (
            <span>
              {files.data.total} {fileCountLabel(files.data.total)}
            </span>
          )}
        </header>
      )}
      <div className={foldersOnly ? 'file-folder-list' : layout ? 'library-grid asset-feed' : 'library-grid'}>
        {!!trail.length && !query && !selectedTags.length && (
          <article className="file-entry file-parent">
            <button
              type="button"
              className="library-card"
              aria-label="На уровень выше"
              data-tooltip="На уровень выше"
              disabled={busy}
              onClick={() => navigate(trail.slice(0, -1))}
            >
              <div className="library-media">
                <div className="file-folder-icon">
                  <FolderUp size={44} />
                </div>
              </div>
              {layout ? (
                <HistoryCardBody title="Наверх" metadata="Папка" date={trail.at(-2)?.name || 'Библиотека'} />
              ) : (
                <div>
                  <b>Наверх</b>
                  <span>Папка</span>
                  <span className="file-generation-summary" data-tooltip={trail.at(-2)?.name || 'Библиотека'}>
                    {trail.at(-2)?.name || 'Библиотека'}
                  </span>
                </div>
              )}
            </button>
          </article>
        )}
        {files.data?.items.map((file) => {
          const folder = file.type === 'DIRECTORY';
          const incompatible = !folder && !!acceptedTypes && !acceptedTypes.includes(mediaType(file));
          const already = selected.includes(file.linkTo ?? file.id);
          const checked = markedIds.includes(selecting ? file.id : (file.linkTo ?? file.id));
          return (
            <article
              style={previewCardStyle(file.preview)}
              className={`file-entry${incompatible ? ' is-incompatible' : ''}`}
              key={file.id}
            >
              <FileCard
                compact={!!layout}
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
                  data-tooltip="Не подходит для этой задачи"
                >
                  <CircleAlert size={18} aria-hidden="true" />
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
                      data-tooltip={tag}
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
              {busy ? 'Удаление…' : 'Удалить безвозвратно'}
            </button>
          </ModalFooter>
        </Modal>
      )}
      {files.data && !files.data.items.length && (
        <p className="empty-state">
          {query || selectedTags.length
            ? 'По вашему запросу ничего не найдено.'
            : onDestination
              ? 'Папка пуста. Можно выбрать текущую.'
              : foldersOnly
                ? 'Нет вложенных папок. Можно выбрать текущую.'
                : type === 'DOCUMENT'
                  ? 'Документов пока нет. Загрузите первый файл.'
                  : type === 'VIDEO'
                    ? 'Видео пока нет.'
                    : type === 'IMAGE'
                      ? 'Изображений пока нет.'
                      : 'В этой папке пока пусто. Загрузите файлы или создайте папку, чтобы держать материалы под рукой.'}
        </p>
      )}
      {files.data && files.data.pages > 1 && (
        <div className="pagination">
          <button
            type="button"
            className="button"
            aria-label="Предыдущая страница"
            data-tooltip="Предыдущая страница"
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
            data-tooltip="Следующая страница"
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
          className="folder-create-dialog"
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
                ref={(input) => {
                  if (input) input.autofocus = true;
                }}
                required
                minLength={3}
                placeholder="Например, Референсы"
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
                {busy ? 'Сохраняем…' : 'Сохранить папку'}
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}
    </section>
  );
}
