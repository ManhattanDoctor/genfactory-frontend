import { GenerationSummary } from './FileGeneration';
import { UploadButtonContent } from './UploadButtonContent';
import type { IUploadProgress } from '../lib/api';
import { FileTagFilter } from './FileTagFilter';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Folder, Link as LinkIcon, Upload, MoreHorizontal } from 'lucide-react';
import { api } from '../lib/api';
import { directoryPath, folderTrail, mediaType, resolveFile } from '../lib/files';
import type { IGnosisFile } from '../lib/types';
import { useAuth } from '../features/auth/AuthProvider';
import { Media } from './MediaPreview';
import { Modal } from './Modal';
interface IFileBrowserProps {
  onOpen?: (file: IGnosisFile, files: IGnosisFile[]) => void;
  selected?: number[];
  acceptedTypes?: string[];
  foldersOnly?: boolean;
  onCreate?: () => void;
  onDirectory?: (directory: string | null) => void;
}
export function FileBrowser({
  onOpen,
  selected = [],
  acceptedTypes,
  foldersOnly = false,
  onDirectory,
  onCreate,
}: IFileBrowserProps) {
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
  const setTagFilter = (tags: string[]) => {
    setSelectedTags(tags);
    setPage(0);
  };
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<{ kind: 'create' | 'edit' | 'delete' | 'move'; file?: IGnosisFile }>();
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [destination, setDestination] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<IUploadProgress>();
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
    queryFn: () => api.browseFiles(page, directory, query, foldersOnly, type, selectedTags, tagMatch),
    enabled: !!user,
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    onDirectory?.(directory);
  }, [directory, onDirectory]);
  useEffect(() => {
    if (files.data && page > 0 && page >= files.data.pages) setPage(Math.max(0, files.data.pages - 1));
  }, [files.data, page]);
  const refresh = () => cache.invalidateQueries({ queryKey: ['files'] });
  async function run(work: () => Promise<unknown>, message = '') {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      await refresh();
      setAction(undefined);
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить действие.');
    } finally {
      setBusy(false);
    }
  }
  function navigate(items: IGnosisFile[]) {
    setTrail(items);
    setSelectedTags([]);
    setType('');
    setSearch('');
    setQuery('');
    setPage(0);
  }
  function edit(file: IGnosisFile) {
    setName(file.name);
    setTags(file.tags?.join(', ') || '');
    setAction({ kind: 'edit', file });
    setError('');
  }
  async function open(file: IGnosisFile) {
    if (file.type === 'DIRECTORY') {
      if (query || selectedTags.length)
        await run(async () => {
          const folders = await folderTrail(file);
          if (alive.current) navigate(folders);
        });
      else navigate([...trail, file]);
      return;
    }
    await run(async () => {
      const original = await resolveFile(file);
      if (acceptedTypes && !acceptedTypes.includes(original.type))
        throw new Error('Этот тип файла не подходит для выбранной задачи.');
      if (selected.includes(original.id)) throw new Error('Этот файл уже добавлен.');
      if (!alive.current) return;
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
        <button type="button" className="text-button" onClick={() => navigate([])}>
          Все файлы
        </button>
        {!query &&
          !selectedTags.length &&
          trail.map((folder, index) => (
            <span key={folder.id}>
              {' '}
              /{' '}
              <button
                type="button"
                className="text-button"
                onClick={() => navigate(trail.slice(0, index + 1))}
              >
                {folder.name}
              </button>
            </span>
          ))}
        {(query || !!selectedTags.length) && <span> / Результаты поиска во всех папках</span>}
      </nav>
      {!foldersOnly && (
        <div className="file-toolbar">
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
            onClick={() => {
              setName('');
              setAction({ kind: 'create' });
              setError('');
            }}
          >
            <Folder size={16} />
            Новая папка
          </button>
          <button
            type="button"
            className="button"
            disabled={busy || !!query || !!selectedTags.length}
            aria-busy={!!uploadProgress}
            onClick={() => upload.current?.click()}
          >
            <UploadButtonContent busy={!!uploadProgress} progress={uploadProgress}>
              <Upload size={16} />
              Загрузить файл
            </UploadButtonContent>
          </button>
          <input
            hidden
            ref={upload}
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file)
                void run(async () => {
                  try {
                    await api.upload(file, undefined, { directory }, (progress) => {
                      if (alive.current) setUploadProgress(progress);
                    });
                  } finally {
                    if (alive.current) setUploadProgress(undefined);
                  }
                }, 'Файл загружен');
            }}
          />
        </div>
      )}
      {!foldersOnly && (
        <div className="chips" aria-label="Тип файлов">
          {[
            ['', 'Все'],
            ['IMAGE', 'Изображения'],
            ['VIDEO', 'Видео'],
            ['DOCUMENT', 'Документы'],
            ['AUDIO', 'Аудио'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={`chip ${type === value ? 'active' : ''}`}
              aria-pressed={type === value}
              onClick={() => {
                setType(value);
                setPage(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {!foldersOnly && (
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
      {!action && error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {files.isPending && <p role="status">Загружаем файлы…</p>}
      {files.error && (
        <p role="alert">
          {files.error.message}{' '}
          <button type="button" className="text-button" onClick={() => void files.refetch()}>
            Повторить
          </button>
        </p>
      )}
      <div className={foldersOnly ? 'file-folder-list' : 'library-grid'}>
        {files.data?.items.map((file) => {
          const folder = file.type === 'DIRECTORY';
          const incompatible = !folder && !!acceptedTypes && !acceptedTypes.includes(mediaType(file));
          const already = selected.includes(file.linkTo ?? file.id);
          return (
            <article className="file-entry" key={file.id}>
              <button
                type="button"
                className="library-card"
                disabled={busy || incompatible || already}
                onClick={() => void open(file)}
              >
                <div className="library-media">
                  {folder ? (
                    <div className="file-folder-icon">
                      <Folder size={44} />
                    </div>
                  ) : (
                    <Media file={file} />
                  )}
                </div>
                <div>
                  <b title={file.name}>{file.name}</b>
                  <span>
                    {folder ? (
                      'Папка'
                    ) : file.type === 'LINK' ? (
                      <>
                        <LinkIcon size={14} /> Ссылка на файл
                      </>
                    ) : (
                      new Date(file.createdDate).toLocaleDateString('ru-RU')
                    )}
                  </span>
                  <GenerationSummary file={file} />
                  {already && <span>Уже добавлен</span>}
                  {incompatible && <span>Не подходит для этой задачи</span>}
                </div>
              </button>
              {!foldersOnly && !!file.tags?.length && (
                <div className="file-tag-chips" aria-label={`Теги файла ${file.name}`}>
                  {file.tags.map((tag) => (
                    <button
                      type="button"
                      className="chip"
                      key={tag}
                      onClick={() => setTagFilter([tag.trim().toLocaleLowerCase('ru')])}
                      aria-label={`Файлы с тегом ${tag}`}
                      title={tag}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
              {!foldersOnly && file.userId === user?.id && (
                <details className="file-actions">
                  <summary aria-label={`Действия с «${file.name}»`}>
                    <MoreHorizontal size={18} />
                  </summary>
                  <div>
                    <button type="button" className="text-button" disabled={busy} onClick={() => edit(file)}>
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
                          setAction({ kind: 'move', file });
                        }}
                      >
                        Переместить
                      </button>
                    )}
                    {!folder && file.type !== 'LINK' && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => api.createFileLink(file.id, file.directory || null),
                            'Ссылка создана рядом с оригиналом',
                          )
                        }
                      >
                        Создать ссылку
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => {
                        setError('');
                        setAction({ kind: 'delete', file });
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </div>
      {files.data && !files.data.items.length && !directory && !query && onCreate && (
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
            : 'В этой папке пока нет файлов.'}
        </p>
      )}
      {files.data && files.data.pages > 1 && (
        <div className="pagination">
          <button
            type="button"
            className="button"
            disabled={!page || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            Назад
          </button>
          <span>
            {page + 1} / {files.data.pages}
          </span>
          <button
            type="button"
            className="button"
            disabled={page + 1 >= files.data.pages || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            Далее
          </button>
        </div>
      )}
      {action && (
        <Modal
          title={
            action.kind === 'create'
              ? 'Новая папка'
              : action.kind === 'edit'
                ? 'Название и теги'
                : action.kind === 'move'
                  ? 'Переместить файл'
                  : 'Удалить файл'
          }
          onClose={() => {
            if (!busy) setAction(undefined);
          }}
          wide={action.kind === 'move'}
        >
          <form
            className="file-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (action.kind === 'create') await api.createDirectory(name.trim(), directory);
                if (action.kind === 'edit')
                  await api.editFile(action.file!.id, {
                    name: name.trim(),
                    tags: [
                      ...new Set(
                        tags
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean),
                      ),
                    ],
                  });
                if (action.kind === 'delete') await api.removeFile(action.file!.id);
                if (action.kind === 'move') await api.editFile(action.file!.id, { directory: destination });
              }, 'Готово');
            }}
          >
            {(action.kind === 'create' || action.kind === 'edit') && (
              <label>
                Название
                <input
                  autoFocus
                  required
                  minLength={3}
                  maxLength={124}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
              </label>
            )}
            {action.kind === 'edit' && (
              <label>
                Теги через запятую
                <input value={tags} onChange={(e) => setTags(e.target.value)} disabled={busy} />
              </label>
            )}
            {action.kind === 'delete' && (
              <p>
                {action.file?.type === 'DIRECTORY'
                  ? 'Папка и всё её содержимое будут удалены без возможности восстановления.'
                  : action.file?.type === 'LINK'
                    ? 'Будет удалена только ссылка. Оригинал останется.'
                    : 'Файл и его превью будут удалены без возможности восстановления. Он станет недоступен в задачах, где использовался.'}{' '}
                «{action.file?.name}»
              </p>
            )}
            {action.kind === 'move' && (
              <>
                <p>Откройте папку назначения или оставьте «Все файлы» для переноса в корень.</p>
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
                disabled={
                  busy || ((action.kind === 'create' || action.kind === 'edit') && name.trim().length < 3)
                }
              >
                {busy
                  ? 'Сохраняем…'
                  : action.kind === 'delete'
                    ? 'Удалить'
                    : action.kind === 'move'
                      ? 'Переместить сюда'
                      : 'Сохранить'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
