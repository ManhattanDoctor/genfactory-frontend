import { bananaRatios, bananaDescription } from './bananaSettings';
import './banana-workspace.css';
import { videoRatios, videoLengths, videoSound, videoShapes } from './videoMenus';
import { VideoTemplateMedia, VideoViewer, VideoModelInfo } from './VideoMedia';
import '../catalog/model-favorites.css';
import { readRecipes, variantGroups, type IGenerationRecipe } from './variants';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ArrowUp,
  Plus,
  Check,
  X,
  Pencil,
  Download,
  RotateCcw,
  Expand,
  Heart,
  ChevronDown,
  Info,
} from 'lucide-react';
import { api, safeMediaUrl } from '../../lib/api';
import type { IConversation, IGnosisFile, IModelDescription, MediaKind } from '../../lib/types';
import { modelKey, modelTitle, modelSummary } from '../catalog/presentation';
import { choices, ratioSizes, sizeRatio, suggestedRatios } from '../content-studio/controls';
import templates from '../content-studio/templates.json';
import type { ITemplate } from '../content-studio/materials';

import { ModelMark } from '../content-studio/ModelMark';
import { useAuth } from '../auth/AuthProvider';
import { usePreferences, toggleItem } from '../workspace/preferences';
import { Media } from '../../components/MediaPreview';
import { HomeImageViewer } from '../../app/HomeImageViewer';
import { displayMessageText } from './conversations';
import { useConversationRoom } from '../realtime/RealtimeProvider';
import { useConversationProgress } from './useConversationProgress';
import { toolLabel } from './progress';
import './image-workspace.css';

