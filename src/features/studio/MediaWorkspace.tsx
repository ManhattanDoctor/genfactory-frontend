import { Skeleton } from '../../components/Skeleton';
import { supportsVideoReferences } from '../catalog/videoInputs';
import { downloadFile } from '../../lib/files';
import { TemplateEditor } from '../content-studio/TemplateEditor';
import { templateVariables } from '../content-studio/templateRecipe';
import { ComposerAttachment } from '../../components/ComposerAttachment';
import { GenerationElapsed } from '../../components/GenerationElapsed';
import { ModelTitleWithInfo } from '../catalog/ModelTitleWithInfo';
import { useComposerMenu } from '../../components/useComposerMenu';
import { followsReferenceRatio } from '../catalog/schema';
import { bananaRatios, bananaDescription } from './bananaSettings';
import './banana-workspace.css';
import './seedance-workspace.css';
import { videoRatios, videoLengths, videoSound, videoShapes } from './videoMenus';
import { VideoTemplateMedia, VideoModelInfo } from './VideoMedia';
import '../catalog/model-favorites.css';
import { readFileRecipe, readRecipes, variantGroups, type IGenerationRecipe } from './variants';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ArrowUp,
  Plus,
  Check,
  Pencil,
  Download,
  RotateCcw,
  Expand,
  Heart,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Info,
} from 'lucide-react';
import { api, safeMediaUrl } from '../../lib/api';
import type { IConversation, IGnosisFile, IModelDescription, MediaKind } from '../../lib/types';
import { favoritesFirst, modelKey, modelTitle, modelSummary } from '../catalog/presentation';
import { useConversationError } from './useConversationError';
import { choices, ratioSizes, sizeRatio, suggestedRatios } from '../content-studio/controls';
import templates from '../content-studio/templates.json';
import type { ITemplate } from '../content-studio/materials';

