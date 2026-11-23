import { MessageAction } from '../../components/MessageAction';
import { VideoDuration } from '../../components/VideoDuration';
import { ImageAspectGrid, ImageAspectPicker } from './ImageAspectGrid';
import { DesignFeed, feeds, type FeedCard, type FeedTab } from './DesignFeed';
import {
  prepareComposerTemplate,
  rebaseComposerTemplate,
  updateComposerField,
} from '../content-studio/templateComposer';
import { PromptTemplate } from '../content-studio/PromptTemplate';
import type { VideoComposerTemplate } from './variants';
import { RequiredPhotoSlots } from '../../components/RequiredPhotoSlots';
import { MediaModelPicker } from '../catalog/MediaModelPicker';
import { useEventCallback } from '../../lib/useEventCallback';
import { FileActions } from '../../components/FileActions';
import type { TemplatePublicReference } from '../content-studio/templatePublicReference';
import { fitTemplateDuration, resolveTemplateDuration } from '../content-studio/templateDuration';
import { useTemplateSelection } from '../content-studio/useTemplateSelection';
import { UploadButtonContent } from '../../components/UploadButtonContent';
import type { IUploadProgress } from '../../lib/api';
import { Skeleton } from '../../components/Skeleton';
import { supportsVideoReferences } from '../catalog/videoInputs';
import { downloadFile } from '../../lib/files';
import { templateVariables, templateTimingError, updateFeedDuration } from '../content-studio/templateRecipe';
import { ComposerAttachment } from '../../components/ComposerAttachment';
import { GenerationElapsed } from '../../components/GenerationElapsed';
import { ModelPickerList } from '../catalog/ModelPickerList';
import { useComposerMenu } from '../../components/useComposerMenu';
import { ModelField } from '../catalog/ModelField';
import { followsReferenceRatio, optionFields, referenceMinimum, referenceLimit } from '../catalog/schema';
import { bananaRatios } from './bananaSettings';
import './banana-workspace.css';
import './seedance-workspace.css';
import { videoRatios, videoShapes } from './videoMenus';
import '../catalog/model-favorites.css';
import { readFileRecipe, readRecipes, variantGroups, type IGenerationRecipe } from './variants';
import {
  useEffect,
  useMemo,
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
  Pencil,
  Download,
  RotateCcw,
  Expand,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Info,
} from 'lucide-react';
import { api } from '../../lib/api';
import type { IConversation, IGnosisFile, IModelDescription, MediaKind } from '../../lib/types';
import { favoritesFirst, findTemplateModel, modelKey, modelTitle } from '../catalog/presentation';
import { useConversationError } from './useConversationError';
import { choices, ratioSizes, sizeRatio, suggestedRatios } from '../content-studio/controls';
import templates from '../content-studio/templates.json';
import type { ITemplate, ITemplateCard } from '../content-studio/materials';

import { useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../workspace/preferences';
import { Media, MediaPreview } from '../../components/MediaPreview';
import { Modal } from '../../components/Modal';
import { SelectControl } from '../../components/SelectControl';
import { Masonry } from '../../components/Masonry';
import { useNavigate } from 'react-router-dom';
import { displayMessageText } from './conversations';
import { useConversationRoom } from '../realtime/RealtimeProvider';
import { useConversationProgress } from './useConversationProgress';
import { toolLabel } from './progress';
import './image-workspace.css';
import { AppliedTemplate } from '../../components/AppliedTemplate';

export function MediaWorkspace({
  kind,
  variant,
  shape = 'single',
  onShape,
  models,
  catalogLoading,
  model,
  options,
  prompt,
  templateId,
  composerTemplate,
  onComposerTemplate,
  onResetComposerTemplate,
  templateText,
  onTemplateText,
  onTemplate,
  references,
  templateReference,
  onRemoveTemplateReference,
  conversation,
  contextError,
  busy,
  pendingCount = 0,
  pendingTasks = [],
  unavailable,
  missingPhotos = 0,
  retryCatalog,
  error,
  onPrompt,
  onModel,
  onOptions,
  onReferences,
  onPrepareTemplate,
  templateUploadProgress,
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
  catalogLoading: boolean;
  model?: IModelDescription;
  options: Record<string, unknown>;
  prompt: string;
  templateId: string;
  composerTemplate?: VideoComposerTemplate;
  onComposerTemplate: (value: VideoComposerTemplate) => void;
  onResetComposerTemplate: () => void;
  templateText: string;
  onTemplateText: (value: string) => void;
  onTemplate: (value: string) => void;
  references: IGnosisFile[];
  templateReference?: TemplatePublicReference;
  onRemoveTemplateReference?: () => void;
  conversation?: IConversation;
  contextError?: string;
  busy: boolean;
  pendingCount?: number;
  pendingTasks?: Array<{ id: string; createdDate: string; localRequest?: boolean }>;
  unavailable?: boolean;
  missingPhotos?: number;
  retryCatalog?: () => void;
  error: string;
  onPrompt: (value: string) => void;
  onModel: (model: Pick<IModelDescription, 'reference'>, templateOptions?: Record<string, unknown>) => void;
  onOptions: (value: Record<string, unknown>) => void;
  onReferences: (value: IGnosisFile[]) => void;
  onPrepareTemplate: (item: ITemplate) => Promise<boolean>;
  templateUploadProgress?: IUploadProgress | null;
  onLibrary: (photosOnly?: boolean) => void;
  onSubmit: (onStarted: () => void) => void;
  onRepeat: (file: IGnosisFile, input?: IGenerationRecipe['workspaceInput']) => void;
  promptInput: RefObject<HTMLTextAreaElement | null>;
  children?: ReactNode;
}): ReactElement {
  const navigate = useNavigate();
  const video = kind === 'video';
  const banana = variant === 'banana';
  const seedance = variant === 'seedance';
  const outputType = video ? 'VIDEO' : 'IMAGE';
  const generating = busy || pendingCount > 0;
  const imageTemplates = useMemo(() => templates.filter((item) => item.kind === kind), [kind]);
  useConversationRoom(conversation?.id);
  const { user, session, signIn } = useAuth();
  const prepareTemplate = useTemplateSelection([
    kind,
    conversation?.id,
    session,
    prompt,
    options.duration,
    model?.reference.model,
  ]);
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
  const tabKey = `genfactory.feed-tab.${user?.id ?? 'guest'}.${kind}`;
  const [feedTab, setFeedTab] = useState<FeedTab>(() => {
    const saved = sessionStorage.getItem(tabKey);
    if (conversation || saved === 'generations') return 'generations';
    return saved === 'shuffle' ? 'shuffle' : 'templates';
  });
  useEffect(() => {
    sessionStorage.setItem(tabKey, feedTab);
  }, [tabKey, feedTab]);
  useEffect(() => {
    if (conversation?.id) setFeedTab('generations');
  }, [conversation?.id]);
  const showHistory = banana || seedance || feedTab === 'generations';
  const [columns, setColumns] = useState(4);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileImageWall, setMobileImageWall] = useState(false);
  const [bottom, setBottom] = useState(234);
  const selected = imageTemplates.find((item) => item.id === templateId);
  const templateCard = composerTemplate && imageTemplates.find((item) => item.id === composerTemplate.id);
  const boundTemplate = useMemo(
    () => composerTemplate && rebaseComposerTemplate(composerTemplate, prompt),
    [composerTemplate, prompt],
  );
  const recipe = useMemo(
    () => new PromptTemplate(boundTemplate?.slots.map((slot) => slot.expression).join(' ') || ''),
    [boundTemplate],
  );
  const missingFields = recipe.variables.some((key) => !boundTemplate?.values[key]?.trim());
  const feed = feeds[video ? 'video' : 'image'];
  const feedTemplate =
    composerTemplate &&
    [...feed.templates, ...feed.generations].find((item) => item.id === composerTemplate.id);
  const mediaComposer = !seedance && !banana;
  const appliedCard = templateCard || feedTemplate;
  const appliedCardId = appliedCard?.id;
  useEffect(() => {
    const input = promptInput.current;
    if (!appliedCardId || !input) return;
    input.setSelectionRange(0, 0);
    input.scrollTop = 0;
  }, [appliedCardId, promptInput]);
  const [photoHintDismissed, setPhotoHintDismissed] = useState(false);
  const needsTemplateImages = missingPhotos > 0;
  const [notice, setNotice] = useState('');
  const [emptyPromptTime, setEmptyPromptTime] = useState(0);
  useEffect(() => {
    if (!emptyPromptTime) return;
    const timer = window.setTimeout(() => setEmptyPromptTime(0), 2800);
    return () => window.clearTimeout(timer);
  }, [emptyPromptTime]);
  const conversationError = useConversationError(conversation);
  const [answerView, setAnswerView] = useState<string>();
  useEffect(() => setAnswerView(undefined), [conversation?.id]);
  const downloading = useRef(new Set<number>());
  const [downloadIds, setDownloadIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<IGnosisFile>();
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [conversation?.id, busy]);
  const messages = useQuery({
    queryKey: ['messages', conversation?.userId, conversation?.id, page],
    queryFn: ({ signal }) => api.messages(conversation!.id, page, signal),
    enabled: !!conversation,
  });
  const latestMessage = useMemo(
    () =>
      [...(messages.data?.items || [])]
        .filter((message) => message.role !== 'COMMAND')
        .sort((a, b) => b.id - a.id)[0],
    [messages.data],
  );
  const startedAt = latestMessage?.role === 'USER' ? latestMessage.createdDate : undefined;
  const history = useInfiniteQuery({
    queryKey: ['files', user?.id, `${kind}-wall`],
    enabled: !!user,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.mediaFiles(outputType, pageParam, signal),
    getNextPageParam: (last) => (last.pageIndex + 1 < last.pages ? last.pageIndex + 1 : undefined),
  });
  const files = useMemo(() => {
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
    return [
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
  }, [history.data, messages.data, user?.id, outputType, banana, seedance]);
  const cardRatios = useMemo(() => {
    const cardRatios = new Map<string, number>();
    for (const item of imageTemplates) {
      const [w, h] = item.ratio.split(':').map(Number);
      if (w > 0 && h > 0) cardRatios.set(item.id, h / w);
    }
    for (const file of files) {
      const preview = file.preview?.image;
      if (preview?.width && preview.height) cardRatios.set(`file:${file.id}`, preview.height / preview.width);
    }
    return cardRatios;
  }, [imageTemplates, files]);
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
  }, [
    history.hasNextPage,
    history.isFetchingNextPage,
    history.error,
    files.length,
    mobileImageWall,
    showHistory,
  ]);

  const latestAnswer = latestMessage?.role === 'ASSISTANT' ? latestMessage : undefined;
  const text =
    generating || latestAnswer?.files?.some((file) => file.type === outputType)
      ? undefined
      : latestAnswer?.text;
  useEffect(() => {
    const measure = () => {
      const width = root.current?.clientWidth || innerWidth;
      const compact = window.matchMedia('(max-width: 780px)').matches;
      setMobileImageWall(compact);
      if (!compact) setSettingsOpen(false);
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
  const durations = choices(fields.duration, [4, 6, 8, 10, 15]);
  const soundOptions = choices(fields.generateAudio, [false, true]);
  const frameLimit = fields.frameImages?.maxItems ?? 0;
  const photoCount = references.filter((file) => file.type === 'IMAGE').length;
  const limits =
    video && model && !references.length && !templateReference && !templateCard && !selected
      ? [
          durations.length ? `До ${fields.duration?.maximum ?? Math.max(...durations)} с` : '',
          frameLimit && !missingPhotos && !referenceMinimum(model)
            ? frameLimit > 1
              ? 'Начальный и конечный кадры по желанию'
              : 'Начальный кадр по желанию'
            : '',
          fields.inputReferences?.maxItems ? `До ${fields.inputReferences.maxItems} референсов` : '',
          soundOptions.length === 1 ? (soundOptions[0] ? 'Со звуком' : 'Без звука') : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
  const chooseRatio = (value: string) =>
    onOptions({ ...options, ...(fields.aspectRatio ? { aspectRatio: value } : { size: sizes.get(value) }) });
  const [templateGlowActive, setTemplateGlowActive] = useState(false);
  const templateGlowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(templateGlowTimer.current), []);
  const applyTemplateText = async (item: ITemplate, text: string): Promise<void> => {
    const prepared = prepareComposerTemplate(text, (item.references?.min ?? 0) > 0);
    const target = item.model
      ? models.find((candidate) => modelKey(candidate) === modelKey({ reference: item.model! }))
      : model;
    const fromFeed = item.id.startsWith(kind + '-feed-');
    const duration = resolveTemplateDuration(item, options.duration, target);
    const supportedRatio =
      fromFeed &&
      target &&
      choices(target.schema.properties?.options?.properties?.aspectRatio, suggestedRatios).includes(
        item.ratio,
      );
    const timingError = item.kind === 'video' ? templateTimingError(text, duration) : undefined;
    if (timingError) {
      setNotice(timingError);
      return;
    }
    if (!(await onPrepareTemplate(item))) return;
    if (item.model)
      onModel(
        { reference: item.model },
        {
          ...(duration !== undefined ? { duration } : {}),
          ...(supportedRatio ? { aspectRatio: item.ratio } : {}),
        },
      );
    setPhotoHintDismissed(false);
    clearTimeout(templateGlowTimer.current);
    setTemplateGlowActive(true);
    templateGlowTimer.current = setTimeout(() => setTemplateGlowActive(false), 1000);

    onTemplate('');
    onTemplateText('');
    onComposerTemplate({ ...prepared, id: item.id });
    onPrompt(prepared.text);
    setNotice('');
  };
  const applyTemplate = async (card: ITemplateCard, savedText?: string): Promise<void> => {
    if (busy) return;
    try {
      if (!user) {
        await signIn();
        return;
      }
      const loaded = await prepareTemplate(card);
      if (!loaded) return;
      const target = loaded.model
        ? models.find((candidate) => modelKey(candidate) === modelKey({ reference: loaded.model! }))
        : model;
      if (loaded.model && !target) {
        setNotice('Модель шаблона сейчас недоступна.');
        return;
      }
      const item = fitTemplateDuration(loaded, options.duration, target);
      await applyTemplateText(item, savedText || item.prompt);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось загрузить шаблон.');
    }
  };
  const submitTemplate = (): void => {
    if (missingPhotos || missingFields || unavailable) return;
    let incomplete = !templateText.trim();
    try {
      incomplete ||= templateVariables(templateText).length > 0;
    } catch {
      incomplete = true;
    }
    if (selected && incomplete) {
      void applyTemplate(selected, templateText);
      return;
    }
    onSubmit((): void => {
      setFeedTab('generations');
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
  const repeatFile = useEventCallback((file: IGnosisFile) => onRepeat(file, repeatInput(file)));
  const downloadResult = useEventCallback(download);
  async function applyFeedCard(card: FeedCard) {
    if (busy) return;
    const target = findTemplateModel(models, card.modelId, card.modelTitle);
    if (!user) {
      await signIn();
      return;
    }
    if (!target) {
      setNotice('Модель «' + card.modelTitle + '» сейчас недоступна.');
      return;
    }
    try {
      await applyTemplateText(
        {
          id: card.id,
          kind,
          title: card.title,
          genre: '',
          prompt: card.prompt,
          src: card.src,
          ratio: card.ratio,
          model: target.reference,
          references: { min: card.photos },
          recommendedDuration: card.duration || undefined,
        },
        video && card.duration
          ? updateFeedDuration(card.prompt, card.prompt, undefined, card.duration)
          : card.prompt,
      );
      promptInput.current?.focus();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось применить шаблон.');
    }
  }
  const fileCards = useMemo(
    () =>
      files.map((file) => (
        <article className={`img-tile image-result ${video ? 'video-result' : ''}`} key={`file:${file.id}`}>
          <button
            type="button"
            className="image-result-open"
            aria-label={`Открыть ${file.name}`}
            title={`Открыть ${file.name}`}
            onClick={(e) => {
              e.currentTarget.focus({ preventScroll: true });
              setPreview(file);
            }}
          >
            <Media file={file} />
          </button>
          <FileActions file={file} />
          <div className="img-actions">
            <button
              type="button"
              aria-label={`Скачать ${file.name}`}
              disabled={downloadIds.includes(file.id)}
              aria-busy={downloadIds.includes(file.id)}
              title="Скачать"
              onClick={() => void downloadResult(file)}
            >
              <Download size={18} />
            </button>
            <button
              type="button"
              aria-label={`Переделать ${file.name}`}
              title="Переделать"
              disabled={busy}
              onClick={() => repeatFile(file)}
            >
              <RotateCcw size={18} />
            </button>
            <FileActions file={file} variant="delete-button" />
          </div>
        </article>
      )),
    [files, video, downloadIds, busy, downloadResult, repeatFile],
  );
  const statusCards: ReactElement[] = [
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
    ...(showHistory && user && history.isPending
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
              title="Открыть ответ по запросу"
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
  ];
  const galleryCards: ReactElement[] = [
    ...(showHistory && history.hasNextPage
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
  ];
  const grouped = mobileImageWall && !video && !banana;
  const compactTools = mobileImageWall && !banana;
  const resolutionSetting = video && choices(fields.resolution, []).length > 0 && (
    <ImageMenu
      asField={compactTools || mediaComposer}
      label={String(options.resolution || 'Разрешение')}
      name="Разрешение"
      note="Размер видео. Влияет на детализацию и стоимость."
      values={choices(fields.resolution, []).map(String)}
      selection={String(options.resolution || '')}
      disabled={busy || !choices(fields.resolution, []).length}
      onSelect={(value) => onOptions({ ...options, resolution: value })}
    />
  );
  const shapeSetting = video && (
    <ImageMenu
      asField={compactTools || mediaComposer}
      label={shape === 'sequence' ? 'Набор сцен' : 'Один кадр'}
      name="Структура ролика"
      note="Как собрать ролик внутри выбранной длины. На выходе всегда один файл."
      descriptions={videoShapes}
      values={['Один кадр', 'Набор сцен']}
      selection={shape === 'template' ? undefined : shape === 'sequence' ? 'Набор сцен' : 'Один кадр'}
      disabled={busy}
      onSelect={(value) => onShape?.(value === 'Набор сцен' ? 'sequence' : 'single')}
    />
  );
  const videoSettings = video && (
    <>
      <VideoDuration
        values={durations}
        value={Number(options.duration || 0)}
        disabled={busy}
        mobile={compactTools}
        label="Длина ролика"
        onChange={(duration) => {
          if (feedTemplate && boundTemplate && composerTemplate) {
            const text = updateFeedDuration(prompt, feedTemplate.prompt, Number(options.duration), duration);
            if (text !== prompt) {
              onPrompt(text);
              onComposerTemplate({ ...rebaseComposerTemplate(boundTemplate, text), id: composerTemplate.id });
            }
          }
          onOptions({ ...options, duration });
        }}
      />
      {soundOptions.length > 0 && (
        <button
          className="cw-chip"
          type="button"
          aria-label="Звук"
          title="Звук"
          aria-pressed={!!options.generateAudio}
          disabled={busy || soundOptions.length < 2}
          onClick={() => onOptions({ ...options, generateAudio: !options.generateAudio })}
        >
          {options.generateAudio ? (mediaComposer ? 'Звук' : 'Со звуком') : 'Без звука'}
        </button>
      )}
      {(!mediaComposer || compactTools) && resolutionSetting}
      {(!mediaComposer || compactTools) && shapeSetting}
    </>
  );
  const qualityField = !video && quality.length > 0 && (
    <label className="setting-field">
      <span>Качество</span>
      <SelectControl
        disabled={busy}
        value={String(options[qualityKey] || quality[0])}
        onChange={(event) => onOptions({ ...options, [qualityKey]: event.target.value })}
      >
        {quality.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </SelectControl>
    </label>
  );
  const aspectGrid = (close: () => void) => (
    <ImageAspectGrid
      values={ratios}
      selected={ratio}
      disabled={!!busy || !!referenceRatio}
      onSelect={(value) => {
        chooseRatio(value);
        close();
      }}
    />
  );
  const extraSettings =
    grouped && model
      ? optionFields(model).filter(([key]) => !['size', 'aspectRatio', qualityKey].includes(key))
      : [];
  const visibleFiles = showHistory ? fileCards : [];
  const imageFeed = mediaComposer && !video;
  const generationCards = [...statusCards, ...visibleFiles, ...galleryCards];
  const retryHistory = !error && !notice && !prefs.error && !retryCatalog && history.isLoadingError;
  const retry = retryCatalog || (retryHistory ? () => void history.refetch() : undefined);
  const templateAttachments = (selected || templateReference || references.length > 0) && (
    <>
      {templateReference && (
        <ComposerAttachment
          file={templateReference}
          disabled={busy}
          onRemove={() => onRemoveTemplateReference?.()}
        />
      )}
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
              onReferences([]);
              onRemoveTemplateReference?.();
              promptInput.current?.focus();
            }}
          />
          {
            <button
              type="button"
              className="img-file-edit"
              aria-label="Редактировать шаблон"
              title="Редактировать шаблон"
              disabled={busy}
              onClick={() => {
                void applyTemplate(selected, templateText);
              }}
            >
              <Pencil size={13} />
            </button>
          }
        </div>
      )}
    </>
  );
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
        {!imageFeed && (
          <div className="img-masonry" style={{ paddingBottom: banana || seedance ? bottom : 0 }}>
            {generationCards.length > 0 && (
              <Masonry
                columns={columns}
                gap={mobileImageWall && mediaComposer ? 8 : 12}
                scrollRoot={wall}
                estimateHeight={(key, width) =>
                  key === 'next-page'
                    ? 40
                    : width * (cardRatios.get(key) ?? 0.75) + (key.startsWith(kind + ':') ? 44 : 0)
                }
              >
                {generationCards}
              </Masonry>
            )}
          </div>
        )}
        {!banana && !seedance && (
          <DesignFeed
            archive={imageTemplates}
            onApplyArchive={(card) => void applyTemplate(card)}
            models={models}
            key={kind}
            tab={feedTab}
            onTab={(tab) => {
              setFeedTab(tab);
              wall.current?.scrollTo({ top: 0, behavior: 'instant' });
            }}
            kind={video ? 'video' : 'image'}
            busy={busy || (!!user && catalogLoading)}
            onApply={(card) => void applyFeedCard(card)}
          >
            {imageFeed && generationCards}
          </DesignFeed>
        )}
      </div>
      <form
        className={mediaComposer ? 'img-dock design-media-composer' : 'img-dock'}
        ref={dock}
        onSubmit={(e) => {
          e.preventDefault();
          if (mediaComposer && !prompt.trim() && !selected && !(video && references.length)) {
            setEmptyPromptTime(Date.now());
            promptInput.current?.focus();
            return;
          }
          if (appliedCard && missingPhotos) {
            setPhotoHintDismissed(false);
            dock.current?.querySelector<HTMLButtonElement>('.feed-photo-tile > button')?.focus();
            return;
          }
          submitTemplate();
        }}
      >
        {!!emptyPromptTime && (
          <div className="image-composer-toast" role="status">
            {video ? 'Опишите сцену ролика' : 'Напишите, что нарисовать'}
          </div>
        )}
        <div className={appliedCard ? 'cw-field feed-template-fields' : 'cw-field'}>
          {appliedCard ? (
            <AppliedTemplate
              title={appliedCard.title}
              key={appliedCard.id}
              fields={
                composerTemplate && boundTemplate
                  ? {
                      recipe: recipe,
                      values: boundTemplate.values,
                      onChange: (key, value) => {
                        const next = updateComposerField(boundTemplate, key, value);
                        onComposerTemplate({ ...next, id: composerTemplate.id });
                        onPrompt(next.text);
                      },
                    }
                  : undefined
              }
              disabled={busy}
              photoDisabled={busy || !!unavailable}
              photoHintDismissed={photoHintDismissed}
              photoCount={photoCount}
              missingPhotos={missingPhotos}
              video={video}
              onReset={onResetComposerTemplate}
              onDismissPhotoHint={() => setPhotoHintDismissed(true)}
              onAdd={() => onLibrary(true)}
            >
              {templateAttachments}
            </AppliedTemplate>
          ) : (
            (templateAttachments || missingPhotos > 0) && (
              <div className="img-files">
                {templateAttachments}
                <RequiredPhotoSlots
                  count={photoCount + missingPhotos}
                  filled={photoCount}
                  disabled={busy || !!unavailable}
                  onAdd={() => onLibrary(true)}
                />
              </div>
            )
          )}
          <textarea
            ref={promptInput}
            id={seedance ? 'sd-draft' : banana ? 'nb-draft' : video ? 'vd-draft' : 'img-draft'}
            aria-label={video ? 'Идея ролика' : 'Идея'}
            rows={mediaComposer ? 2 : 3}
            style={mediaComposer ? undefined : { height: 72 }}
            value={prompt}
            disabled={busy}
            onChange={(e) => {
              const text = e.target.value;
              if (composerTemplate && boundTemplate)
                onComposerTemplate({
                  ...rebaseComposerTemplate(boundTemplate, text),
                  id: composerTemplate.id,
                });
              if (emptyPromptTime) setEmptyPromptTime(0);
              onPrompt(text);
            }}
            placeholder={
              video
                ? 'Что происходит в ролике? Кто в кадре, куда едет камера.'
                : 'Опишите, что нарисовать. Если нужно своё фото - приложите его ниже.'
            }
          />
        </div>
        <div className={compactTools ? 'img-tools image-mobile-tools' : 'img-tools'}>
          <div className="img-settings" aria-label="Параметры генерации">
            {(!video || !model || referenceLimit(model) > 0) && (
              <button
                className={`cw-plus ${needsTemplateImages ? `needs-template-images${templateGlowActive ? ' template-glow-active' : ''}` : ''}`}
                title={
                  needsTemplateImages
                    ? `Добавьте свои ${video && supportsVideoReferences(model) ? 'фото или видео' : 'изображения'}: минимум ${photoCount + missingPhotos}`
                    : video
                      ? undefined
                      : 'Добавить фото: JPG, PNG, WebP, HEIC/HEIF'
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
                aria-busy={templateUploadProgress !== undefined}
                onClick={() => onLibrary()}
              >
                <UploadButtonContent
                  compact
                  busy={templateUploadProgress !== undefined}
                  progress={templateUploadProgress || undefined}
                >
                  {mediaComposer ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M12 5v14M5 12h14"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <Plus size={20} />
                  )}
                </UploadButtonContent>
              </button>
            )}
            <MediaModelPicker
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
              kind={kind}
              mobile={mobileImageWall && !mediaComposer}
              composer={mediaComposer}
              selected={model && modelKey(model)}
              favorites={prefs.value.favoriteModels}
              onFavorite={prefs.toggleFavoriteModel}
              onSelect={(key) => {
                const chosen = models.find((m) => modelKey(m) === key);
                if (chosen) onModel(chosen);
              }}
            />
            {compactTools &&
              (video || ratios.length > 0 || quality.length > 0 || extraSettings.length > 0) && (
                <button
                  type="button"
                  className="cw-chip"
                  aria-haspopup="dialog"
                  aria-expanded={settingsOpen}
                  onClick={(event) => {
                    event.currentTarget.focus({ preventScroll: true });
                    setSettingsOpen(true);
                  }}
                >
                  Ещё
                </button>
              )}
            {!compactTools && mediaComposer && (video || ratios.length > 0 || quality.length > 0) && (
              <ImageAspectPicker value={ratio} referenceRatio={!!referenceRatio} disabled={busy}>
                {(close) => (
                  <>
                    {aspectGrid(close)}
                    {qualityField}
                    {video && resolutionSetting}
                    {video && shapeSetting}
                    {limits && <p className="video-model-limits">{limits}</p>}
                  </>
                )}
              </ImageAspectPicker>
            )}
            {!mediaComposer && !compactTools && (!!ratios.length || banana) && (
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
            {banana && (
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
            {!compactTools && videoSettings}
          </div>
          <button
            className="cw-send"
            type="submit"
            aria-label={video ? 'Собрать видео' : 'Собрать изображение'}
            title={video ? 'Собрать видео' : 'Собрать изображение'}
            disabled={
              busy ||
              unavailable ||
              (missingPhotos > 0 && !appliedCard) ||
              missingFields ||
              (!mediaComposer &&
                !prompt.trim() &&
                !selected &&
                !(video && references.length) &&
                !((video || banana) && references.length))
            }
          >
            {busy ? (
              <span className="spinner" />
            ) : mediaComposer ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            ) : (
              <ArrowUp size={20} />
            )}
          </button>
        </div>
        {(error || notice || prefs.error || history.error) && (
          <p className="img-guard" role="alert">
            {error ||
              notice ||
              prefs.error ||
              (history.error ? `Не удалось загрузить историю ${video ? 'видео' : 'изображений'}.` : '')}
            {retry && (
              <MessageAction onClick={retry} disabled={retryHistory && history.isFetching}>
                Загрузить снова
              </MessageAction>
            )}
          </p>
        )}
      </form>
      {compactTools && (
        <Modal
          swipeToClose
          open={settingsOpen}
          title={video ? 'Кадр, длина и звук' : 'Ещё настройки'}
          className={`studio-mobile-sheet image-settings-sheet ${mediaComposer ? 'design-image-settings' : ''}`}
          onClose={() => setSettingsOpen(false)}
        >
          {video && <p className="aspect-title">Размер кадра</p>}
          {mediaComposer && aspectGrid(() => setSettingsOpen(false))}
          {!mediaComposer && ratios.length > 0 && (
            <label className="setting-field">
              <span>Соотношение сторон</span>
              <SelectControl
                disabled={busy || referenceRatio}
                value={ratio}
                onChange={(event) => chooseRatio(event.target.value)}
              >
                {!ratio && (
                  <option value="" disabled>
                    {referenceRatio ? 'По исходному кадру' : 'По умолчанию'}
                  </option>
                )}
                {ratios.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </SelectControl>
            </label>
          )}
          {videoSettings}
          {qualityField}
          {extraSettings.map(([key, schema]) => (
            <ModelField
              key={key}
              name={key}
              schema={schema}
              value={options[key]}
              onChange={(value) => onOptions({ ...options, [key]: value })}
            />
          ))}
        </Modal>
      )}
      {answerView && (
        <Modal
          title="Ответ по запросу"
          className="media-answer-modal"
          onClose={() => setAnswerView(undefined)}
        >
          <div className="media-answer-body">{answerView}</div>
        </Modal>
      )}
      {preview && (
        <MediaPreview
          key={preview.id}
          file={preview}
          files={files}
          onClose={() => setPreview(undefined)}
          onAnalyze={(file) => navigate('/prompt', { state: { reference: file, userId: user?.id } })}
          onUse={(file) => {
            setPreview(undefined);
            navigate('/image', { state: { reference: file, userId: user?.id } });
          }}
          onAnimate={(file) => navigate('/video', { state: { reference: file, userId: user?.id } })}
        />
      )}
      {children}
    </section>
  );
}

export function ImageMenu({
  asField,
  label,
  name,
  values = [],
  models,
  selection,
  disabled,
  onSelect,
  favorites = [],
  note,
  descriptions,
  allowedValues,
  ratioIcons,
  onFavorite,
  autoOption,
}: {
  asField?: boolean;
  label: string;
  name: string;
  values?: string[];
  models?: IModelDescription[];
  selection?: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
  favorites?: string[];
  note?: string;
  descriptions?: Record<string, string>;
  allowedValues?: string[];
  ratioIcons?: boolean;
  onFavorite?: (value: string) => void;
  autoOption?: { selected: boolean; onSelect: () => void };
}): ReactElement {
  const [open, setOpen] = useState(false);
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
  const sorted =
    models && [...models].sort((a, b) => modelTitle(a).localeCompare(modelTitle(b), 'ru', { numeric: true }));
  const visible = sorted && favoritesFirst(sorted, favorites, modelKey);
  if (asField) {
    const value = selection && values.includes(selection) ? selection : '';
    return (
      <label className="setting-field">
        <span>{name}</span>
        <SelectControl
          aria-label={name}
          disabled={disabled}
          value={value}
          onChange={(event) => onSelect(event.target.value)}
        >
          {!value && (
            <option value="" disabled>
              По умолчанию
            </option>
          )}
          {values.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </SelectControl>
      </label>
    );
  }
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
        title={name}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {models ? (
          <span className="gf-model-trigger-name" title={label}>
            {label}
          </span>
        ) : (
          label
        )}
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
          {visible && (
            <ModelPickerList
              items={visible.map((m) => ({ id: modelKey(m), title: modelTitle(m) }))}
              selected={selection}
              favorites={favorites}
              onFavorite={onFavorite}
              onSelect={choose}
            />
          )}
          {!models &&
            values.map((value) => (
              <button
                className={`image-option ${ratioIcons ? 'banana-ratio-option' : ''}`}
                type="button"
                role="option"
                aria-selected={value === selection}
                aria-label={value}
                title={value}
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
