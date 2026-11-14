import { FileReferenceType } from '../../lib/types';
import {
  templatePublicReference,
  resolvePublicReference,
  restoredPublicReference,
} from '../content-studio/templatePublicReference';
import { syncTemplateDuration, templateTimingError } from '../content-studio/templateRecipe';
import { catalogQuery } from '../catalog/catalogQuery';
import type { ITemplateVideoReference } from '../content-studio/materials';
import { scheduleRefresh } from '../realtime/queryRefresh';
import '../../lib/transport-polyfills';
import { ObjectUtil } from '@ts-core/common';
import type { ReactElement } from 'react';
import {
  videoInputOptions,
  videoReferenceMode,
  supportsVideoReferences,
  videoReferenceError,
  validateVideoReferenceMetadata,
} from '../catalog/videoInputs';
import {
  IMAGE_UPLOAD_ACCEPT,
  VIDEO_UPLOAD_ACCEPT,
  isVideoUpload,
  isImageUpload,
} from '../../lib/image-upload';
import { modelTitle } from '../catalog/presentation';
import { useRetainedModel } from '../catalog/useRetainedModel';
import { followsReferenceRatio } from '../catalog/schema';
import { bananaDefaults, bananaTitle } from './bananaSettings';
import { MediaWorkspace } from './MediaWorkspace';
import { videoDefaults } from './videoSettings';
import { UploadButtonContent } from '../../components/UploadButtonContent';
import type { IUploadProgress } from '../../lib/api';
import { ModelField as Field } from '../catalog/ModelField';
import { FileOutputEditor, useFileOutputSettings } from '../../components/FileOutputEditor';
import { ReferenceChoice } from './ReferenceChoice';
import { saveRecipe } from './variants';
import { useDirectMediaTask } from './useDirectMediaTask';
import { directMediaPrompt } from './directMediaPrompt';
import { useDraft, DraftBar, restoreDraftFiles } from '../workspace/drafts';
import { UploadSurface } from '../../components/UploadSurface';
import { ReferenceList } from '../../components/ReferenceList';
import { ModelBrowser } from '../catalog/ModelBrowser';
import { favoritesFirst } from '../catalog/presentation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation, useIsMutating } from '@tanstack/react-query';
import {
  ArrowUp,
  ImagePlus,
  Clapperboard,
  SlidersHorizontal,
  Sparkles,
  Upload,
  ChevronDown,
  WandSparkles,
} from 'lucide-react';
import { api, getSession } from '../../lib/api';
import type { IGnosisFile, MediaKind, IModelDescription, ITaskRequest } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';
import {
  defaults,
  optionFields,
  referenceLimit,
  referenceMinimum,
  supportsReferences,
  validateRequest,
} from '../catalog/schema';
import {
  connection,
  createConversationBody,
  createMessageBody,
  migratedReferenceSystem,
  toolSettings,
} from './conversations';
import { ConversationResults } from './ConversationResults';
import { SelectControl } from '../../components/SelectControl';
import { LibraryPicker } from '../../components/LibraryPicker';
import { WorkspaceNav } from '../workspace/WorkspaceNav';
import { usePreferences, type IPreset } from '../workspace/preferences';
import { creativePrompt } from '../workspace/prompt';
const providers = { image: 'OPEN_ROUTER_IMAGE', video: 'OPEN_ROUTER_VIDEO' };
const suggestions = {
  image: [
    'Съёмка парфюма на камне в утреннем свете',
    'Портрет в стиле аналоговой фотографии',
    'Футуристический город после дождя',
  ],
  video: [
    'Медленный пролёт камеры над океаном на рассвете',
    'Крупный план капель дождя на стекле, огни города вдали',
    'Плавное приближение к предмету, мягкий студийный свет',
  ],
};
export function Studio({ kind }: { kind: MediaKind }): ReactElement {
  const auth = useAuth();
  const prefs = usePreferences();
  const [picker, setPicker] = useState(false);
  const [replaceReference, setReplaceReference] = useState(false);
  const [referenceChoice, setReferenceChoice] = useState(false);
  const [freshScope, setFreshScope] = useState<string>();
  const [useBrand, setUseBrand] = useState(false);
  const [shot, setShot] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [presetName, setPresetName] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const specialized = search.get('studio');
  const legacy = !!specialized && !['banana', 'seedance'].includes(specialized);
  const directTask = useDirectMediaTask(auth.user?.id, kind);
  const client = useQueryClient();
  const idParam = search.get('conversation');
  const previewConversationId =
    idParam && /^[1-9]\d*$/.test(idParam) && Number.isSafeInteger(Number(idParam))
      ? Number(idParam)
      : undefined;
  const conversationId = legacy ? previewConversationId : undefined;
  const scope = `${auth.user?.id}:${location.pathname}:${location.search}`;
  const sourceScope = `${auth.user?.id}:${kind}:${conversationId || 'new'}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [creating, setCreating] = useState(false);
  const [agentKey, setAgentKey] = useState('');
  const conversationQuery = useQuery({
    queryKey: ['conversation', auth.user?.id, previewConversationId],
    enabled: !!auth.user && !!previewConversationId,
    queryFn: ({ signal }) => api.conversation(previewConversationId!, signal),
    retry: false,
  });
  const previewConversation = conversationQuery.data;
  const conversation = legacy ? previewConversation : undefined;
  const fileOutput = useFileOutputSettings(
    `${auth.user?.id}:${location.pathname}:${location.search}`,
    conversation,
  );
  const agents = useQuery({
    queryKey: ['conversation-models', auth.user?.id],
    enabled: !!auth.user && !conversationId && legacy,
    queryFn: ({ signal }) => api.conversationModels(signal),
    select: (models) => models.filter((m) => m.capabilities?.includes('TOOLS')),
    staleTime: 300000,
  });
  const agent = agents.data?.find((m) => m.reference.model === agentKey) || agents.data?.[0];
  const send = useMutation({
    mutationKey: ['send-message', auth.user?.id],
    mutationFn: ({
      id,
      body,
      sid,
    }: {
      id: number;
      body: ReturnType<typeof createMessageBody>;
      sid: string;
    }) => api.sendMessage(id, body, sid),
    retry: false,
    onSettled: (_data, _error, variables) => {
      if (!auth.user) return;
      scheduleRefresh(
        client,
        auth.user.id,
        variables.sid,
        ['conversation', 'messages', 'conversations', 'files', 'account', 'active-jobs', 'active-tasks'],
        variables.id,
      );
    },
  });
  const pendingSends = useIsMutating({
    mutationKey: ['send-message', auth.user?.id],
    predicate: (mutation) =>
      !!conversationId && (mutation.state.variables as { id?: number } | undefined)?.id === conversationId,
  });
  const [prompt, setPrompt] = useState('');
  const [imageTemplateId, setImageTemplateId] = useState('');
  const [imageTemplateText, setImageTemplateText] = useState('');
  const [selected, setSelected] = useState('');
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [references, setReferences] = useState<IGnosisFile[]>([]);
  const [templateVideoReference, setTemplateVideoReference] = useState<ITemplateVideoReference>();
  const publicReference =
    kind === 'video' && templateVideoReference?.source === 'public'
      ? resolvePublicReference(templateVideoReference)
      : undefined;
  const videoReferences = publicReference ? [publicReference, ...references] : references;
  const fromScratch = freshScope === sourceScope;
  useEffect(() => {
    if (references.length) setFreshScope(undefined);
  }, [references]);
  const chooseFresh = () => {
    setReferences([]);
    setFreshScope(sourceScope);
    setReferenceChoice(false);
  };
  useEffect(() => {
    setReferenceChoice(false);
    setPicker(false);
    setFreshScope(undefined);
  }, [sourceScope]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<IUploadProgress>();
  const [error, setError] = useState('');
  const [modelBrowser, setModelBrowser] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const [focusPrompt, setFocusPrompt] = useState(0);

  const initialPromptKey = useRef('');
  const referenceKey = useRef('');
  const previousUser = useRef(auth.user?.id);
  const previousKind = useRef(kind);
  const uploadScope = useRef('');
  const uploadEpoch = useRef(0);
  const repeatRequest = useRef<ITaskRequest | null>(null);
  const busy = creating || (legacy && (pendingSends > 0 || conversation?.status === 'LOADING'));
  useEffect(() => {
    if (!focusPrompt || busy) return;
    const frame = requestAnimationFrame(() => {
      promptInput.current?.focus({ preventScroll: true });
      promptInput.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusPrompt, busy]);
  const catalog = useQuery({
    ...catalogQuery(auth.user?.id, providers[kind]),
    select: (models) =>
      models.filter((model) =>
        model.capabilities?.includes(kind === 'image' ? 'IMAGE_OUTPUT' : 'VIDEO_OUTPUT'),
      ),
  });
  const models = (catalog.data || [])
    .filter((m) =>
      specialized === 'banana'
        ? /gemini.*(image|banana)/i.test(m.reference.model)
        : specialized === 'seedance'
          ? /seedance/i.test(m.reference.model)
          : true,
    )
    .map((m) => (specialized === 'banana' ? { ...m, name: bananaTitle(m) } : m));
  const modelKey = (m: Pick<IModelDescription, 'reference'>) =>
    `${m.reference.provider}:${m.reference.model}`;
  const savedReference = conversation ? connection(conversation, kind)?.settings?.model : undefined;
  const retained = useRetainedModel(savedReference, catalog.data ? models : undefined, auth.user?.id);
  const requestedKey =
    selected || (savedReference ? `${savedReference.provider}:${savedReference.model}` : '');
  const model = requestedKey
    ? models.find((m) => modelKey(m) === requestedKey) ||
      (retained && modelKey(retained) === requestedKey ? retained : undefined)
    : (specialized === 'banana'
        ? models.find((m) => /gemini-3\.1-flash-image$/.test(m.reference.model))
        : undefined) || models[0];
  const currentKey = model ? modelKey(model) : '';
  uploadScope.current = `${auth.session}:${kind}:${currentKey}:${location.key}:${uploadEpoch.current}`;
  useEffect(() => {
    setUploading(false);
    setUploadProgress(undefined);
    if (input.current) input.current.value = '';
  }, [auth.session, kind, currentKey, location.key]);
  const initializedModel = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (initializedModel.current === currentKey) return;
    initializedModel.current = currentKey;
    setOptions(
      repeatRequest.current?.options || {
        ...(specialized === 'banana'
          ? bananaDefaults(model)
          : kind === 'video' && !legacy
            ? videoDefaults(model)
            : defaults(model?.schema.properties?.options)),
        ...(model ? { model: model.reference.model } : {}),
      },
    );
    repeatRequest.current = null;
    setError('');
  }, [currentKey]);
  useEffect(() => {
    if (previousUser.current === auth.user?.id && previousKind.current === kind) return;
    setSelected('');
    setError('');
    if (
      (previousUser.current !== undefined && previousUser.current !== auth.user?.id) ||
      previousKind.current !== kind
    )
      setPrompt('');
    if (previousUser.current !== auth.user?.id) {
      setUseBrand(false);
      setShot({});
      setNotice('');
      setPresetName('');
    }
    previousUser.current = auth.user?.id;
    previousKind.current = kind;
    setAgentKey('');
    setImageTemplateId('');
    setImageTemplateText('');
  }, [kind, auth.user?.id]);
  const previousConversation = useRef(conversationId);
  useLayoutEffect(() => {
    if (previousConversation.current !== undefined && previousConversation.current !== conversationId) {
      setPrompt('');
      setImageTemplateId('');
      setImageTemplateText('');
      setError('');
    }
    previousConversation.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    if (initialPromptKey.current !== location.key) {
      const state = location.state as {
        prompt?: string;
        reference?: IGnosisFile;
        userId?: number;
        repeat?: boolean;
        notice?: string;
      } | null;
      if (state?.userId !== undefined && state.userId !== auth.user?.id) return;
      initialPromptKey.current = location.key;
      if (state?.prompt) setPrompt(state.prompt);
      if (state?.repeat) {
        setUseBrand(false);
        setShot({});
        setNotice(state.notice || '');
      }
    }
  }, [location.key, location.state, model, auth.user?.id]);
  const appliedPreset = useRef('');
  useEffect(() => {
    const state = location.state as { preset?: IPreset; userId?: number } | null;
    if (
      !state?.preset ||
      !models.length ||
      conversationId ||
      appliedPreset.current === location.key ||
      (state.userId !== undefined && state.userId !== auth.user?.id)
    )
      return;
    const preset = state.preset;
    const found = models.find((m) =>
      preset.model
        ? modelKey(m) === `${preset.model.provider}:${preset.model.model}`
        : preset.modelMatch
          ? m.reference.model.includes(preset.modelMatch)
          : false,
    );
    if (found) {
      const values = {
        ...defaults(found.schema.properties?.options),
        ...preset.options,
        model: found.reference.model,
      };
      if (modelKey(found) !== currentKey)
        repeatRequest.current = {
          model: found.reference.provider,
          options: values,
          task: { session: '', prompt: '' },
        };
      else setOptions(values);
      setSelected(modelKey(found));
    } else if (preset.model || preset.modelMatch)
      setNotice('Модель шаблона сейчас недоступна. Выберите модель из каталога.');
    appliedPreset.current = location.key;
  }, [models, currentKey, location.key, location.state, conversationId, auth.user?.id]);
  const restored = useRef('');
  useEffect(() => {
    const key = `${auth.user?.id}:${conversationId}:${kind}`;
    if (!conversationId) {
      restored.current = '';
      return;
    }
    if (!conversation || (!models.length && !retained) || restored.current === key) return;
    const saved = connection(conversation, kind)?.settings;
    if (saved) {
      const found =
        models.find(
          (m) => m.reference.provider === saved.model.provider && m.reference.model === saved.model.model,
        ) ||
        (retained?.reference.provider === saved.model.provider &&
        retained.reference.model === saved.model.model
          ? retained
          : undefined);
      if (!found) return;
      if (found) {
        const values = {
          ...(kind === 'video' && specialized === 'seedance'
            ? videoDefaults(found)
            : defaults(found.schema.properties?.options)),
          ...saved.options,
          model: found.reference.model,
        };
        if (modelKey(found) !== currentKey)
          repeatRequest.current = {
            model: found.reference.provider,
            options: values,
            task: { session: '', prompt: '' },
          };
        else setOptions(values);
        setSelected(modelKey(found));
      }
    }
    restored.current = key;
  }, [conversation, conversationId, kind, models, retained, currentKey, auth.user?.id]);
  const referenceScope = `${auth.user?.id}:${kind}`;
  const previousReference = useRef({ scope: referenceScope, conversationId });
  useEffect(() => {
    const previous = previousReference.current;
    // Mount effect replay is not a change of editor. Creating the first
    // conversation also keeps the draft's references. Changing a model keeps them
    // too: incompatible references must be reported by validation, never silently removed.
    if (
      previous.scope !== referenceScope ||
      (previous.conversationId !== undefined && previous.conversationId !== conversationId)
    )
      setReferences([]);
    previousReference.current = { scope: referenceScope, conversationId };
  }, [referenceScope, conversationId]);
  useEffect(() => {
    const state = location.state as {
      reference?: IGnosisFile;
      references?: IGnosisFile[];
      preset?: IPreset;
      userId?: number;
    } | null;
    const incoming = (state?.references || (state?.reference ? [state.reference] : [])).filter(
      (f) => f.type === 'IMAGE' || (kind === 'video' && f.type === 'VIDEO'),
    );
    if (!incoming.length || !model || referenceKey.current === location.key) return;
    if (
      state?.userId !== auth.user?.id ||
      incoming.some(
        (f) =>
          f.userId !== auth.user?.id || (f.type !== 'IMAGE' && !(kind === 'video' && f.type === 'VIDEO')),
      )
    )
      return;
    if (state?.preset && !conversationId) {
      const preferred = models.find((m) =>
        state.preset?.model
          ? modelKey(m) === `${state.preset.model.provider}:${state.preset.model.model}`
          : state.preset?.modelMatch
            ? m.reference.model.includes(state.preset.modelMatch)
            : false,
      );
      if (preferred && modelKey(preferred) !== currentKey) return;
    }
    if (conversationId) {
      if (!conversation) return;
      const saved = connection(conversation, kind)?.settings?.model;
      const savedModel = models.find(
        (m) => m.reference.provider === saved?.provider && m.reference.model === saved?.model,
      );
      // Restoration changes the selected model on the next render. Apply the
      // navigation reference only after that reset has finished.
      if (savedModel && modelKey(savedModel) !== currentKey) return;
    }
    if (!supportsReferences(model)) {
      setError('Выбранная модель не поддерживает референсы. Выберите другую модель.');
      return;
    }
    const limit = !legacy ? referenceLimit(model) : Math.min(4, referenceLimit(model));
    setReferences(kind === 'video' ? incoming : incoming.slice(0, limit));
    if (incoming.length > limit) {
      if (kind === 'video')
        setError(`Эта модель принимает до ${limit} изображений. Уберите лишние или выберите другую модель.`);
      else setNotice(`Для этой модели оставлены первые ${limit} референса.`);
    }
    referenceKey.current = location.key;
    setFocusPrompt((value) => value + 1);
  }, [models, currentKey, location.key, location.state, auth.user?.id, conversation, conversationId, kind]);
  const maxRefs = !legacy ? referenceLimit(model) : Math.min(4, referenceLimit(model));
  const minRefs = referenceMinimum(model);
  const draft = useDraft(
    `${kind}:${conversationId || 'new'}:${specialized || 'all'}`,
    {
      prompt,
      selected: currentKey,
      options,
      references,
      templateVideoReference,
      shot,
      useBrand,
      agentKey,
      imageTemplateId,
      imageTemplateText,
    },
    !!currentKey,
  );
  const editorSnapshot = useRef('');
  const clearedSubmission = useRef<string | undefined>(undefined);
  editorSnapshot.current = JSON.stringify({
    prompt,
    currentKey,
    options,
    references: references.map((item) => item.id),
    templateVideoReference,
    shot,
    imageTemplateId,
    imageTemplateText,
  });
  const pendingDraft = useRef<{
    value: NonNullable<typeof draft.available>['value'];
    files: IGnosisFile[];
    key: string;
  } | null>(null);
  useEffect(() => {
    const pending = pendingDraft.current;
    if (!pending || pending.key !== currentKey) return;
    pendingDraft.current = null;
    setPrompt(pending.value.prompt);
    setImageTemplateId(pending.value.imageTemplateId || '');
    setImageTemplateText(pending.value.imageTemplateText || '');
    setOptions(pending.value.options);
    setReferences(pending.files);
    setTemplateVideoReference(pending.value.templateVideoReference);
    setShot(pending.value.shot || {});
    setUseBrand(!!pending.value.useBrand);
    setAgentKey(pending.value.agentKey || '');
    draft.changed();
  }, [currentKey, notice]);
  const restoreDraft = async (value: NonNullable<typeof draft.available>['value']): Promise<void> => {
    if (!auth.user || !auth.session || busy || uploading) return;
    if (
      typeof value.prompt !== 'string' ||
      !value.options ||
      typeof value.options !== 'object' ||
      !value.shot ||
      typeof value.shot !== 'object' ||
      Object.values(value.shot).some((v) => typeof v !== 'string')
    ) {
      setError('Черновик повреждён.');
      return;
    }
    if (catalog.isFetching || !catalog.isSuccess) {
      setError('Каталог моделей не загружен. Повторите загрузку и восстановите черновик.');
      return;
    }
    const chosen = models.find((m) => modelKey(m) === value.selected);
    if (!chosen) {
      const known = catalog.data?.some((m) => modelKey(m) === value.selected);
      setError(
        known
          ? 'Модель черновика не входит в выбранный раздел. Откройте общий раздел или выберите другой черновик.'
          : 'Модель черновика отсутствует в загруженном каталоге. Черновик сохранён.',
      );
      return;
    }
    const scope = uploadScope.current;
    setUploading(true);
    const restored = await restoreDraftFiles(
      value.references,
      auth.user.id,
      auth.session,
      kind === 'video' ? 40 : maxRefs,
    );
    if (scope !== uploadScope.current || getSession() !== auth.session) return;
    pendingDraft.current = {
      value,
      files: restored.files.filter((f) => f.type === 'IMAGE' || (kind === 'video' && f.type === 'VIDEO')),
      key: value.selected,
    };
    setSelected(value.selected);
    setNotice(
      `Черновик восстановлен.${restored.missing ? ' Недоступные файлы пропущены.' : ''} ${new Date().toLocaleTimeString()}`,
    );
    setUploading(false);
    setUploadProgress(undefined);
  };
  const imageDraftRestored = useRef('');
  useEffect(() => {
    if (legacy || !auth.user || catalog.isFetching || !catalog.isSuccess || busy || uploading) return;
    if (conversationId && !conversation) return;
    if (!draft.available || location.state) return;
    const attempt = `${sourceScope}:${catalog.dataUpdatedAt}`;
    if (imageDraftRestored.current === attempt) return;
    imageDraftRestored.current = attempt;
    setError('');
    void restoreDraft(draft.available.value);
  }, [
    sourceScope,
    catalog.isFetching,
    catalog.isSuccess,
    catalog.dataUpdatedAt,
    conversation,
    draft.available,
    busy,
    uploading,
  ]);
  const upload = async (files: FileList | File[] | null): Promise<void> => {
    if (!auth.user) {
      void auth.signIn();
      return;
    }
    if (!files || !model || uploading) return;
    setError('');
    setUploading(true);
    setUploadProgress(undefined);
    const scope = uploadScope.current;
    const sid = auth.session!;
    const isCurrent = () => mounted.current && scope === uploadScope.current && getSession() === sid;
    try {
      const picked = Array.from(files);
      if (
        picked.some(
          (f) =>
            !isImageUpload(f) && !(kind === 'video' && supportsVideoReferences(model) && isVideoUpload(f)),
        )
      )
        throw new Error('Загрузите PNG, JPEG, WebP или HEIC/HEIF.');
      if (picked.some((f) => f.size > (isVideoUpload(f) ? 200 : 20) * 1024 * 1024))
        throw new Error('Для референсов используйте файлы до 20 МБ.');
      if (references.length + picked.length > maxRefs)
        throw new Error(`Для выбранной модели можно добавить до ${maxRefs} референсов.`);
      for (const file of picked) {
        if (!isCurrent()) return;
        const saved = await api.upload(file, sid, undefined, (progress) => {
          if (isCurrent()) setUploadProgress(progress);
        });
        if (!isCurrent()) return;
        if (
          saved.userId !== auth.user.id ||
          (saved.type !== 'IMAGE' && !(kind === 'video' && saved.type === 'VIDEO'))
        )
          throw new Error('Сервер не вернул изображение вашего аккаунта.');
        draft.changed();
        setReferences((prev) => (prev.some((f) => f.id === saved.id) ? prev : [...prev, saved]));
        scheduleRefresh(client, auth.user.id, sid, ['files']);
      }
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : 'Не удалось загрузить файл.');
    } finally {
      if (isCurrent()) {
        setUploading(false);
        setUploadProgress(undefined);
        if (input.current) input.current.value = '';
      }
    }
  };
  const insufficientFundsMessage =
    'Недостаточно средств на балансе. Пополните баланс перед новым запуском. Задание сохранено.';
  const failedConversationMessage =
    'Беседа завершилась с ошибкой и пока не принимает новые сообщения. Задание сохранено.';
  const imageSendError = (value: unknown): string => {
    const message = value instanceof Error ? value.message : 'Ответ не получен.';
    if (message.includes('ConversationForbiddenError') && conversation?.status === 'ERROR')
      return failedConversationMessage;
    return `${message.replace(/[.\s]+$/u, '')}. Проверьте результат перед повторной отправкой. Автоматического повтора нет.`;
  };
  const imageBlockedReason =
    !legacy && auth.balances.RUB !== undefined && Number(auth.balances.RUB) <= 0
      ? insufficientFundsMessage
      : '';
  useEffect(() => {
    if (kind === 'video') setPrompt((value) => syncTemplateDuration(value, options.duration));
  }, [kind, options.duration]);
  const submit = async (onStarted?: () => void): Promise<void> => {
    if (!auth.user || !auth.session) {
      void auth.signIn();
      return;
    }
    if (model?.status === 'DISABLED') {
      setError('Модель отключена администратором. Выберите другую модель.');
      return;
    }
    if (!model || busy || uploading || submitting.current) return;
    if (imageBlockedReason) {
      setError(imageBlockedReason);
      return;
    }
    if (legacy && idParam && !conversation) {
      setError('Дождитесь загрузки беседы или откройте новую работу.');
      return;
    }
    if (legacy && conversation && !connection(conversation, kind)) {
      setError('В этой беседе не подключён нужный инструмент. Создайте новую работу.');
      return;
    }
    if (legacy && !conversationId && !agent) {
      setError('Не удалось выбрать модель ассистента. Обновите каталог.');
      return;
    }
    if (legacy && conversation && !references.length && !fromScratch) {
      setReferenceChoice(true);
      return;
    }
    if (videoReferences.length && (!supportsReferences(model) || videoReferences.length > maxRefs)) {
      setError('Выберите модель с поддержкой выбранных референсов или измените их количество.');
      return;
    }
    if (videoReferences.length < minRefs) {
      setError(`Добавьте референсы для выбранной модели (минимум: ${minRefs}).`);
      return;
    }
    if (kind === 'video') {
      const timingError = templateTimingError(prompt, options.duration);
      if (timingError) {
        setError(timingError);
        return;
      }
      const issue = videoReferenceError(model, references);
      if (issue) {
        setError(issue);
        return;
      }
    }
    const visibleOptions = new Set(optionFields(model).map(([name]) => name));
    const cleanOptions = Object.fromEntries(
      Object.entries(options).filter(([name, v]) => visibleOptions.has(name) && v !== undefined && v !== ''),
    );
    if (followsReferenceRatio(model, videoReferences.length)) delete cleanOptions.aspectRatio;
    const combinedPrompt =
      !legacy && imageTemplateId
        ? [imageTemplateText.trim(), prompt.trim()].filter(Boolean).join('\n\n')
        : prompt;
    const preparedPrompt = !legacy
      ? directMediaPrompt(kind, prompt, imageTemplateId ? imageTemplateText : '', shot.shape || 'single')
      : creativePrompt(combinedPrompt, useBrand ? prefs.value.brand : '', shot);
    const body: ITaskRequest = {
      model: model.reference.provider,
      task: { prompt: preparedPrompt, session: crypto.randomUUID() },
      options: { ...cleanOptions, model: model.reference.model },
    };
    if (kind === 'image')
      body.task.references = references.map((file) => ({ type: FileReferenceType.FILE, id: file.id }));
    if (kind === 'video') {
      body.task.referenceMode = videoReferenceMode(
        model,
        videoReferences.length,
        !publicReference &&
          Array.isArray(options.frameImages) &&
          options.frameImages.length === references.length &&
          options.frameImages.every((frame, index) => frame.url === references[index].path),
      );
      const issue = videoReferenceError(
        model,
        videoReferences,
        body.task.referenceMode as 'frames' | 'references',
      );
      if (issue) {
        setError(issue);
        return;
      }
      ObjectUtil.copyPartial(
        videoInputOptions(model, videoReferences, body.task.referenceMode as 'frames' | 'references'),
        body.options,
      );
      if (
        body.options.inputReferences &&
        model.reference.model === 'google/veo-3.1' &&
        body.options.duration !== 8
      ) {
        setError('Для референсов Veo выберите длительность 8 секунд.');
        return;
      }
    }
    let errors: string[];
    try {
      errors = validateRequest(model, body);
    } catch {
      errors = ['Не удалось проверить параметры модели. Обновите каталог.'];
    }
    if (errors.length) {
      setError(errors.join('\n'));
      return;
    }
    setError('');
    if (!legacy) {
      const sid = auth.session;
      const userId = auth.user.id;
      const activeScope = scopeRef.current;
      const current = () => mounted.current && getSession() === sid && scopeRef.current === activeScope;
      submitting.current = true;
      setCreating(true);
      try {
        const actualReferences: IGnosisFile[] = [];
        for (const reference of references) {
          const actual = await api.file(reference.id, sid);
          if (
            actual.userId !== userId ||
            (actual.type !== 'IMAGE' && !(kind === 'video' && actual.type === 'VIDEO'))
          )
            throw new Error('Исходное изображение недоступно. Выберите другой референс.');
          actualReferences.push(actual);
          if (!current()) return;
        }
        if (kind === 'video')
          await validateVideoReferenceMetadata(
            model,
            publicReference ? [publicReference, ...actualReferences] : actualReferences,
            Number(body.options.duration) || 0,
          );
        if (!current()) return;
        const taskBody: ITaskRequest = {
          ...body,
          isSaveResult: true,
          fileOutput: fileOutput.value,
          task: {
            ...body.task,
            references: references.map((file) => ({ type: FileReferenceType.FILE, id: file.id })),
          },
          options: { ...body.options },
        };
        if (kind === 'video') {
          taskBody.task.references = [
            ...(publicReference
              ? [{ type: FileReferenceType.URL, url: publicReference.path, mime: publicReference.mime }]
              : []),
            ...actualReferences.map((file) => ({ type: FileReferenceType.FILE, id: file.id })),
          ];
          if (publicReference) taskBody.task.referenceMode = 'references';
          delete taskBody.options.frameImages;
          delete taskBody.options.inputReferences;
        }
        const submittedEditor = editorSnapshot.current;
        const clearedEditor = JSON.stringify({
          ...JSON.parse(submittedEditor),
          prompt: '',
          references: [],
          templateVideoReference: undefined,
          imageTemplateId: '',
          imageTemplateText: '',
        });
        onStarted?.();
        const pending = directTask.mutateAsync({
          userId,
          sid,
          kind,
          body: taskBody,
          recipe: {
            kind,
            prompt: preparedPrompt,
            model: model.reference,
            options: cleanOptions,
            references,
            workspaceInput: {
              idea: prompt,
              templateId: imageTemplateId,
              templateText: imageTemplateText,
              shape: shot.shape,
              templateVideoReference,
              referenceFileIds: references.map((file) => file.id),
            },
          },
        });
        clearedSubmission.current = taskBody.task.session;
        draft.clear();
        setPrompt('');
        setImageTemplateId('');
        setImageTemplateText('');
        setReferences([]);
        setTemplateVideoReference(undefined);
        void pending.catch((error) => {
          if (
            !current() ||
            clearedSubmission.current !== taskBody.task.session ||
            ![submittedEditor, clearedEditor].includes(editorSnapshot.current)
          )
            return;
          setPrompt(prompt);
          setImageTemplateId(imageTemplateId);
          setImageTemplateText(imageTemplateText);
          setReferences(references);
          setTemplateVideoReference(templateVideoReference);
          draft.changed();
          setError(imageSendError(error));
        });
      } catch (error) {
        if (current()) setError(imageSendError(error));
      } finally {
        submitting.current = false;
        if (mounted.current) setCreating(false);
      }
      return;
    }
    submitting.current = true;
    let activeScope = scopeRef.current;
    let messageSent = false;
    const sid = auth.session;
    const userId = auth.user.id;
    try {
      setCreating(true);
      if (conversation) {
        // Read the latest version so polling or another editor cannot leave a stale system prompt.
        const latest = await api.conversation(conversation.id, undefined, sid);
        if (latest.userId !== userId || latest.status === 'LOADING')
          throw new Error('Беседа недоступна или уже выполняет запрос.');
        if (fileOutput.changed) {
          const updated = await api.editFileOutput(latest.id, fileOutput.value, sid);
          client.setQueryData(['conversation', userId, latest.id], updated);
        }
        if (followsReferenceRatio(model, references.length)) {
          await api.editConversation(
            latest,
            {
              options: {
                ...latest.options,
                tools: (latest.options.tools || []).map((item) =>
                  (typeof item === 'string' ? item : item.uid) === 'VIDEO'
                    ? toolSettings(kind, model, cleanOptions)
                    : item,
                ),
              },
            },
            sid,
          );
        }
        const system = migratedReferenceSystem(latest);
        if (system !== undefined) {
          const updated = await api.editConversation(latest, { system }, sid);
          client.setQueryData(['conversation', userId, latest.id], updated);
        }
      }
      for (const reference of references) {
        const actual = await api.file(reference.id, sid);
        if (
          actual.userId !== userId ||
          (actual.type !== 'IMAGE' && !(kind === 'video' && actual.type === 'VIDEO'))
        )
          throw new Error('Исходное изображение недоступно. Выберите другой референс.');
      }
      if (!mounted.current || getSession() !== sid || scopeRef.current !== activeScope) return;
      const tool = toolSettings(kind, model, cleanOptions);
      let id = conversationId;
      if (!id) {
        setCreating(true);
        const created = await api.createConversation(
          {
            ...createConversationBody(combinedPrompt, kind, agent!, tool),
            ...(fileOutput.changed ? { fileOutput: fileOutput.value } : {}),
          },
          sid,
        );
        void client.invalidateQueries({ queryKey: ['conversations', userId] });
        if (
          !mounted.current ||
          getSession() !== sid ||
          window.location.pathname !== location.pathname ||
          window.location.search !== location.search
        )
          return;
        id = created.id;
        client.setQueryData(['conversation', userId, id], created);
        const nextSearch = `?conversation=${id}${['advanced', 'banana', 'seedance'].includes(specialized || '') ? `&studio=${specialized}` : ''}`;
        activeScope = `${userId}:/${kind}:${nextSearch}`;
        scopeRef.current = activeScope;
        navigate(`/${kind}${nextSearch}`, { replace: true });
      }
      const message = createMessageBody(
        preparedPrompt,
        kind,
        tool,
        references.map((file) => file.id),
        fromScratch || !conversationId || (!legacy && !references.length),
        model.name,
        body.task.referenceMode,
      );
      if (publicReference) {
        message.references.unshift({
          type: FileReferenceType.URL,
          url: publicReference.path,
          mime: publicReference.mime,
        });
        message.settings.tools[0].input = {
          references: message.references,
          referenceMode: body.task.referenceMode,
        };
      }
      messageSent = true;
      const response = await send.mutateAsync({ id, body: message, sid });
      if (getSession() === sid) {
        const saved = saveRecipe(userId, id, response.id, {
          kind,
          prompt: preparedPrompt,
          ...(!legacy
            ? {
                workspaceInput: {
                  idea: prompt,
                  templateId: imageTemplateId,
                  templateText: imageTemplateText,
                  shape: shot.shape,
                },
              }
            : {}),
          model: model.reference,
          options: cleanOptions,
          references,
        });
        if (!saved && mounted.current)
          setNotice('Ответ получен, но параметры запуска не удалось сохранить в браузере.');
      }
      draft.clear();
      if (
        mounted.current &&
        getSession() === sid &&
        window.location.pathname === `/${kind}` &&
        new URLSearchParams(window.location.search).get('conversation') === String(id)
      ) {
        setPrompt('');
        setImageTemplateId('');
        setImageTemplateText('');
        if (!legacy) setReferences([]);
      }
    } catch (e) {
      if (mounted.current && !messageSent && scopeRef.current === activeScope)
        setError(
          !legacy
            ? imageSendError(e)
            : `${e instanceof Error ? e.message : 'Ответ не получен.'} Проверьте сообщения беседы перед повторной отправкой: запрос мог быть выполнен. Автоматического повтора нет.`,
        );
    } finally {
      submitting.current = false;
      if (mounted.current) setCreating(false);
    }
  };
  if (!legacy)
    return (
      <MediaWorkspace
        variant={specialized === 'banana' || specialized === 'seedance' ? specialized : undefined}
        kind={kind}
        pendingCount={legacy ? 0 : directTask.pendingCount}
        pendingTasks={legacy ? [] : directTask.pendingTasks}
        shape={shot.shape || 'single'}
        onShape={(shape) => {
          draft.changed();
          setShot((value) => ({ ...value, shape }));
        }}
        key={`${auth.user?.id}:${kind}:${specialized || 'all'}`}
        models={models}
        model={model}
        options={options}
        prompt={prompt}
        templateId={imageTemplateId}
        templateText={imageTemplateText}
        onTemplateText={(value) => {
          draft.changed();
          setImageTemplateText(value);
        }}
        onTemplate={(value) => {
          draft.changed();
          setImageTemplateId(value);
        }}
        references={references}
        templateReference={publicReference}
        onRemoveTemplateReference={() => {
          draft.changed();
          setTemplateVideoReference(undefined);
        }}
        conversation={previewConversation}
        contextError={
          (idParam && !previewConversationId ? 'Некорректный адрес беседы.' : '') ||
          (conversationQuery.error instanceof Error ? conversationQuery.error.message : '')
        }
        busy={busy || uploading}
        unavailable={!!auth.user && (!!imageBlockedReason || !model)}
        retryCatalog={
          catalog.error || agents.error
            ? () => {
                void catalog.refetch();
                void agents.refetch();
              }
            : undefined
        }
        promptInput={promptInput}
        error={
          imageBlockedReason ||
          error ||
          (draft.status.startsWith('Не удалось') ? draft.status : '') ||
          (catalog.error instanceof Error ? catalog.error.message : '')
        }
        onPrompt={(value) => {
          draft.changed();
          setPrompt(value);
        }}
        onModel={(value, templateOptions) => {
          draft.changed();
          const key = modelKey(value);
          if (templateOptions) {
            const chosen = models.find((item) => modelKey(item) === key);
            initializedModel.current = key;
            setOptions({
              ...(currentKey === key ? options : videoDefaults(chosen)),
              ...templateOptions,
              model: value.reference.model,
            });
          }
          setSelected(key);
        }}
        onOptions={(value) => {
          draft.changed();
          setOptions(value);
        }}
        onPrepareTemplate={async (item) => {
          const sid = getSession();
          if (!sid || busy || uploading) return false;
          const reference = templatePublicReference(item.id);
          if (item.referenceVideoSrc && !reference) {
            setError('Видеореференс шаблона недоступен.');
            return false;
          }
          draft.changed();
          const previousId = templateVideoReference?.fileId;
          if (previousId) setReferences((current) => current.filter((file) => file.id !== previousId));
          setTemplateVideoReference(reference ? { templateId: item.id, source: 'public' } : undefined);
          setError('');
          return true;
        }}
        onReferences={(value) => {
          draft.changed();
          setReferences(kind === 'video' || !model ? value : value.slice(0, maxRefs));
          if (
            templateVideoReference?.fileId &&
            !value.some((file) => file.id === templateVideoReference.fileId)
          )
            setTemplateVideoReference(undefined);
        }}
        onLibrary={() => {
          if (!auth.user) {
            void auth.signIn();
            return;
          }
          if (!supportsReferences(model)) {
            setError('Выбранная модель не поддерживает референсы. Выберите другую модель.');
            return;
          }
          if (references.length >= maxRefs) {
            setError(`Для выбранной модели можно добавить до ${maxRefs} референсов.`);
            return;
          }
          setReplaceReference(false);
          setPicker(true);
        }}
        onSubmit={(onStarted) => void submit(onStarted)}
        onRepeat={async (file, input) => {
          const generation = file.origin?.generation;
          if (!generation) {
            setError(
              'У этого результата не сохранены параметры запуска. Выберите его в библиотеке для правки.',
            );
            return;
          }
          if (
            kind === 'video' &&
            generation.options.inputReferences &&
            !input?.templateVideoReference &&
            !file.origin?.sourceFileIds?.length
          ) {
            setError(
              'Не удалось восстановить референсы этого запуска. Выберите шаблон и исходные файлы заново.',
            );
            return;
          }
          const chosen = models.find(
            (m) => modelKey(m) === `${generation.model.provider}:${generation.model.model}`,
          );
          if (!chosen) {
            setError('Модель результата сейчас недоступна. Выберите модель из каталога.');
            return;
          }
          const sid = auth.session,
            activeScope = scopeRef.current;
          try {
            const sources = await Promise.all(
              [
                ...new Set([
                  ...(file.origin?.sourceFileIds || []),
                  ...(input?.referenceFileIds || []),
                  ...(kind === 'image' ? [file.id] : []),
                ]),
              ].map((id) => api.file(id, sid!)),
            );
            if (getSession() !== sid || scopeRef.current !== activeScope || !mounted.current) return;
            if (
              sources.some(
                (f) =>
                  f.userId !== auth.user?.id ||
                  (f.type !== 'IMAGE' && !(kind === 'video' && f.type === 'VIDEO')),
              )
            )
              throw new Error('Исходные изображения недоступны.');
            if ((sources.length && !supportsReferences(chosen)) || sources.length > referenceLimit(chosen))
              throw new Error('Количество референсов не поддерживается текущей моделью.');
            const values = {
              ...(kind === 'video' ? videoDefaults(chosen) : defaults(chosen.schema.properties?.options)),
              ...generation.options,
              ...(kind === 'video' && generation.referenceMode === 'frames'
                ? {
                    frameImages: sources.map((source, index) => ({
                      url: source.path,
                      type: index === 0 ? 'first_frame' : 'last_frame',
                    })),
                  }
                : {}),
              model: chosen.reference.model,
            };
            // Restore sources after the model switch resets the old reference scope.
            pendingDraft.current = {
              key: modelKey(chosen),
              files: sources,
              value: {
                prompt: `${input?.idea ?? generation.prompt}\n\n${kind === 'video' ? 'Ролик не подошёл полностью. Уточните, что изменить.' : 'Последний референс — полученный результат. Исправь его с учётом моих уточнений.'}`,
                selected: modelKey(chosen),
                options: values,
                references: sources,
                templateVideoReference:
                  restoredPublicReference(generation.references) || input?.templateVideoReference,
                shot: input?.shape ? { shape: input.shape } : {},
                useBrand: false,
                agentKey,
                imageTemplateId: input?.templateId || '',
                imageTemplateText: input?.templateText || '',
              },
            };
            if (modelKey(chosen) !== currentKey)
              repeatRequest.current = {
                model: chosen.reference.provider,
                options: values,
                task: { prompt: generation.prompt },
              };
            setSelected(modelKey(chosen));
            setNotice(`Параметры восстановлены: ${Date.now()}`);
            setError('');
            setFocusPrompt((v) => v + 1);
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : 'Не удалось восстановить исходные файлы. Задание не изменено.',
            );
          }
        }}
      >
        {picker && (
          <LibraryPicker
            acceptedTypes={
              kind === 'video' && supportsVideoReferences(model) ? ['IMAGE', 'VIDEO'] : ['IMAGE']
            }
            validateFile={(file) =>
              kind === 'video' && model ? videoReferenceError(model, [...references, file]) : undefined
            }
            multiple
            maxFiles={maxRefs - references.length}
            selected={references.map((f) => f.id)}
            onClose={() => setPicker(false)}
            onPick={(file) => {
              draft.changed();
              setReferences((current) =>
                current.some((f) => f.id === file.id) ? current : [...current, file].slice(0, maxRefs),
              );
            }}
          />
        )}
      </MediaWorkspace>
    );
  return (
    <div className="studio page-enter">
      <header className="studio-heading">
        <div>
          <span className="eyebrow">ВАША ТВОРЧЕСКАЯ СТУДИЯ</span>
          <h1>
            {specialized === 'banana'
              ? 'Nano Banana Studio'
              : specialized === 'seedance'
                ? 'Seedance Studio'
                : kind === 'image'
                  ? 'Изображения'
                  : 'Видео'}
          </h1>
        </div>
        <span className="studio-kind">
          {kind === 'image' ? <ImagePlus size={17} /> : <Clapperboard size={17} />}{' '}
          {kind === 'image' ? 'От мысли к кадру' : 'Каждый кадр — начало истории'}
        </span>
      </header>
      <WorkspaceNav conversationId={conversationId} draft={{ prompt, references, userId: auth.user?.id }} />
      {!conversationId && (
        <div className="workspace-actions">
          <button className="text-button" onClick={() => navigate(`/${kind}`)}>
            Все модели
          </button>
          <button
            className="text-button"
            onClick={() => navigate(kind === 'image' ? '/image?studio=banana' : '/video?studio=seedance')}
          >
            {kind === 'image' ? 'Nano Banana Studio' : 'Seedance Studio'}
          </button>
        </div>
      )}
      <div className="conversation-toolbar">
        <span className="small muted">
          {conversation ? `Работа: ${conversation.name}` : 'Новая рабочая беседа'}
        </span>
        <button
          className="button"
          disabled={creating}
          onClick={() => {
            uploadEpoch.current++;
            uploadScope.current = '';
            setUploading(false);
            setUploadProgress(undefined);
            if (input.current) input.current.value = '';
            // This action clears the editor now; a delayed route commit must not clear a new draft again.
            previousConversation.current = undefined;
            navigate(`/${kind}${specialized === 'advanced' ? '?studio=advanced' : ''}`);
            setPrompt('');
            setReferences([]);
            setFreshScope(undefined);
            setError('');
          }}
        >
          Новая работа
        </button>
      </div>
      {idParam && !conversationId && (
        <p className="error" role="alert">
          Некорректный адрес беседы. Откройте новую работу или выберите её в истории.
        </p>
      )}
      {conversationQuery.error && (
        <p className="error" role="alert">
          {conversationQuery.error.message}{' '}
          <button className="text-button" onClick={() => void conversationQuery.refetch()}>
            Обновить
          </button>
        </p>
      )}
      <div className="studio-layout">
        <UploadSurface
          disabled={busy || uploading || !supportsReferences(model)}
          onFiles={(files) => void upload(files)}
        >
          <section className="composer" onChange={draft.changed}>
            <DraftBar
              draft={draft}
              busy={busy || uploading || !models.length}
              onRestore={(value) => void restoreDraft(value)}
            />
            <div className="composer-title">
              <Sparkles size={18} />
              <h2>Что создадим?</h2>
            </div>
            <div className="source-selection" aria-label="Исходное изображение">
              <strong>
                {references.length
                  ? 'На основе изображения'
                  : fromScratch || !conversationId
                    ? 'Создание с нуля'
                    : 'Исходное изображение не выбрано'}
              </strong>
              <p className="small muted">
                {references.length
                  ? references.length === 1
                    ? 'Используем это изображение.'
                    : 'Используем эти изображения в указанном порядке.'
                  : fromScratch || !conversationId
                    ? 'Предыдущие изображения не будут использованы как референсы.'
                    : 'Перед генерацией выберите предыдущий результат, другой референс или создание с нуля.'}
              </p>
              <ReferenceList
                files={references}
                video={kind === 'video'}
                disabled={busy || uploading}
                onChange={(files) => {
                  draft.changed();
                  setReferences(files);
                  setFreshScope(undefined);
                }}
              />
              <div className="workspace-actions">
                {references.length > 0 && (
                  <button
                    className="text-button"
                    disabled={busy || uploading || !supportsReferences(model)}
                    onClick={() => {
                      setReplaceReference(true);
                      setPicker(true);
                    }}
                  >
                    Заменить изображение
                  </button>
                )}
                {conversation && (
                  <button
                    className="text-button"
                    disabled={busy || uploading}
                    onClick={() => setReferenceChoice(true)}
                  >
                    Выбрать из беседы
                  </button>
                )}
                <button className="text-button" disabled={busy || uploading} onClick={chooseFresh}>
                  Создать с нуля
                </button>
              </div>
            </div>
            <label className="prompt-label" htmlFor="prompt">
              Ваша идея
            </label>
            <textarea
              id="prompt"
              ref={promptInput}
              value={prompt}
              disabled={busy}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                kind === 'image'
                  ? 'Опишите, какое изображение хотите получить. Можно добавить свои фото — укажите, что изменить, а что сохранить.'
                  : 'Опишите сюжет, движение и атмосферу ролика. Можно добавить свои изображения как исходные кадры — укажите, что оживить и что сохранить.'
              }
              maxLength={model?.schema.properties?.task?.properties?.prompt?.maxLength || 32_000}
            />
            <div className="prompt-footer">
              <span>Чем точнее описание — тем ближе результат</span>
              <span>{prompt.length}</span>
            </div>
            {(!auth.user || supportsReferences(model)) && (
              <button
                className="upload-reference"
                disabled={uploading || busy || (!!model && references.length >= maxRefs)}
                aria-busy={uploading}
                onClick={() => (auth.user ? input.current?.click() : void auth.signIn())}
              >
                <UploadButtonContent busy={uploading} progress={uploadProgress}>
                  <Upload size={17} />
                  Добавить референс
                </UploadButtonContent>
                <span>{kind === 'video' ? 'Первый / последний кадр' : 'PNG, JPG, WebP'}</span>
              </button>
            )}
            {minRefs > 0 && (
              <p className="small muted">
                Эта модель работает с исходными изображениями. Минимум референсов: {minRefs}.
              </p>
            )}
            <input
              type="file"
              hidden
              ref={input}
              accept={
                kind === 'video' && supportsVideoReferences(model)
                  ? `${IMAGE_UPLOAD_ACCEPT},${VIDEO_UPLOAD_ACCEPT}`
                  : IMAGE_UPLOAD_ACCEPT
              }
              multiple={kind === 'image'}
              onChange={(e) => void upload(e.target.files)}
            />
            <div className="composer-shortcuts">
              <button
                className="button"
                disabled={
                  !auth.user ||
                  busy ||
                  uploading ||
                  !supportsReferences(model) ||
                  references.length >= maxRefs
                }
                onClick={() => {
                  setReplaceReference(false);
                  setPicker(true);
                }}
              >
                Из библиотеки
              </button>
              <button
                className="button"
                disabled={!models.length || busy || uploading}
                onClick={() => setModelBrowser(true)}
              >
                Поиск и избранные модели
              </button>
            </div>
            <div className="model-selection">
              <label htmlFor="model">Модель</label>
              <SelectControl
                leading={<WandSparkles size={17} />}
                id="model"
                value={currentKey}
                onChange={(e) => setSelected(e.target.value)}
                disabled={!models.length || busy || uploading}
              >
                {!models.length && (
                  <option>
                    {auth.user
                      ? catalog.isPending
                        ? 'Загружаем модели…'
                        : 'Нет доступных моделей'
                      : 'Войдите, чтобы выбрать модель'}
                  </option>
                )}
                {model && !models.some((m) => modelKey(m) === currentKey) && (
                  <option value={currentKey} disabled>
                    {modelTitle(model)}
                  </option>
                )}
                {favoritesFirst(
                  [...models].sort((a, b) =>
                    modelTitle(a).localeCompare(modelTitle(b), 'ru', { numeric: true }),
                  ),
                  prefs.value.favoriteModels,
                  modelKey,
                ).map((m) => (
                  <option key={modelKey(m)} value={modelKey(m)}>
                    {modelTitle(m)}
                  </option>
                ))}
              </SelectControl>
            </div>
            {specialized && catalog.isSuccess && !models.length && (
              <p className="inline-error">
                Эта модель сейчас недоступна в каталоге. Вернитесь к списку всех моделей.
              </p>
            )}
            {catalog.error && (
              <div className="inline-error">
                <p>{catalog.error.message}</p>
                <button className="text-button" onClick={() => void catalog.refetch()}>
                  Загрузить снова
                </button>
              </div>
            )}
            {model && (
              <>
                <div className="settings-grid">
                  {optionFields(model)
                    .filter(([key]) =>
                      ['size', 'aspectRatio', 'resolution', 'duration', 'quality'].includes(key),
                    )
                    .map(([key, schema]) => (
                      <Field
                        key={currentKey + key}
                        name={key}
                        schema={schema}
                        value={options[key]}
                        onChange={(v) => setOptions((prev) => ({ ...prev, [key]: v }))}
                      />
                    ))}
                </div>
                <button
                  className="advanced-button"
                  onClick={() => setAdvanced(!advanced)}
                  aria-expanded={advanced}
                >
                  <SlidersHorizontal size={16} />
                  <span>Дополнительные настройки</span>
                  <ChevronDown size={16} />
                </button>
                {advanced && (
                  <div className="settings-grid advanced-fields">
                    {optionFields(model)
                      .filter(
                        ([key]) =>
                          !['size', 'aspectRatio', 'resolution', 'duration', 'quality'].includes(key),
                      )
                      .map(([key, schema]) => (
                        <Field
                          key={currentKey + key}
                          name={key}
                          schema={schema}
                          value={options[key]}
                          onChange={(v) => setOptions((prev) => ({ ...prev, [key]: v }))}
                        />
                      ))}
                  </div>
                )}
              </>
            )}
            {auth.user && (
              <FileOutputEditor value={fileOutput.value} onChange={fileOutput.onChange} disabled={busy} />
            )}
            <details className="workspace-details">
              <summary>Съёмка и стиль</summary>
              <div className="details-content">
                <p className="small muted">Пожелания добавятся к запросу. Их выполнение зависит от модели.</p>
                <div className="settings-grid">
                  {['Камера', 'Движение', 'Свет', 'Стиль'].map((label) => (
                    <label className="setting-field" key={label}>
                      <span>{label}</span>
                      <input
                        value={shot[label] || ''}
                        maxLength={300}
                        onChange={(e) => setShot((p) => ({ ...p, [label]: e.target.value }))}
                      />
                    </label>
                  ))}
                </div>
                {kind === 'video' && (
                  <label className="setting-field">
                    <span>Построение ролика</span>
                    <SelectControl
                      value={shot['Сцены'] || ''}
                      onChange={(e) => setShot((p) => ({ ...p, Сцены: e.target.value }))}
                    >
                      <option value="">По описанию</option>
                      <option>Один непрерывный кадр</option>
                      <option>Несколько последовательных сцен в одном ролике</option>
                    </SelectControl>
                  </label>
                )}
              </div>
            </details>
            <label className="option-check">
              <input
                type="checkbox"
                checked={useBrand}
                disabled={!prefs.value.brand}
                onChange={(e) => setUseBrand(e.target.checked)}
              />
              Использовать правила бренда
            </label>
            <details className="workspace-details">
              <summary>Сохранить как шаблон</summary>
              <div className="details-content">
                <label className="setting-field">
                  <span>Название шаблона</span>
                  <input value={presetName} maxLength={80} onChange={(e) => setPresetName(e.target.value)} />
                </label>
                <button
                  className="button"
                  disabled={!auth.user || !model || !prompt.trim() || !presetName.trim()}
                  onClick={() => {
                    if (prefs.value.presets.length >= 40) {
                      setNotice('Можно сохранить до 40 шаблонов. Удалите ненужные в разделе «Шаблоны».');
                      return;
                    }
                    if (
                      prefs.update((p) => ({
                        ...p,
                        presets: [
                          ...p.presets,
                          {
                            id: crypto.randomUUID(),
                            name: presetName.trim(),
                            category: 'Мои',
                            kind,
                            prompt: creativePrompt(prompt, '', shot),
                            model: model!.reference,
                            options,
                          },
                        ],
                      }))
                    )
                      setNotice('Шаблон сохранён в этом браузере.');
                  }}
                >
                  Сохранить шаблон
                </button>
              </div>
            </details>
            {(notice || prefs.error) && (
              <p role="status" className="small muted">
                {prefs.error || notice}
              </p>
            )}
            {!conversationId && auth.user && (
              <label className="setting-field">
                <span>Ассистент</span>
                <SelectControl
                  aria-label="Ассистент"
                  value={agent?.reference.model || ''}
                  disabled={busy || !agents.data?.length}
                  onChange={(e) => setAgentKey(e.target.value)}
                >
                  {!agents.data?.length && (
                    <option>{agents.isPending ? 'Загружаем…' : 'Нет доступных ассистентов'}</option>
                  )}
                  {agents.data?.map((m) => (
                    <option key={m.reference.model} value={m.reference.model}>
                      {modelTitle(m)}
                    </option>
                  ))}
                </SelectControl>
              </label>
            )}
            {agents.error && !conversationId && (
              <p className="error">
                Не удалось загрузить ассистентов.{' '}
                <button className="text-button" onClick={() => void agents.refetch()}>
                  Обновить
                </button>
              </p>
            )}
            {conversation && !connection(conversation, kind) && (
              <p className="inline-error">
                В этой беседе не подключён инструмент {kind === 'image' ? 'изображений' : 'видео'}. Историю
                можно просматривать; для создания начните новую работу.
              </p>
            )}
            {send.error && send.variables?.id === conversationId && send.variables.sid === auth.session && (
              <p className="error form-error" role="alert">
                {send.error.message} Проверьте сообщения беседы перед повторной отправкой: запрос мог быть
                выполнен. Автоматического повтора нет.
              </p>
            )}
            {error && (
              <p className="error form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary generate-button"
              disabled={
                busy ||
                uploading ||
                (!!auth.user &&
                  (!model ||
                    !prompt.trim() ||
                    (!!idParam && (!conversation || !connection(conversation, kind))) ||
                    (!idParam && !agent)))
              }
              onClick={() => void submit()}
            >
              {busy ? (
                <>
                  <span>Создаём вашу идею</span>
                  <span className="spinner" />
                </>
              ) : (
                <>
                  <span>
                    {auth.user
                      ? 'Создать ' + (kind === 'image' ? 'изображение' : 'видео')
                      : 'Войти и создать'}
                  </span>
                  <ArrowUp size={19} />
                </>
              )}
            </button>
            <p className="billing-note">
              Ассистент использует выбранный инструмент. Работа ассистента и генерация оплачиваются с баланса.{' '}
              <Link className="text-button" to="/account#balance-history">
                История списаний
              </Link>
            </p>
          </section>
        </UploadSurface>
        <section className="studio-output" aria-label="Результаты генерации">
          {conversation && auth.user ? (
            <ConversationResults
              key={`${auth.user.id}:${conversation.id}`}
              conversation={conversation}
              latestRequest={send.variables?.id === conversation.id ? send.submittedAt : 0}
              onUseText={(text, targetKind, files) => {
                if (targetKind === kind) {
                  setPrompt(text);
                  setFocusPrompt((value) => value + 1);
                  setReferences(files.filter((f) => f.userId === auth.user?.id).slice(0, maxRefs));
                } else
                  navigate(
                    `/${targetKind}${connection(conversation, targetKind) ? `?conversation=${conversation.id}` : ''}`,
                    { state: { prompt: text, references: files, userId: auth.user?.id } },
                  );
              }}
              onUse={(file, targetKind) => {
                if (targetKind === kind) {
                  setReferences([file]);
                  setPrompt('');
                  setFocusPrompt((value) => value + 1);
                } else
                  navigate(`/${targetKind}?conversation=${conversation.id}`, {
                    state: { reference: file, userId: auth.user!.id },
                  });
              }}
            />
          ) : idParam && auth.user ? (
            <p className="muted">
              {conversationId && !conversationQuery.error
                ? 'Загружаем рабочую беседу…'
                : 'Выберите беседу в истории или начните новую работу.'}
            </p>
          ) : (
            <div className="studio-empty">
              <span className="empty-art">
                {kind === 'image' ? (
                  <ImagePlus size={36} strokeWidth={1} />
                ) : (
                  <Clapperboard size={36} strokeWidth={1} />
                )}
              </span>
              <span className="eyebrow">ЗДЕСЬ ПОЯВИТСЯ ВАША ИДЕЯ</span>
              <h2>{kind === 'image' ? 'Начните с воображения.' : 'Всё начинается с кадра.'}</h2>
              <p>
                Опишите то, что хотите увидеть.
                <br />
                Остальное — дело вашей творческой студии.
              </p>
              <div className="prompt-suggestions">
                {suggestions[kind].map((text) => (
                  <button key={text} onClick={() => setPrompt(text)}>
                    <Sparkles size={14} />
                    {text}
                  </button>
                ))}
              </div>
              <div className="empty-thumbnails">
                {[1, 4, 7].map((i) => (
                  <img key={i} src={`/media/gallery-${i}.jpg`} alt="Визуальное вдохновение" />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
      {referenceChoice && conversation && (
        <ReferenceChoice
          key={sourceScope}
          conversation={conversation}
          canUse={supportsReferences(model) && maxRefs > 0}
          onClose={() => setReferenceChoice(false)}
          onFresh={chooseFresh}
          onUse={(file) => {
            draft.changed();
            setReferences([file]);
            setFreshScope(undefined);
            setReferenceChoice(false);
          }}
          onOther={() => {
            setReferenceChoice(false);
            setReplaceReference(true);
            setPicker(true);
          }}
        />
      )}
      {modelBrowser && (
        <ModelBrowser
          models={models}
          value={currentKey}
          onSelect={(m) => {
            draft.changed();
            setSelected(modelKey(m));
          }}
          onClose={() => setModelBrowser(false)}
        />
      )}
      {picker && (
        <LibraryPicker
          multiple={!replaceReference}
          maxFiles={maxRefs - references.length}
          selected={references.map((f) => f.id)}
          onClose={() => setPicker(false)}
          onPick={(f) => {
            draft.changed();
            setFreshScope(undefined);
            setReferences((p) => (replaceReference ? [f] : [...p, f].slice(0, maxRefs)));
          }}
        />
      )}
    </div>
  );
}