import { ModelMark } from '../content-studio/ModelMark';
import { useAuth } from '../auth/AuthProvider';
import { usePreferences, toggleItem } from '../workspace/preferences';
import { Media, MediaPreview } from '../../components/MediaPreview';
import { Modal } from '../../components/Modal';
import { Masonry } from '../../components/Masonry';
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
  contextError,
  busy,
  pendingCount = 0,
  pendingTasks = [],
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
  variant?: 'banana' | 'seedance';
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
  contextError?: string;
  busy: boolean;
  pendingCount?: number;
  pendingTasks?: Array<{ id: string; createdDate: string }>;
  unavailable?: boolean;
  retryCatalog?: () => void;
  error: string;
  onPrompt: (value: string) => void;
  onModel: (model: Pick<IModelDescription, 'reference'>, templateOptions?: Record<string, unknown>) => void;
  onOptions: (value: Record<string, unknown>) => void;
  onReferences: (value: IGnosisFile[]) => void;
  onLibrary: () => void;
  onSubmit: (onStarted: () => void) => void;
  onRepeat: (file: IGnosisFile, input?: IGenerationRecipe['workspaceInput']) => void;
  promptInput: RefObject<HTMLTextAreaElement | null>;
  children?: ReactNode;
}): ReactElement {
  const video = kind === 'video';
  const banana = variant === 'banana';
  const seedance = variant === 'seedance';
  const outputType = video ? 'VIDEO' : 'IMAGE';
  const generating = busy || pendingCount > 0;
  const imageTemplates = templates.filter((item) => item.kind === kind);
  useConversationRoom(conversation?.id);
  const { user } = useAuth();
  const prefs = usePreferences();
  const root = useRef<HTMLDivElement>(null);
  const wall = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const element = root.current;
    if (!viewport || !element) return;
    const fit = (): void => {
      element.style.setProperty('--media-viewport-height', `${viewport.height}px`);
      element.style.setProperty('--media-viewport-top', `${viewport.offsetTop}px`);
    };
    fit();
    viewport.addEventListener('resize', fit);
    viewport.addEventListener('scroll', fit);
    return () => {
      viewport.removeEventListener('resize', fit);
      viewport.removeEventListener('scroll', fit);
    };
  }, []);
  const [columns, setColumns] = useState(4);
  const [bottom, setBottom] = useState(234);
  const selected = imageTemplates.find((item) => item.id === templateId);
  const [editingTemplate, setEditingTemplate] = useState<ITemplate>();
  const [templateImageMinimum, setTemplateImageMinimum] = useState(0);
  useEffect(() => {
    setTemplateImageMinimum(0);
  }, [kind, conversation?.id]);
  useEffect(() => {
    if (!prompt.trim()) setTemplateImageMinimum(0);
  }, [prompt]);
  const needsTemplateImages = !!prompt.trim() && references.length < templateImageMinimum;
  const [notice, setNotice] = useState('');
  const conversationError = useConversationError(conversation);
  const [answerView, setAnswerView] = useState<string>();
  useEffect(() => setAnswerView(undefined), [conversation?.id]);
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
    refetchInterval: conversation?.status === 'LOADING' ? 5000 : false,
  });
  const latestMessage = [...(messages.data?.items || [])]
    .filter((message) => message.role !== 'COMMAND')
    .sort((a, b) => b.id - a.id)[0];
  const startedAt = latestMessage?.role === 'USER' ? latestMessage.createdDate : undefined;
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
          (!banana || /gemini.*(image|banana)/i.test(file.origin.generation?.model.model || '')) &&
          (!seedance || /seedance/i.test(file.origin.generation?.model.model || '')),
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
    if (user) {
      const recipe = readFileRecipe(user.id, file.id);
      if (recipe?.workspaceInput) return recipe.workspaceInput;
    }
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

  const latestAnswer = latestMessage?.role === 'ASSISTANT' ? latestMessage : undefined;
  const text =
    generating || latestAnswer?.files?.some((file) => file.type === outputType)
      ? undefined
      : latestAnswer?.text;
  useEffect(() => {
    const measure = () => {
      const width = root.current?.clientWidth || innerWidth;
      setColumns(width < 900 ? 2 : width < 1280 ? 4 : 5);
      const dockOffset = dock.current ? Number.parseFloat(getComputedStyle(dock.current).bottom) : 72;
      setBottom((dock.current?.offsetHeight || 146) + dockOffset + 16);
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
    }
  }, [prompt, promptInput]);
  const fields = model?.schema.properties?.options?.properties || {};
  const sizes = ratioSizes(model);
  const ratios = fields.aspectRatio ? choices(fields.aspectRatio, suggestedRatios) : [...sizes.keys()];
  if (typeof options.size === 'string' && !fields.aspectRatio && !sizes.has(sizeRatio(options.size))) {
    sizes.set(sizeRatio(options.size), options.size);
    ratios.push(sizeRatio(options.size));
  }
  const referenceRatio = followsReferenceRatio(model, references.length);
  const ratio = referenceRatio
    ? ''
    : String(options.aspectRatio || (options.size ? sizeRatio(String(options.size)) : ''));
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
  const [templateGlowActive, setTemplateGlowActive] = useState(false);
  const templateGlowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(templateGlowTimer.current), []);
  const applyTemplateText = (item: ITemplate, text: string): void => {
    if (item.model)
      onModel(
        { reference: item.model },
        {
          ...(typeof options.duration === 'number' ? { duration: options.duration } : {}),
          ...(item.duration ? { duration: item.duration } : {}),
        },
      );
    clearTimeout(templateGlowTimer.current);
    setTemplateGlowActive(true);
    templateGlowTimer.current = setTimeout(() => setTemplateGlowActive(false), 1000);
    setTemplateImageMinimum(Math.max(1, item.references?.min ?? 0));

    onTemplate('');
    onTemplateText('');
    onPrompt(text);
    setNotice('');
    setEditingTemplate(undefined);
    requestAnimationFrame(() => promptInput.current?.focus());
  };
  const applyTemplate = (item: ITemplate): void => {
    if (busy) return;
    try {
      if (!templateVariables(item.prompt).length) {
        applyTemplateText(item, item.prompt);
        return;
      }
    } catch {
      /* Open the editor to correct invalid template syntax. */
    }
    setEditingTemplate(item);
  };
  const submitTemplate = (): void => {
    let incomplete = !templateText.trim();
    try {
      incomplete ||= templateVariables(templateText).length > 0;
    } catch {
      incomplete = true;
    }
    if (selected && incomplete) {
      setEditingTemplate({ ...selected, prompt: templateText || selected.prompt });
      return;
    }
    onSubmit((): void => {
      wall.current?.scrollTo({ top: 0, behavior: 'instant' });
    });
  };
  const download = async (file: IGnosisFile): Promise<void> => {
    if (downloading.current.has(file.id)) return;
    downloading.current.add(file.id);
    setDownloadIds([...downloading.current]);
    setNotice('');
    try {
      await downloadFile(file);
    } catch {
      setNotice('Не удалось скачать файл. Попробуйте ещё раз.');
    } finally {
      downloading.current.delete(file.id);
      setDownloadIds([...downloading.current]);
    }
  };
  const cards: ReactElement[] = [
    ...Array.from(
      { length: Math.max(pendingCount, generating || conversation?.status === 'LOADING' ? 1 : 0) },
      (_, index) => (
        <div
          key={`pending:${pendingTasks[index]?.id || index}`}
          className="image-result-pending"
          role="status"
          style={{ aspectRatio: (ratio || '1:1').replace(':', ' / ') }}
        >
          <span className="img-spin" aria-hidden="true" />
          {conversation && !pendingTasks[index] ? (
            <ImageProgress conversation={conversation} kind={kind} startedAt={startedAt} />
          ) : (
            <span>
              {video ? 'Создаём видео…' : 'Создаём изображение…'}
              <GenerationElapsed startedAt={pendingTasks[index]?.createdDate} />
            </span>
          )}
        </div>
      ),
    ),
    ...(user && history.isPending
      ? Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={`loading:${index}`} className="img-tile media-card-skeleton" />
        ))
      : []),
    ...(text?.trim()
      ? [
          <article className="img-tile media-answer-card" key={`answer:${latestAnswer!.id}`}>
            <button
              type="button"
              className="media-answer-open"
              aria-label="Открыть ответ по запросу"
              onClick={() => setAnswerView(displayMessageText(text))}
            >
              <span className="media-answer-heading">
                <Info size={18} aria-hidden="true" />
                <strong>Ответ по запросу</strong>
                <Expand size={16} aria-hidden="true" />
              </span>
              <span className="media-answer-excerpt">{displayMessageText(text)}</span>
            </button>
          </article>,
        ]
      : []),
    ...(video && !text && !generating && conversation?.status === 'ERROR'
      ? [
          <article key="failed" className="img-tile video-result-failed" role="alert">
            <img src="/media/prototype/content/video/fail-cry.jpg" alt="Ролик не собрался" />
            <p className="video-failure-note">{conversationError || 'Ролик не собрался.'}</p>
          </article>,
        ]
      : []),
    ...files.map((file) => (
      <article className={`img-tile image-result ${video ? 'video-result' : ''}`} key={`file:${file.id}`}>
        <button
          type="button"
          className="image-result-open"
          aria-label={`Открыть ${file.name}`}
          onClick={(e) => {
            e.currentTarget.focus({ preventScroll: true });
            setPreview({ file, rect: e.currentTarget.getBoundingClientRect() });
          }}
        >
          <Media file={file} />
        </button>
        <div className="img-actions">
          <button
            type="button"
            aria-label={`Открыть ${file.name}`}
            onClick={(e) => {
              e.currentTarget.focus({ preventScroll: true });
              setPreview({ file, rect: e.currentTarget.closest('article')!.getBoundingClientRect() });
            }}
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
    ...(banana || seedance ? [] : imageTemplates).map((item, index) => (
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
      className={`image-workspace ${video ? 'video-workspace' : ''} ${banana ? 'banana-workspace' : seedance ? 'seedance-workspace' : ''}`}
      ref={root}
      aria-label={seedance ? 'Seedance Studio' : banana ? 'Nano Banana' : video ? 'Видео' : 'Изображения'}
    >
      <div
        className="img-wall"
        ref={wall}
        aria-label={
          seedance
            ? 'Ролики Seedance'
            : banana
              ? 'Кадры Nano Banana'
              : video
                ? 'Шаблоны и видео'
                : 'Шаблоны и изображения'
        }
      >
        {(banana || seedance) && !files.length && !generating && (
          <div className={seedance ? 'banana-brand seedance-brand' : 'banana-brand'} aria-hidden="true">
            <img src={seedance ? '/media/prototype/seedance.webp' : '/media/prototype/banana.webp'} alt="" />
            <span>{seedance ? 'Seedance Studio' : 'Nano Banana'}</span>
          </div>
        )}
        {(contextError || messages.error || (!busy && (messages.data?.pages || 0) > 1)) && (
          <div className="image-conversation-note">
            {contextError && <p role="alert">{contextError}</p>}
            {messages.error && (
              <p role="alert">
                Не удалось загрузить результаты.{' '}
                <button onClick={() => void messages.refetch()}>Повторить</button>
              </p>
            )}
            {!busy && (messages.data?.pages || 0) > 1 && (
              <nav aria-label="Страницы результатов">
                <button
                  aria-label="Предыдущая страница"
                  title="Предыдущая страница"
                  disabled={!page}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <span>{page + 1}</span>
                <button
                  aria-label="Следующая страница"
                  title="Следующая страница"
                  disabled={page + 1 >= messages.data!.pages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </nav>
            )}
          </div>
        )}
        <div className="img-masonry" style={{ paddingBottom: bottom }}>
          <Masonry columns={columns}>{cards}</Masonry>
        </div>
      </div>
      {editingTemplate && !busy && (
        <TemplateEditor
          key={editingTemplate.id}
          item={editingTemplate}
          duration={typeof options.duration === 'number' ? options.duration : undefined}
          launchSettings={[
            `Модель: ${model ? modelTitle(model) : 'Не выбрана'}`,
            referenceRatio ? 'Формат: по исходному кадру' : ratio ? `Формат: ${ratio}` : '',
            qualityKey && options[qualityKey] ? `Качество: ${options[qualityKey]}` : '',
            video && typeof options.duration === 'number' ? `Длительность: ${options.duration} с` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
          onClose={() => {
            setEditingTemplate(undefined);
            requestAnimationFrame(() => promptInput.current?.focus());
          }}
          onApply={(text) => applyTemplateText(editingTemplate, text)}
        />
      )}
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
                <ComposerAttachment
                  key={file.id}
                  file={file}
                  disabled={busy}
                  onRemove={() => onReferences(references.filter((f) => f.id !== file.id))}
                />
              ))}
              {selected && (
                <div className="composer-template">
                  <ComposerAttachment
                    file={{
                      name: selected.title,
                      path: selected.src,
                      type: video ? 'VIDEO' : 'IMAGE',
                      mime: video ? 'video/mp4' : 'image/jpeg',
                    }}
                    caption={`Шаблон: ${selected.title}`}
                    disabled={busy}
                    onRemove={() => {
                      onTemplate('');
                      onTemplateText('');
                      promptInput.current?.focus();
                    }}
                  />
                  {
                    <button
                      type="button"
                      className="img-file-edit"
                      aria-label="Редактировать шаблон"
                      disabled={busy}
                      onClick={() => {
                        setEditingTemplate({ ...selected, prompt: templateText || selected.prompt });
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                  }
                </div>
              )}
            </div>
          )}
          <textarea
            ref={promptInput}
            id={seedance ? 'sd-draft' : banana ? 'nb-draft' : video ? 'vd-draft' : 'img-draft'}
            aria-label={video ? 'Идея ролика' : 'Идея'}
            rows={3}
            value={prompt}
            disabled={busy}
            onChange={(e) => onPrompt(e.target.value)}
            placeholder={
              video
                ? supportsVideoReferences(model)
                  ? 'Опишите сюжет, движение и атмосферу ролика. Можно добавить свои фото и видео — укажите, что изменить и что сохранить.'
                  : 'Опишите сюжет, движение и атмосферу ролика. Можно добавить свои изображения как исходные кадры — укажите, что оживить и что сохранить.'
                : 'Опишите, какое изображение хотите получить. Можно добавить свои фото — укажите, что изменить, а что сохранить.'
            }
          />
        </div>
        <div className="img-tools">
          <div className="img-settings" aria-label="Параметры генерации">
            <button
              className={`cw-plus ${needsTemplateImages ? `needs-template-images${templateGlowActive ? ' template-glow-active' : ''}` : ''}`}
              title={
                needsTemplateImages
                  ? `Добавьте свои ${video && supportsVideoReferences(model) ? 'фото или видео' : 'изображения'}: минимум ${templateImageMinimum}`
                  : undefined
              }
              type="button"
              aria-label={
                video && supportsVideoReferences(model)
                  ? 'Добавить фото или видео'
                  : video
                    ? 'Добавить кадр'
                    : 'Добавить изображение'
              }
              disabled={busy || (!!user && !model)}
              onClick={onLibrary}
            >
              <Plus size={20} />
            </button>
            <ImageMenu
              label={
                model
                  ? modelTitle(model)
                  : banana
                    ? 'Nano Banana 2'
                    : seedance
                      ? 'Seedance 2.5'
                      : 'Выбрать модель'
              }
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
                label={
                  referenceRatio
                    ? 'По исходному кадру'
                    : ratio || (banana ? (user ? 'Не задаётся' : '1:1') : 'Стороны')
                }
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
                disabled={busy || referenceRatio || !ratios.length}
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
                {fields.resolution && (
                  <ImageMenu
                    label={String(options.resolution || 'Не задаётся')}
                    name="Разрешение"
                    note="Размер видео. Влияет на детализацию и стоимость."
                    values={choices(fields.resolution, []).map(String)}
                    selection={String(options.resolution || '')}
                    disabled={busy || !choices(fields.resolution, []).length}
                    onSelect={(value) => onOptions({ ...options, resolution: value })}
                  />
                )}
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
          </div>
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
        {(error || notice || prefs.error || history.error) && (
          <p className="img-guard" role="alert">
            {error ||
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
      {answerView && (
        <Modal
          title="Ответ по запросу"
          className="media-answer-modal"
          onClose={() => setAnswerView(undefined)}
        >
          <div className="media-answer-body">{answerView}</div>
        </Modal>
      )}
      {video && preview && (
        <MediaPreview
          key={preview.file.id}
          file={preview.file}
          files={files}
          onClose={() => setPreview(undefined)}
        />
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

export function ImageMenu({
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
  autoOption,
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
  autoOption?: { selected: boolean; onSelect: () => void };
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<IModelDescription>();
  const root = useRef<HTMLDivElement>(null);
  useComposerMenu(open, root, true);
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
  const visible =
    models &&
    favoritesFirst(
      [...models].sort((a, b) => modelTitle(a).localeCompare(modelTitle(b), 'ru', { numeric: true })),
      favorites,
      modelKey,
    );
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
        }}
      >
        {label}
        {models && <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="cw-model-menu" role="listbox" aria-label={name}>
          {note && <p className="image-menu-note">{note}</p>}
          {autoOption && (
            <button
              type="button"
              className="image-option"
              role="option"
              aria-selected={autoOption.selected}
              onClick={() => {
                autoOption.onSelect();
                setOpen(false);
              }}
            >
              Авто
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
                  <ModelTitleWithInfo
                    title={modelTitle(model)}
                    onInfo={details ? () => setInfo(model) : undefined}
                    infoClassName="video-model-about"
                  />
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
          {models && !visible?.length && <p className="image-menu-note">{'Модели недоступны'}</p>}
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

function ImageProgress({
  conversation,
  kind,
  startedAt,
}: {
  conversation: IConversation;
  kind: MediaKind;
  startedAt?: string;
}): ReactElement {
  const [now, setNow] = useState(Date.now);
  const start = startedAt ? Date.parse(startedAt) : NaN;
  useEffect(() => {
    if (!Number.isFinite(start)) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [start]);
  const progress = useConversationProgress(conversation);
  return (
    <span>
      {kind === 'video' && Number.isFinite(start) && now - start >= 15 * 60 * 1000
        ? 'Видео ещё создаётся…'
        : progress.tools.length
          ? progress.tools.map((tool, index) => <span key={index}>{toolLabel(tool)}</span>)
          : kind === 'video'
            ? 'Создаём видео…'
            : 'Создаём изображение…'}
      <GenerationElapsed startedAt={startedAt} />
    </span>
  );
}