export function MediaWorkspace({
  kind,
  variant,
  shape = 'single',
  onShape,
  models,
  model,
  options,
  prompt,
  templateId,
  templateText,
  onTemplateText,
  onTemplate,
  references,
  conversation,
  busy,
  unavailable,
  retryCatalog,
  error,
  onPrompt,
  onModel,
  onOptions,
  onReferences,
  onLibrary,
  onSubmit,
  onRepeat,
  promptInput,
  children,
}: {
  kind: MediaKind;
  variant?: 'banana';
  shape?: string;
  onShape?: (value: string) => void;
  models: IModelDescription[];
  model?: IModelDescription;
  options: Record<string, unknown>;
  prompt: string;
  templateId: string;
  templateText: string;
  onTemplateText: (value: string) => void;
  onTemplate: (value: string) => void;
  references: IGnosisFile[];
  conversation?: IConversation;
  busy: boolean;
  unavailable?: boolean;
  retryCatalog?: () => void;
  error: string;
  onPrompt: (value: string) => void;
  onModel: (model: IModelDescription) => void;
  onOptions: (value: Record<string, unknown>) => void;
  onReferences: (value: IGnosisFile[]) => void;
  onLibrary: () => void;
  onSubmit: () => void;
  onRepeat: (file: IGnosisFile, input?: IGenerationRecipe['workspaceInput']) => void;
  promptInput: RefObject<HTMLTextAreaElement | null>;
  children?: ReactNode;
}) {
  const video = kind === 'video';
  const banana = variant === 'banana';
  const outputType = video ? 'VIDEO' : 'IMAGE';
  const imageTemplates = templates.filter((item) => item.kind === kind);
  useConversationRoom(conversation?.id);
  const { user } = useAuth();
  const prefs = usePreferences();
  const root = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLFormElement>(null);
  const [columns, setColumns] = useState(4);
  const [bottom, setBottom] = useState(234);
  const selected = imageTemplates.find((item) => item.id === templateId);
  const [editing, setEditing] = useState(false);
  const templateInput = useRef<HTMLTextAreaElement>(null);
  const focusTemplateInput = () => {
    const area = templateInput.current;
    if (!area) return;
    area.setSelectionRange(area.value.length, area.value.length);
    area.focus();
    area.scrollTop = area.scrollHeight;
  };
  const [templateError, setTemplateError] = useState('');
  useEffect(() => {
    setEditing(false);
    setTemplateError('');
  }, [templateId]);
  useEffect(() => {
    if (editing) focusTemplateInput();
  }, [editing]);
  useEffect(() => {
    setTemplateError('');
  }, [templateText, references.length]);
  const [notice, setNotice] = useState('');
  const downloading = useRef(new Set<number>());
  const [downloadIds, setDownloadIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<{ file: IGnosisFile; rect: DOMRect }>();
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [conversation?.id, busy]);
  const messages = useQuery({
    queryKey: ['messages', conversation?.userId, conversation?.id, page],
    queryFn: ({ signal }) => api.messages(conversation!.id, page, signal),
    enabled: !!conversation,
    refetchInterval: busy ? 2000 : false,
  });
  const history = useInfiniteQuery({
    queryKey: ['files', user?.id, `${kind}-wall`],
    enabled: !!user,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.mediaFiles(outputType, pageParam, signal),
    getNextPageParam: (last) => (last.pageIndex + 1 < last.pages ? last.pageIndex + 1 : undefined),
  });
  const historicalFiles =
    history.data?.pages
      .flatMap((page) => page.items)
      .filter(
        (file) =>
          file.userId === user?.id &&
          file.type === outputType &&
          file.origin?.kind === 'GENERATION' &&
          (!banana || /gemini.*(image|banana)/i.test(file.origin.generation?.model.model || '')),
      ) || [];
  const files = [
    ...new Map(
      [
        ...historicalFiles,
        ...(messages.data?.items || [])
          .filter((message) => message.role === 'ASSISTANT')
          .flatMap((message) => message.files || [])
          .filter((file) => file.type === outputType && file.userId === user?.id),
      ].map((file) => [file.id, file]),
    ).values(),
  ].sort((a, b) => Date.parse(b.createdDate) - Date.parse(a.createdDate) || b.id - a.id);
  const repeatInput = (file: IGnosisFile) => {
    if (!user || !conversation) return;
    const group = variantGroups(
      [...(messages.data?.items || [])].sort((a, b) => a.id - b.id),
      user.id,
    ).find((group) => group.outputs.some((output) => output.id === file.id));
    if (!group) return;
    const input =
      readRecipes(user.id, conversation.id)[group.request.id]?.workspaceInput ||
      readRecipes(user.id, conversation.id)[group.request.id]?.imageInput;
    return input &&
      typeof input.idea === 'string' &&
      typeof input.templateId === 'string' &&
      typeof input.templateText === 'string'
      ? input
      : undefined;
  };
  const nextPage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const marker = nextPage.current;
    if (!marker || !history.hasNextPage || history.isFetchingNextPage || history.error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void history.fetchNextPage();
      },
      { root: root.current?.querySelector('.img-wall'), rootMargin: '400px' },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [history.hasNextPage, history.isFetchingNextPage, history.error, files.length]);

  const latestAnswer = messages.data?.items.find((message) => message.role === 'ASSISTANT');
  const text =
    (video && busy) || latestAnswer?.files?.some((file) => file.type === outputType)
      ? undefined
      : latestAnswer?.text;
  useEffect(() => {
    const measure = () => {
      const width = root.current?.clientWidth || innerWidth;
      setColumns(width < 560 ? 1 : width < 900 ? 2 : width < 1280 ? 4 : 5);
      setBottom((dock.current?.offsetHeight || 146) + 88);
    };
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    if (dock.current) observer.observe(dock.current);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const input = promptInput.current;
    if (input) {
      input.style.height = '72px';
      input.style.height = `${Math.min(122.4, Math.max(72, input.scrollHeight))}px`;
    }
  }, [prompt, promptInput]);
  const fields = model?.schema.properties?.options?.properties || {};
  const sizes = ratioSizes(model);
  const ratios = fields.aspectRatio ? choices(fields.aspectRatio, suggestedRatios) : [...sizes.keys()];
  if (typeof options.size === 'string' && !fields.aspectRatio && !sizes.has(sizeRatio(options.size))) {
    sizes.set(sizeRatio(options.size), options.size);
    ratios.push(sizeRatio(options.size));
  }
  const ratio = String(options.aspectRatio || (options.size ? sizeRatio(String(options.size)) : ''));
  const qualityKey = fields.resolution
    ? 'resolution'
    : fields.quality
      ? 'quality'
      : fields.imageSize
        ? 'imageSize'
        : '';
  const quality = qualityKey
    ? choices(fields[qualityKey], [String(fields[qualityKey].default || '')].filter(Boolean))
    : [];
  const chooseRatio = (value: string) =>
    onOptions({ ...options, ...(fields.aspectRatio ? { aspectRatio: value } : { size: sizes.get(value) }) });
  const applyTemplate = (item: ITemplate) => {
    if (busy || selected?.id === item.id) return;
    onTemplate(item.id);
    onTemplateText(item.prompt);
    if (ratios.includes(item.ratio)) chooseRatio(item.ratio);
  };
  const submitTemplate = () => {
    if (selected) {
      if (!templateText.trim()) {
        setTemplateError('Введите текст шаблона или уберите его.');
        setEditing(true);
        return;
      }
    }
    onSubmit();
  };
  const download = async (file: IGnosisFile) => {
    if (downloading.current.has(file.id)) return;
    downloading.current.add(file.id);
    setDownloadIds([...downloading.current]);
    setNotice('');
    try {
      const blob = await api.downloadFile(file.id),
        url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice('Не удалось скачать файл. Попробуйте ещё раз.');
    } finally {
      downloading.current.delete(file.id);
      setDownloadIds([...downloading.current]);
    }
  };
  const cards: ReactNode[] = [
    ...(busy
      ? [
          <div
            key="pending"
            className="image-result-pending"
            role="status"
            style={{ aspectRatio: (ratio || '1:1').replace(':', ' / ') }}
          >
            <span className="img-spin" aria-hidden="true" />
            {conversation ? (
              <ImageProgress conversation={conversation} kind={kind} />
            ) : video ? (
              'Создаём видео…'
            ) : (
              'Создаём изображение…'
            )}
          </div>,
        ]
      : []),
    ...(video && !busy && conversation?.status === 'ERROR'
      ? [
          <article key="failed" className="img-tile video-result-failed" role="alert">
            <img src="/media/prototype/content/video/fail-cry.jpg" alt="Ролик не собрался" />
            <p className="video-failure-note">Ролик не собрался.</p>
          </article>,
        ]
      : []),
    ...files.map((file) => (
      <article className={`img-tile image-result ${video ? 'video-result' : ''}`} key={`file:${file.id}`}>
        <button
          type="button"
          className="image-result-open"
          aria-label={`Открыть ${file.name}`}
          onClick={(e) => setPreview({ file, rect: e.currentTarget.getBoundingClientRect() })}
        >
          <Media file={file} />
        </button>
        <div className="img-actions">
          <button
            type="button"
            aria-label={`Открыть ${file.name}`}
            onClick={(e) =>
              setPreview({ file, rect: e.currentTarget.closest('article')!.getBoundingClientRect() })
            }
          >
            <Expand size={18} />
          </button>
          <button
            type="button"
            aria-label={`Скачать ${file.name}`}
            disabled={downloadIds.includes(file.id)}
            aria-busy={downloadIds.includes(file.id)}
            title="Скачать"
            onClick={() => void download(file)}
          >
            <Download size={18} />
          </button>
          <button
            type="button"
            aria-label={`Переделать ${file.name}`}
            title="Переделать"
            disabled={busy}
            onClick={() => onRepeat(file, repeatInput(file))}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </article>
    )),
    ...(history.hasNextPage
      ? [
          <div key="next-page" ref={nextPage} className="image-history-loader" role="status">
            {history.error ? (
              <button type="button" onClick={() => void history.fetchNextPage()}>
                Загрузить ещё
              </button>
            ) : video ? (
              'Загружаем видео…'
            ) : (
              'Загружаем изображения…'
            )}
          </div>,
        ]
      : []),
    ...(banana ? [] : imageTemplates).map((item, index) => (
      <button
        type="button"
        key={item.id}
        className={`img-tile ds-template-card ${selected?.id === item.id ? 'is-on' : ''}`}
        aria-label={item.title}
        aria-pressed={selected?.id === item.id}
        disabled={busy}
        onClick={() => applyTemplate(item)}
      >
        <span className="img-card" style={{ aspectRatio: item.ratio.replace(':', ' / ') }}>
          {video ? (
            <VideoTemplateMedia item={item} />
          ) : (
            <img
              className="img-face"
              src={item.src}
              alt=""
              loading={index < columns * 2 ? 'eager' : 'lazy'}
              draggable={false}
            />
          )}
          <span className="img-cap">
            <span>{item.genre}</span>
            <strong>{item.title}</strong>
          </span>
          <span className="img-use" aria-hidden="true">
            {!video && selected?.id === item.id ? <Check size={18} /> : <Plus size={18} />}
            <span>{selected?.id === item.id ? 'Выбран' : 'Добавить'}</span>
          </span>
        </span>
      </button>
    )),
  ];
  return (
    <section
      className={`image-workspace ${video ? 'video-workspace' : ''} ${banana ? 'banana-workspace' : ''}`}
      ref={root}
      aria-label={banana ? 'Nano Banana' : video ? 'Видео' : 'Изображения'}
    >
      <div
        className="img-wall"
        aria-label={banana ? 'Кадры Nano Banana' : video ? 'Шаблоны и видео' : 'Шаблоны и изображения'}
      >
        {banana && !files.length && !busy && (
          <div className="banana-brand" aria-hidden="true">
            <img src="/media/prototype/banana.webp" alt="" />
            <span>Nano Banana</span>
          </div>
        )}
        {(text || messages.error || (messages.data?.pages || 0) > 1) && (
          <div className="image-conversation-note">
            {text && <p>{displayMessageText(text)}</p>}
            {messages.error && (
              <p role="alert">
                Не удалось загрузить результаты.{' '}
                <button onClick={() => void messages.refetch()}>Повторить</button>
              </p>
            )}
            {(messages.data?.pages || 0) > 1 && (
              <nav aria-label="Страницы результатов">
                <button disabled={!page} onClick={() => setPage(page - 1)}>
                  Назад
                </button>
                <span>{page + 1}</span>
                <button disabled={page + 1 >= messages.data!.pages} onClick={() => setPage(page + 1)}>
                  Далее
                </button>
              </nav>
            )}
          </div>
        )}
        <div className="img-masonry" style={{ paddingBottom: bottom }}>
          {Array.from({ length: columns }, (_, col) => (
            <div className="img-col" key={col}>
              {cards.filter((_, index) => index % columns === col)}
            </div>
          ))}
        </div>
      </div>
      <form
        className="img-dock"
        ref={dock}
        onSubmit={(e) => {
          e.preventDefault();
          submitTemplate();
        }}
      >
        <div className="cw-field">
          {(selected || references.length > 0) && (
            <div className="img-files">
              {references.map((file) => (
                <div className="img-file" key={file.id}>
                  <div className="img-thumb">
                    <Media file={file} />
                    <button
                      type="button"
                      className="img-thumb-x"
                      aria-label={`Убрать ${file.name}`}
                      disabled={busy}
                      onClick={() => onReferences(references.filter((f) => f.id !== file.id))}
                    >
                      {video ? '×' : <X size={16} />}
                    </button>
                  </div>
                </div>
              ))}
              {selected && (
                <div className="img-file is-template">
                  <div className="img-thumb">
                    <img
                      src={video ? selected.src.replace(/\.mp4$/, '.jpg') : selected.src}
                      alt={selected.title}
                    />
                    <button
                      type="button"
                      className="img-thumb-x"
                      aria-label="Убрать шаблон"
                      onClick={() => {
                        onTemplate('');
                        onTemplateText('');
                        promptInput.current?.focus();
                      }}
                    >
                      {video ? '×' : <X size={16} />}
                    </button>
                  </div>
                  {!video && (
                    <button
                      type="button"
                      className="img-file-edit"
                      aria-label="Редактировать шаблон"
                      onClick={() => {
                        setEditing(true);
                        templateInput.current?.focus();
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  {editing && (
                    <div className="img-template-editor">
                      <textarea
                        ref={templateInput}
                        aria-label="Текст шаблона"
                        value={templateText}
                        disabled={busy}
                        onChange={(event) => onTemplateText(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <textarea
            ref={promptInput}
            id={banana ? 'nb-draft' : video ? 'vd-draft' : 'img-draft'}
            aria-label={video ? 'Идея ролика' : 'Идея'}
            rows={3}
            value={prompt}
            onChange={(e) => onPrompt(e.target.value)}
            placeholder={
              video
                ? 'Опишите ролик. Если есть стартовый кадр, укажите, что должно произойти и что сохранить'
                : 'Опишите результат. Если редактируете изображение, укажите, что изменить и что сохранить'
            }
          />
        </div>
        <div className="img-tools">
          <button
            className="cw-plus"
            type="button"
            aria-label={video ? 'Добавить кадр' : 'Добавить изображение'}
            disabled={busy || (!!user && !model)}
            onClick={onLibrary}
          >
            <Plus size={20} />
          </button>
          <ImageMenu
            label={model ? modelTitle(model) : banana ? 'Nano Banana 2' : 'Выбрать модель'}
            name="Модель"
            disabled={busy}
            models={models}
            details={video || banana}
            infoKind={kind}
            describeModel={banana ? bananaDescription : undefined}
            selection={model && modelKey(model)}
            favorites={prefs.value.favoriteModels}
            onFavorite={(key) =>
              prefs.update((value) => ({ ...value, favoriteModels: toggleItem(value.favoriteModels, key) }))
            }
            onSelect={(key) => {
              const chosen = models.find((m) => modelKey(m) === key);
              if (chosen) onModel(chosen);
            }}
          />
          {(!!ratios.length || banana) && (
            <ImageMenu
              label={ratio || (banana ? (user ? 'Не задаётся' : '1:1') : 'Стороны')}
              name="Стороны"
              note={
                banana
                  ? 'Форма картинки: квадрат, вертикаль или ширина.'
                  : video
                    ? 'Форма кадра: вертикаль, квадрат или ширина.'
                    : undefined
              }
              descriptions={video ? videoRatios : undefined}
              values={banana ? [...new Set([...bananaRatios, ...ratios])] : ratios}
              allowedValues={banana ? ratios : undefined}
              ratioIcons={banana}
              selection={ratio}
              disabled={busy || !ratios.length}
              onSelect={chooseRatio}
            />
          )}
          {!video && (!!quality.length || banana) && (
            <ImageMenu
              label={String(options[qualityKey] || quality[0] || (user ? 'Не задаётся' : '1K'))}
              name={banana ? 'Размер' : 'Качество'}
              note={banana ? 'Крупность файла. 1K быстрее, 4K детальнее.' : undefined}
              values={quality.map(String)}
              selection={String(options[qualityKey])}
              disabled={busy || !quality.length}
              onSelect={(value) => onOptions({ ...options, [qualityKey]: value })}
            />
          )}
          {video && (
            <>
              <ImageMenu
                label={options.duration ? `${options.duration} с` : 'Не задаётся'}
                name="Длительность"
                note="Длина ролика. От неё зависит, сколько секунд соберёт модель."
                descriptions={{
                  ...videoLengths,
                  ...(Math.max(...choices(fields.duration, [4, 6, 8, 10, 15]).map(Number)) <= 15
                    ? { '15 с': 'Самый длинный ролик в этом окне.' }
                    : {}),
                }}
                values={choices(fields.duration, [4, 6, 8, 10, 15]).map((v) => `${v} с`)}
                selection={`${options.duration} с`}
                disabled={busy || !fields.duration}
                onSelect={(value) => onOptions({ ...options, duration: Number(value.split(' ')[0]) })}
              />
              <ImageMenu
                label={options.generateAudio ? 'Со звуком' : 'Без звука'}
                name="Звук"
                note="Звук ролика."
                descriptions={videoSound}
                values={choices(fields.generateAudio, [false, true]).map((value) =>
                  value ? 'Со звуком' : 'Без звука',
                )}
                selection={options.generateAudio ? 'Со звуком' : 'Без звука'}
                disabled={busy || choices(fields.generateAudio, [false, true]).length < 2}
                onSelect={(value) => onOptions({ ...options, generateAudio: value === 'Со звуком' })}
              />
              <ImageMenu
                label={shape === 'sequence' ? 'Набор сцен' : 'Один кадр'}
                name="Структура ролика"
                note="Как собрать ролик внутри выбранной длины. На выходе всегда один файл."
                descriptions={videoShapes}
                values={['Один кадр', 'Набор сцен']}
                selection={shape === 'sequence' ? 'Набор сцен' : 'Один кадр'}
                disabled={busy}
                onSelect={(value) => onShape?.(value === 'Набор сцен' ? 'sequence' : 'single')}
              />
            </>
          )}
          <button
            className="cw-send"
            type="submit"
            aria-label={video ? 'Собрать видео' : 'Собрать изображение'}
            disabled={
              busy ||
              unavailable ||
              (!prompt.trim() && !selected && !((video || banana) && references.length))
            }
          >
            {busy ? <span className="spinner" /> : <ArrowUp size={20} />}
          </button>
        </div>
        {(templateError || error || notice || prefs.error || history.error) && (
          <p className="img-guard" role="alert">
            {templateError ||
              error ||
              notice ||
              prefs.error ||
              (history.error ? `Не удалось загрузить историю ${video ? 'видео' : 'изображений'}.` : '')}
            {retryCatalog && (
              <button type="button" onClick={retryCatalog}>
                Загрузить снова
              </button>
            )}
          </p>
        )}
      </form>
      {video && preview && (
        <VideoViewer key={preview.file.id} file={preview.file} onClose={() => setPreview(undefined)} />
      )}
      {!video && preview && safeMediaUrl(preview.file.path) && (
        <HomeImageViewer
          image={{
            src: safeMediaUrl(preview.file.path)!,
            alt: preview.file.name,
            preview:
              preview.file.preview?.image?.status === 'READY'
                ? safeMediaUrl(preview.file.preview.image.url)
                : undefined,
          }}
          from={preview.rect}
          onClose={() => setPreview(undefined)}
        />
      )}
      {children}
    </section>
  );
}

function ImageMenu({
  label,
  name,
  values = [],
  models,
  selection,
  disabled,
  onSelect,
  favorites = [],
  details = false,
  note,
  descriptions,
  allowedValues,
  ratioIcons,
  infoKind,
  describeModel,
  onFavorite,
}: {
  label: string;
  name: string;
  values?: string[];
  models?: IModelDescription[];
  selection?: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
  favorites?: string[];
  details?: boolean;
  note?: string;
  descriptions?: Record<string, string>;
  allowedValues?: string[];
  ratioIcons?: boolean;
  infoKind?: MediaKind;
  describeModel?: (model: IModelDescription) => string;
  onFavorite?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<IModelDescription>();
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !note) return;
    const menu = root.current?.querySelector<HTMLElement>('.cw-model-menu');
    if (!menu) return;
    const fit = () => {
      menu.style.transform = '';
      const box = menu.getBoundingClientRect();
      const offset = Math.min(0, innerWidth - 16 - box.right) + Math.max(0, 16 - box.left);
      menu.style.transform = `translateX(${offset}px)`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [open, note]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const choose = (value: string) => {
    onSelect(value);
    setOpen(false);
    root.current?.querySelector('button')?.focus();
  };
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const visible = models?.filter((model) => !onlyFavorites || favorites.includes(modelKey(model)));
  return (
    <div
      className={`image-menu ${note ? 'video-setting-menu' : ''} ${models ? 'image-model-menu' : ''}`}
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          setOpen(false);
          root.current?.querySelector('button')?.focus();
        }
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault();
          setOpen(true);
          requestAnimationFrame(() => {
            const items = [...(root.current?.querySelectorAll<HTMLElement>('[role=option]') || [])];
            const index = items.indexOf(document.activeElement as HTMLElement);
            items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
          });
        }
      }}
    >
      <button
        type="button"
        className="cw-chip"
        aria-label={name}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
          setOnlyFavorites(false);
        }}
      >
        {label}
        {models && <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="cw-model-menu" role="listbox" aria-label={name}>
          {note && <p className="image-menu-note">{note}</p>}
          {models && (
            <button
              type="button"
              className="content-model-filter"
              aria-pressed={onlyFavorites}
              onClick={() => setOnlyFavorites(!onlyFavorites)}
            >
              Избранные
            </button>
          )}
          {visible?.map((model) => (
            <div
              className="image-model-row"
              role="option"
              tabIndex={0}
              aria-label={modelTitle(model)}
              aria-selected={selection === modelKey(model)}
              key={modelKey(model)}
              onClick={() => {
                choose(modelKey(model));
              }}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
                  event.preventDefault();
                  choose(modelKey(model));
                }
              }}
            >
              <ModelMark id={model.reference.model} />
              <span className="image-model-copy">
                <strong>
                  {modelTitle(model)}
                  {details && (
                    <button
                      className="video-model-about"
                      type="button"
                      aria-label={`О модели ${modelTitle(model)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setInfo(model);
                      }}
                    >
                      <Info size={14} />
                    </button>
                  )}
                </strong>
                <small>{describeModel ? describeModel(model) : modelSummary(model)}</small>
              </span>
              <button
                className="image-favorite"
                type="button"
                aria-label={`${favorites.includes(modelKey(model)) ? 'Убрать из избранных' : 'В избранные'}: ${modelTitle(model)}`}
                aria-pressed={favorites.includes(modelKey(model))}
                onClick={(event) => {
                  event.stopPropagation();
                  onFavorite?.(modelKey(model));
                }}
              >
                <Heart size={16} fill={favorites.includes(modelKey(model)) ? 'currentColor' : 'none'} />
              </button>
              <i className="image-choice-mark" aria-hidden="true" />
            </div>
          ))}
          {models && !visible?.length && (
            <p className="image-menu-note">
              {onlyFavorites ? 'Нет избранных моделей.' : 'Модели недоступны'}
            </p>
          )}
          {!models &&
            values.map((value) => (
              <button
                className={`image-option ${ratioIcons ? 'banana-ratio-option' : ''}`}
                type="button"
                role="option"
                aria-selected={value === selection}
                aria-label={value}
                disabled={allowedValues && !allowedValues.includes(value)}
                key={value}
                onClick={() => {
                  choose(value);
                }}
              >
                {ratioIcons && (
                  <span className="banana-ratio-frame" aria-hidden="true">
                    <i
                      style={{
                        width: Math.max(
                          3,
                          Math.round(
                            Math.min(32 / Number(value.split(':')[0]), 24 / Number(value.split(':')[1])) *
                              Number(value.split(':')[0]),
                          ),
                        ),
                        height: Math.max(
                          3,
                          Math.round(
                            Math.min(32 / Number(value.split(':')[0]), 24 / Number(value.split(':')[1])) *
                              Number(value.split(':')[1]),
                          ),
                        ),
                      }}
                    />
                  </span>
                )}
                {descriptions ? (
                  <span className="video-option-copy">
                    <strong>{value}</strong>
                    {descriptions[value] && <small>{descriptions[value]}</small>}
                  </span>
                ) : (
                  value
                )}
                <i className="image-choice-mark" aria-hidden="true" />
              </button>
            ))}
        </div>
      )}
      {info && <VideoModelInfo kind={infoKind} model={info} onClose={() => setInfo(undefined)} />}
    </div>
  );
}

function ImageProgress({ conversation, kind }: { conversation: IConversation; kind: MediaKind }) {
  const progress = useConversationProgress(conversation);
  return (
    <span>
      {progress.tools.length
        ? progress.tools.map((tool, index) => <span key={index}>{toolLabel(tool)}</span>)
        : kind === 'video'
          ? 'Создаём видео…'
          : 'Создаём изображение…'}
    </span>
  );
}
