import { StudioEmptyState } from './StudioEmptyState';
import { parseStudioQuestion, withStudioContext, type StudioQuestion } from './studioAgent';
import { ComposerAttachment } from '../../components/ComposerAttachment';
import { ModelTitleWithInfo } from '../catalog/ModelTitleWithInfo';
import { IMAGE_UPLOAD_ACCEPT, isImageUpload, prepareImageUpload } from '../../lib/image-upload';
import { useComposerMenu } from '../../components/useComposerMenu';
import { useRetainedModel } from '../catalog/useRetainedModel';
import { scriptReferences } from './script';
import '../catalog/model-favorites.css';
import { TemplateEditor } from './TemplateEditor';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, getSession, type IUploadProgress } from '../../lib/api';
import type { IGnosisFile, IFileGeneration, IMessageCreate, IToolConnection } from '../../lib/types';
import { useContentConversation } from './useContentConversation';
import { ContentThread } from './ContentThread';
import { choices, ratioSizes, sizeRatio, suggestedRatios } from './controls';
import { followsReferenceRatio, referenceLimit, supportsReferences } from '../catalog/schema';
import { templateFrame, templateInstructions, type ITemplate } from './materials';
import { videoReferenceMode } from '../catalog/videoInputs';
import { mediaOptions } from './request';
import { textInstruction } from '../workspace/prompt';
import { createMessageBody, toolSettings, withMessageContext } from '../studio/conversations';
import { UploadButtonContent } from '../../components/UploadButtonContent';
import { ArrowUp, CircleAlert, Heart, Plus } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { LibraryPicker } from '../../components/LibraryPicker';
import { ModelMark } from './ModelMark';
import { useAuth } from '../auth/AuthProvider';
import { useDraft } from '../workspace/drafts';
import { toggleItem, usePreferences } from '../workspace/preferences';
import { defaultAssistant } from '../catalog/defaultAssistant';
import { favoritesFirst, modelKey, modelTitle, modelSummary } from '../catalog/presentation';
import templates from './templates.json';
import icons from './icons.json';
import fieldIcons from './fieldIcons.json';
import './prototype.css';
import './content-studio.css';

// Temporarily hidden by user request. Remove the mode entirely later; see docs/IMPLEMENTATION-DIFFERENCES.md.
const SCRIPT_WRITER_ENABLED = false;

type StudioMode = 'image' | 'video' | 'presentation';
interface IAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  slot?: 'start' | 'end';
  file?: File;
  saved?: IGnosisFile;
  restoreId?: number;
  isUnavailable?: boolean;
}
interface IReferenceDraft {
  id?: number;
  userId?: number;
  name: string;
  slot?: 'start' | 'end';
}
const modes: [StudioMode, string][] = [
  ['image', 'Изображение'],
  ['video', 'Видео'],
];
const fields = [
  {
    id: 'format',
    label: 'Формат',
    options: [
      'Не задано',
      'UGC, съёмка на телефон',
      'Премиум, студийный свет',
      'Минимализм, чистый фон',
      'Динамичный, быстрый ритм',
    ],
  },
  {
    id: 'idea',
    label: 'Идея',
    options: ['Не задано', 'Начать с проблемы', 'Начать с вопроса', 'Сразу показать товар', 'Резкий старт'],
  },
  {
    id: 'place',
    label: 'Обстановка',
    options: ['Не задано', 'Дома', 'На улице', 'В студии', 'В кафе', 'На природе'],
  },
  {
    id: 'camera',
    label: 'Камера',
    options: ['Авто', 'Статичная', 'С телефона', 'С рук', 'Низкий угол', 'Сверху'],
  },
  { id: 'move', label: 'Движение', options: ['Нет', 'Наезд', 'Отъезд', 'Объезд', 'Слежение'] },
  { id: 'lens', label: 'Линза', options: ['Авто', '24 мм', '35 мм', '50 мм', '85 мм', 'Макро'] },
  { id: 'light', label: 'Свет', options: ['Авто', 'Дневной', 'Студия', 'Золотой час', 'Ночь'] },
  { id: 'quality', label: 'Качество', options: ['480p', '720p', '1080p'] },
];
function Icon({ name }: { name: keyof typeof icons }) {
  return <span className="content-original-icon" dangerouslySetInnerHTML={{ __html: icons[name] }} />;
}

export function ContentStudio() {
  const { user, session, signIn } = useAuth();
  const work = useContentConversation();
  const [preparingFrame, setPreparingFrame] = useState(false);
  const frameEpoch = useRef(0);
  const [uploading, setUploading] = useState(false);
  const [restoringResult, setRestoringResult] = useState(false);
  const [restoredGeneration, setRestoredGeneration] = useState<IFileGeneration>();
  const [uploadProgress, setUploadProgress] = useState<IUploadProgress>();
  const submitting = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const location = useLocation();
  const prefs = usePreferences();
  const [guestFavorites, setGuestFavorites] = useState<string[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('genfactory.content-template-favorites.guest') || '[]');
      return Array.isArray(value) ? value.filter((id: unknown) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const favorites = user ? prefs.value.favoriteTemplates : guestFavorites;
  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
    if (user) prefs.update((current) => ({ ...current, favoriteTemplates: next }));
    else {
      setGuestFavorites(next);
      localStorage.setItem('genfactory.content-template-favorites.guest', JSON.stringify(next));
    }
  };
  const [mode, setMode] = useState<StudioMode>('video');
  const [panel, setPanel] = useState('templates');
  const [selectedModel, setSelectedModel] = useState('Auto');
  const catalog = useQuery({
    queryKey: ['content-studio-models', user?.id, mode],
    enabled: !!user,
    staleTime: 300000,
    queryFn: async ({ signal }) =>
      mode === 'presentation'
        ? api.conversationModels(signal)
        : (
            await Promise.all(
              (mode === 'image'
                ? ['OPEN_ROUTER_IMAGE']
                : mode === 'video'
                  ? ['OPEN_ROUTER_VIDEO']
                  : ['OPEN_ROUTER_CONVERSATION']
              ).map((provider) => api.catalog(provider, signal)),
            )
          ).flat(),
  });
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem('genfactory.content-gallery-width');
    return ['s', 'm', 'l'].includes(saved || '') ? saved! : 'm';
  });
  const [genre, setGenre] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [draft, setDraft] = useState((location.state as { prompt?: string } | null)?.prompt || '');
  const [writer, setWriter] = useState<boolean>(SCRIPT_WRITER_ENABLED);
  const [brand, setBrand] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({
    ...Object.fromEntries(fields.map((f) => [f.id, f.options[0]])),
    quality: '720p',
  });
  const [ratios, setRatios] = useState<Record<StudioMode, string>>({
    image: '1:1',
    video: '9:16',
    presentation: '16:9',
  });
  const ratio = ratios[mode];
  const setRatio = (value: string) => setRatios((current) => ({ ...current, [mode]: value }));
  const [imageQuality, setImageQuality] = useState('');
  const [duration, setDuration] = useState(8);
  const [sound, setSound] = useState('Без звука');
  const [shape, setShape] = useState('Один кадр');
  const [picked, setPicked] = useState<ITemplate[]>([]);
  const [attachments, setAttachments] = useState<IAttachment[]>([]);
  const [restoringReferences, setRestoringReferences] = useState<{
    scope: string;
    values: Array<IReferenceDraft>;
  }>();
  const [frameSlot, setFrameSlot] = useState<'start' | 'end'>();
  const [frameMenu, setFrameMenu] = useState<'start' | 'end'>();
  const [library, setLibrary] = useState<{ scope: string; slot?: 'start' | 'end' }>();
  const [templateNotice, setTemplateNotice] = useState('');
  const [appliedTemplate, setAppliedTemplate] = useState('');
  const [templateStartsFresh, setTemplateStartsFresh] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ITemplate>();
  const [selectedTemplate, setSelectedTemplate] = useState<string>();
  const [mobileGallery, setMobileGallery] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const focusRestoredDraft = useRef(false);
  const urls = useRef(new Set<string>());
  useEffect(
    () => () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  useEffect(() => {
    if (textarea.current) {
      textarea.current.style.height = '72px';
    }
  }, [draft]);
  const current = (templates as ITemplate[]).filter((t) => t.kind === mode);
  const genres = [...new Set(current.map((t) => t.genre).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ru'),
  );
  const visible = current
    .filter((t) => (!genre || t.genre === genre) && (!favoritesOnly || favorites.includes(t.id)))
    .sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)));
  const pick = async (item: ITemplate) => {
    if (preparingFrame || work.busy || uploading) return;
    setMobileGallery(false);
    if (frameSlot) {
      const slot = frameSlot;
      const epoch = ++frameEpoch.current;
      setPreparingFrame(true);
      work.setError('');
      try {
        const file = await templateFrame(item, slot);
        if (!alive.current || frameEpoch.current !== epoch) return;
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        setAttachments((previous) => [
          ...previous.filter((attachment) => attachment.slot !== slot),
          {
            id: crypto.randomUUID(),
            name: `${slot === 'start' ? 'Первый' : 'Последний'} кадр — ${item.title}`,
            url,
            type: file.type,
            slot,
            file,
          },
        ]);
        setFrameSlot(undefined);
      } catch (error) {
        if (alive.current && frameEpoch.current === epoch)
          work.setError(error instanceof Error ? error.message : 'Не удалось подготовить кадр.');
      } finally {
        if (alive.current) setPreparingFrame(false);
      }
    } else {
      setEditingTemplate(item);
    }
    setSelectedTemplate(undefined);
    textarea.current?.focus();
  };
  const savedTool = work.conversation?.options.tools?.find(
    (tool) =>
      typeof tool === 'object' &&
      (mode === 'image' ? ['IMAGE', 'IMAGE_OPEN_ROUTER'] : ['VIDEO', 'VIDEO_OPEN_ROUTER']).includes(tool.uid),
  );
  const savedReference = typeof savedTool === 'object' ? savedTool.settings?.model : undefined;
  const retained = useRetainedModel(savedReference, catalog.data, user?.id);
  const model =
    catalog.data?.find((item) => modelKey(item) === selectedModel || item.name === selectedModel) ||
    (retained &&
    (selectedModel === modelKey(retained) || selectedModel === retained.name || selectedModel === 'Auto')
      ? retained
      : undefined) ||
    (selectedModel === 'Auto' && !savedReference
      ? mode === 'presentation'
        ? defaultAssistant(catalog.data || [])
        : catalog.data?.[0]
      : undefined);
  const modelProperties = model?.schema.properties?.options?.properties || {};
  const sizes = ratioSizes(model);
  const ratioOptions = model
    ? modelProperties.aspectRatio
      ? choices(modelProperties.aspectRatio, suggestedRatios)
      : [...sizes.keys()]
    : suggestedRatios;
  const referenceRatio = followsReferenceRatio(
    model,
    attachments.length,
    attachments.some((file) => !!file.slot) ? 'frames' : undefined,
  );
  const effectiveRatio = ratio;
  const qualityField = modelProperties[mode === 'image' ? 'quality' : 'resolution'];
  const qualityOptions = model
    ? choices(qualityField, mode === 'image' ? [] : ['480p', '720p', '1080p'])
    : fields.find((field) => field.id === 'quality')!.options;
  const effectiveQuality =
    mode === 'image'
      ? imageQuality || String(qualityField?.default || qualityOptions[0] || '')
      : settings.quality;
  const durations = model ? choices(modelProperties.duration, [4, 6, 8, 10, 15]) : [4, 6, 8, 10, 15];
  const audioValues = model ? choices(modelProperties.generateAudio, [false, true]) : [false, true];
  const soundOptions: string[] = audioValues.map((value) => (value ? 'Со звуком' : 'Без звука'));
  const effectiveSound = soundOptions.length === 1 ? soundOptions[0] : sound;
  const studioValue = {
    mode,
    selectedModel,
    writer,
    brand,
    settings,
    ratios,
    imageQuality,
    duration,
    sound,
    shape,
    restoredGeneration,
    appliedTemplate,
    templateStartsFresh,
    templateIds: picked.map((item) => item.id),
    draft,
    references: attachments.map((item): IReferenceDraft => ({
      id: item.saved?.id ?? item.restoreId,
      userId: item.saved?.userId ?? user?.id,
      name: item.name,
      slot: item.slot,
    })),
  };
  const initialStudioValue = useRef({ ...studioValue, draft: '' });
  const studioDraft = useDraft(`content-studio.${work.id ?? 'new'}`, studioValue, true);
  const draftScope = `${user?.id ?? 'guest'}:${work.id ?? `new:${location.key}`}`;
  const imageSelectionScope = useRef<object>({});
  useEffect(() => {
    imageSelectionScope.current = {};
    setPreparingFrame(false);
    return () => {
      imageSelectionScope.current = {};
    };
  }, [draftScope, session, location.key, mode]);
  const [readyScope, setReadyScope] = useState('');
  const createdConversation = useRef<number | undefined>(undefined);
  const restored = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (readyScope === draftScope || (work.id && !work.conversation)) return;
    const stored = work.id ? studioDraft.available?.value : undefined;
    const ownCreation = work.id !== undefined && createdConversation.current === work.id;
    const changingProject = !!readyScope && !ownCreation;
    const saved = stored || (changingProject || !work.id ? initialStudioValue.current : undefined);
    if (changingProject) {
      setAttachments([]);
      setPicked([]);
      setDraft('');
      setRestoringReferences(undefined);
      setLibrary(undefined);
      setEditingTemplate(undefined);
      setTemplateNotice('');
      setAppliedTemplate('');
      setTemplateStartsFresh(false);
      setRestoredGeneration(undefined);
      setFrameSlot(undefined);
      setFrameMenu(undefined);
      restored.current = undefined;
    }
    if (saved && ['image', 'video', 'presentation'].includes(saved.mode)) {
      const removedPresentation = saved.mode === 'presentation';
      setMode(removedPresentation ? 'image' : saved.mode);
      if (removedPresentation) setSelectedModel('Auto');
      else if (typeof saved.selectedModel === 'string') setSelectedModel(saved.selectedModel);
      if (typeof saved.writer === 'boolean') setWriter(SCRIPT_WRITER_ENABLED && saved.writer);
      if (typeof saved.brand === 'boolean') setBrand(saved.brand);
      if (saved.settings && typeof saved.settings === 'object')
        setSettings((current) => ({
          ...current,
          ...Object.fromEntries(
            Object.entries(saved.settings).filter(
              ([key, value]) => fields.some((field) => field.id === key) && typeof value === 'string',
            ),
          ),
        }));
      if (saved.ratios && typeof saved.ratios === 'object')
        setRatios((current) => ({
          ...current,
          ...Object.fromEntries(
            Object.entries(saved.ratios).filter(
              ([key, value]) => modes.some(([mode]) => mode === key) && typeof value === 'string',
            ),
          ),
        }));
      if (typeof saved.imageQuality === 'string') setImageQuality(saved.imageQuality);
      if (typeof saved.duration === 'number' && Number.isFinite(saved.duration)) setDuration(saved.duration);
      if (['Без звука', 'Со звуком'].includes(saved.sound)) setSound(saved.sound);
      if (['Один кадр', 'Набор сцен'].includes(saved.shape)) setShape(saved.shape);
      setAppliedTemplate(
        !removedPresentation && typeof saved.appliedTemplate === 'string' ? saved.appliedTemplate : '',
      );
      setTemplateStartsFresh(!removedPresentation && saved.templateStartsFresh === true);
      if (Array.isArray(saved.templateIds))
        setPicked(
          (templates as ITemplate[]).filter(
            (item) => saved.templateIds.includes(item.id) && modes.some(([kind]) => kind === item.kind),
          ),
        );
      setRestoredGeneration(removedPresentation ? undefined : saved.restoredGeneration);
      if (typeof saved.draft === 'string') setDraft(saved.draft);
      if (Array.isArray(saved.references) && saved.references.length) {
        setRestoringReferences({ scope: draftScope, values: saved.references });
      } else setRestoringReferences(undefined);
      if (stored) restored.current = work.id;
    }
    if (!work.id) studioDraft.clear();
    createdConversation.current = undefined;
    setReadyScope(draftScope);
  }, [draftScope, readyScope, work.conversation, studioDraft.available]);
  useEffect(() => {
    if (!restoringReferences || restoringReferences.scope !== draftScope || !user || !session) return;
    let cancelled = false;
    const sid = session;
    const values = restoringReferences.values.filter((item) => item && typeof item.name === 'string');
    const pending: IAttachment[] = values.map((item) => ({
      id: crypto.randomUUID(),
      name: item.name,
      url: '',
      type: 'image/',
      slot: item.slot === 'start' || item.slot === 'end' ? item.slot : undefined,
      restoreId: item.id,
      isUnavailable: true,
    }));
    setAttachments(pending);
    void Promise.all(
      values.map(async (item, index): Promise<IAttachment> => {
        const slot = item.slot === 'start' || item.slot === 'end' ? item.slot : undefined;
        const id =
          item.userId === user.id && Number.isSafeInteger(item.id) && item.id! > 0 ? item.id : undefined;
        if (id) {
          try {
            const file = await api.file(id, sid);
            if (file.userId === user.id && file.type === 'IMAGE') {
              return {
                id: pending[index].id,
                name: file.name,
                url: file.path,
                type: file.mime,
                saved: file,
                slot,
              };
            }
          } catch {
            // Keep an unavailable reference visible; never silently generate without it.
          }
        }
        return {
          id: crypto.randomUUID(),
          name: item.name,
          url: '',
          type: 'image/',
          slot,
          restoreId: id,
          isUnavailable: true,
        };
      }),
    ).then((items) => {
      if (cancelled || getSession() !== sid) return;
      // Keep removals made while file metadata was loading.
      setAttachments((previous) =>
        previous.flatMap((item) => {
          const index = pending.indexOf(item);
          return index === -1 ? [item] : [items[index]];
        }),
      );
      setRestoringReferences(undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [restoringReferences, draftScope, session, user?.id]);
  const studioSerialized = JSON.stringify(studioValue);
  useEffect(() => {
    if (!restoringReferences && readyScope === draftScope && (!work.id || restored.current === work.id))
      studioDraft.changed();
  }, [readyScope, draftScope, studioSerialized, work.conversation, restoringReferences]);
  useEffect(() => {
    const conversation = work.conversation;
    if (!conversation || restored.current === conversation.id || readyScope !== draftScope) return;
    const tool = conversation.options.tools?.find(
      (item) =>
        typeof item !== 'string' &&
        ['IMAGE', 'IMAGE_OPEN_ROUTER', 'VIDEO', 'VIDEO_OPEN_ROUTER'].includes(item.uid),
    );
    if (tool && typeof tool !== 'string') {
      const target = ['IMAGE', 'IMAGE_OPEN_ROUTER'].includes(tool.uid) ? 'image' : 'video';
      if (mode !== target) {
        setMode(target);
        return;
      }
      const selected =
        catalog.data?.find(
          (item) =>
            item.reference.provider === tool.settings?.model.provider &&
            item.reference.model === tool.settings?.model.model,
        ) || retained;
      if (tool.settings && !selected) return;
      if (selected) setSelectedModel(modelKey(selected));
      setWriter(false);
      const options = tool.settings?.options;
      if (typeof options?.aspectRatio === 'string')
        setRatios((current) => ({ ...current, [target]: options.aspectRatio as string }));
      else if (typeof options?.size === 'string')
        setRatios((current) => ({ ...current, [target]: sizeRatio(options.size as string) }));
      if (typeof options?.duration === 'number') setDuration(options.duration);
      if (typeof options?.generateAudio === 'boolean')
        setSound(options.generateAudio ? 'Со звуком' : 'Без звука');
      const quality = options?.resolution || options?.quality;
      if (typeof quality === 'string') {
        if (target === 'image') setImageQuality(quality);
        else setSettings((current) => ({ ...current, quality }));
      }
    }
    restored.current = conversation.id;
  }, [work.conversation, catalog.data, retained, mode, readyScope, draftScope]);
  const agent = defaultAssistant(work.agents);
  const attachmentBusy = work.busy || uploading || preparingFrame || restoringResult;
  const busy = attachmentBusy || restoringReferences?.scope === draftScope;
  useEffect(() => {
    if (!busy && focusRestoredDraft.current) {
      focusRestoredDraft.current = false;
      textarea.current?.focus();
    }
  }, [busy]);
  function pickLibraryFile(file: IGnosisFile) {
    if (!library || library.scope !== draftScope || busy || file.userId !== user?.id) return;
    if (file.type !== 'IMAGE' || !/^image\/(jpeg|png|webp)$/.test(file.mime)) {
      work.setError('Выберите изображение JPEG, PNG или WebP.');
      return;
    }
    const slot = library.slot;
    const retained = attachments.filter((item) => !slot || item.slot !== slot);
    if (!slot && retained.some((item) => item.saved?.id === file.id)) return;
    if (retained.some((item) => (slot ? !item.slot : !!item.slot))) {
      work.setError('Не смешивайте опорные кадры и обычные референсы.');
      return;
    }
    if (
      !writer &&
      mode !== 'presentation' &&
      model &&
      (retained.length + 1 > referenceLimit(model) || (slot === 'end' && referenceLimit(model) < 2))
    ) {
      work.setError('Модель не поддерживает выбранное количество референсов.');
      return;
    }
    setAttachments([
      ...retained,
      { id: String(file.id), name: file.name, url: file.path, type: file.mime, saved: file, slot },
    ]);
    setFrameSlot(undefined);
    work.setError('');
  }

  async function restoreResult(file: IGnosisFile) {
    const generation = file.origin?.generation;
    if (!generation || !session || !user || busy) return;
    const sid = session;
    const conversationId = work.id;
    const current = () =>
      alive.current &&
      getSession() === sid &&
      new URLSearchParams(window.location.search).get('conversation') === String(conversationId);
    setRestoringResult(true);
    work.setError('');
    try {
      if (generation.maskFileId)
        throw new Error(
          'Этот результат создан с маской. В студии восстановление масок пока не поддерживается.',
        );
      const target = file.type === 'IMAGE' ? 'image' : file.type === 'VIDEO' ? 'video' : undefined;
      if (!target) throw new Error('Восстановление этого типа результата пока не поддерживается.');
      const available = await api.catalog(generation.model.provider);
      const selected = available.find(
        (item) =>
          item.reference.provider === generation.model.provider &&
          item.reference.model === generation.model.model,
      );
      if (!selected) throw new Error('Модель этой генерации больше недоступна.');
      const sources = await Promise.all((file.origin?.sourceFileIds || []).map((id) => api.file(id, sid)));
      if (sources.some((source) => source.userId !== user.id || source.type !== 'IMAGE'))
        throw new Error('Один из исходных файлов недоступен или не является изображением.');
      const properties = selected.schema.properties?.options?.properties || {};
      if (Object.keys(generation.options).some((key) => !properties[key]))
        throw new Error('Некоторые сохранённые параметры больше не поддерживаются моделью.');
      mediaOptions(
        selected,
        target,
        generation.prompt,
        sources,
        generation.options,
        target === 'video'
          ? Array.isArray(generation.options.frameImages) && generation.options.frameImages.length
            ? 'frames'
            : videoReferenceMode(selected, sources.length)
          : undefined,
      );
      if (!current()) return;
      setMode(target);
      setSelectedModel(modelKey(selected));
      setWriter(false);
      setBrand(false);
      setPicked([]);
      setShape('Один кадр');
      setSettings({
        ...initialStudioValue.current.settings,
        ...(typeof generation.options.resolution === 'string'
          ? { quality: generation.options.resolution }
          : {}),
      });
      setImageQuality(typeof generation.options.quality === 'string' ? generation.options.quality : '');
      const options = generation.options;
      setRatios((previous) => ({
        ...previous,
        [target]:
          typeof options.aspectRatio === 'string'
            ? options.aspectRatio
            : typeof options.size === 'string'
              ? sizeRatio(options.size)
              : initialStudioValue.current.ratios[target],
      }));
      setDuration(
        typeof options.duration === 'number' ? options.duration : initialStudioValue.current.duration,
      );
      setSound(options.generateAudio === true ? 'Со звуком' : 'Без звука');
      setDraft(generation.prompt);
      setRestoredGeneration(generation);
      setAttachments(
        sources.map((source, index) => ({
          id: String(source.id),
          name: source.name,
          url: source.path,
          type: source.mime,
          saved: source,
          ...(target === 'video' &&
          Array.isArray(generation.options.frameImages) &&
          generation.options.frameImages.length
            ? { slot: index === 0 ? ('start' as const) : ('end' as const) }
            : {}),
        })),
      );
      setFrameSlot(undefined);
      setFrameMenu(undefined);
      // Focus after React enables the editor, not before the restoring state is committed.
      focusRestoredDraft.current = true;
    } catch (error) {
      if (current())
        work.setError(error instanceof Error ? error.message : 'Не удалось восстановить параметры.');
    } finally {
      if (alive.current) setRestoringResult(false);
    }
  }
  async function applyScript(text: string, messageId: number) {
    if (busy || !work.id || !session) return;
    const id = work.id;
    const sid = session;
    const current = () =>
      alive.current &&
      getSession() === sid &&
      new URLSearchParams(window.location.search).get('conversation') === String(id);
    setRestoringResult(true);
    work.setError('');
    try {
      let files: Array<IGnosisFile> = [];
      if (!attachments.length) {
        for (let page = 0; ; page++) {
          const messages = await api.messages(id, page, undefined, sid);
          if (!current()) return;
          const found = scriptReferences(messages.items, messageId);
          if (found) {
            files = found;
            break;
          }
          if (page + 1 >= messages.pages || !messages.items.length) break;
        }
      }
      if (!current()) return;
      setDraft(text);
      setWriter(false);
      setAttachments((previous) =>
        previous.length
          ? previous
          : files.map((file) => ({
              id: String(file.id),
              name: file.name,
              url: file.path,
              type: file.mime,
              saved: file,
            })),
      );
      focusRestoredDraft.current = true;
    } catch (error) {
      if (current())
        work.setError(error instanceof Error ? error.message : 'Не удалось восстановить материалы сценария.');
    } finally {
      if (alive.current) setRestoringResult(false);
    }
  }

  async function submit() {
    if (!user || !session) {
      void signIn();
      return;
    }
    if (model?.status === 'DISABLED') {
      work.setError('Модель отключена администратором. Выберите другую модель.');
      return;
    }
    if (busy || submitting.current) return;
    if (!draft.trim() && !picked.length && !attachments.length) return;
    submitting.current = true;
    work.setError('');
    const sid = session;
    const current = () => alive.current && getSession() === sid;
    const sourceDraft = draft;
    const sourceAttachments = attachments;
    const preparingScript = SCRIPT_WRITER_ENABLED && writer;
    try {
      if (sourceAttachments.some((item) => item.isUnavailable))
        throw new Error(
          'Референс недоступен. Выберите файл заново в библиотеке или уберите его перед отправкой.',
        );
      if (picked.some((item) => item.kind !== mode))
        throw new Error('Выбран шаблон другого типа. Вернитесь в его режим или уберите шаблон.');
      if (sourceAttachments.some((item) => item.slot) && sourceAttachments.some((item) => !item.slot))
        throw new Error(
          'Не смешивайте опорные кадры с обычными референсами: оставьте начальный и конечный кадры либо обычные изображения.',
        );
      if (!preparingScript && mode !== 'presentation' && model) {
        if (
          sourceAttachments.length &&
          (!supportsReferences(model) || sourceAttachments.length > referenceLimit(model))
        )
          throw new Error('Модель не поддерживает выбранное количество референсов.');
        if (ratioOptions.length && !ratioOptions.includes(ratio))
          throw new Error('Выберите формат из доступных для этой модели.');
        if (qualityOptions.length && !qualityOptions.includes(effectiveQuality))
          throw new Error('Выберите качество из доступных для этой модели.');
        if (mode === 'video' && modelProperties.duration && !durations.includes(duration))
          throw new Error('Выберите длительность из доступных для этой модели.');
        if (mode === 'video' && soundOptions.length && !soundOptions.includes(effectiveSound))
          throw new Error('Выберите доступную настройку звука.');
      }
      if (sourceAttachments.some((item) => !item.type.startsWith('image/')))
        throw new Error(
          'На этом этапе можно передавать только изображения. Документы, аудио и видео пока не подключены.',
        );
      if (
        mode === 'video' &&
        sourceAttachments.some((item) => item.slot === 'end') &&
        !sourceAttachments.some((item) => item.slot === 'start')
      )
        throw new Error(
          'Для конечного кадра добавьте начальный: текущий видеоинструмент не поддерживает только конечный кадр.',
        );
      if (picked.some((item) => !item.prompt.trim()))
        throw new Error(
          'У выбранного шаблона нет описания для генерации. Уберите его и опишите задачу текстом.',
        );
      if (!model) throw new Error('Выберите доступную модель.');
      if (!work.conversation && !agent) throw new Error('Не удалось загрузить модель ассистента.');
      const savedFiles: IGnosisFile[] = [];
      setUploading(sourceAttachments.length > 0);
      const ordered = [...sourceAttachments].sort(
        (a, b) =>
          (a.slot === 'start' ? -1 : a.slot === 'end' ? 1 : 0) -
          (b.slot === 'start' ? -1 : b.slot === 'end' ? 1 : 0),
      );
      for (const attachment of ordered) {
        let saved = attachment.saved;
        if (saved) {
          saved = await api.file(saved.id, sid);
          if (saved.userId !== user.id) throw new Error('Материал недоступен этому аккаунту.');
        } else {
          if (!attachment.file)
            throw new Error('Кадр из галереи пока не подключён как референс. Загрузите изображение файлом.');
          saved = await api.upload(attachment.file, sid, undefined, (progress) => {
            if (current()) setUploadProgress(progress);
          });
          if (!current()) return;
          const file = saved;
          setAttachments((previous) =>
            previous.map((item) => (item.id === attachment.id ? { ...item, saved: file } : item)),
          );
        }
        if (!current()) return;
        savedFiles.push(saved);
      }
      setUploading(false);
      const creative = fields
        .filter(
          (field) => field.id !== 'quality' && (mode === 'video' || !['camera', 'move'].includes(field.id)),
        )
        .filter((field) => !['Авто', 'Нет', 'Не задано'].includes(settings[field.id]))
        .map((field) => `${field.label}: ${settings[field.id]}`);
      const context = [
        ...(preparingScript && mode === 'video'
          ? [
              `Сценарий для ролика длительностью ${duration} с, формат ${referenceRatio ? 'по исходному кадру' : effectiveRatio}. Не увеличивай длительность.`,
            ]
          : []),
        templateInstructions(picked),
        ...(creative.length
          ? [
              'Настройки съёмки обязательны для каждой сцены, включая последнюю. Если шаблон им противоречит, используй настройки текущего запуска.',
              ...creative,
            ]
          : []),
        ...(mode === 'video'
          ? [
              `Структура: ${shape}. Это настройка текущего запуска; она важнее структуры шаблона, готового сценария и предыдущих сообщений.`,
              shape === 'Один кадр'
                ? 'Адаптируй сюжет в один непрерывный план без склеек, монтажных переходов и смен сцен. Сохрани героев, предметы и основное действие; движение камеры допустимо. Если исходный текст разбит на несколько планов, не переноси это разбиение в сценарий и промпт инструмента VIDEO: опиши действие непрерывно.'
                : 'Построй последовательность сцен; монтажные переходы допустимы. Общая длительность всех сцен вместе должна соответствовать длительности текущего запуска, а не назначаться каждой сцене отдельно.',
            ]
          : []),
        ...(brand && prefs.value.brand ? [`Правила бренда: ${prefs.value.brand}`] : []),
      ]
        .filter(Boolean)
        .join('\n\n');
      const prompt = withMessageContext(sourceDraft, context);
      let tools: IToolConnection[] = [];
      let body: IMessageCreate;
      if (preparingScript || mode === 'presentation') {
        body = {
          role: 'USER',
          files: savedFiles.map((file) => file.id),
          settings: { tools: [], isToolsDisabled: true },
          text:
            mode === 'presentation'
              ? `[Genfactory:presentation]\nПодготовь текст по слайдам на основе задачи и истории проекта. Это текстовая структура, не готовый файл презентации. Используй только факты из брифа и истории. Не утверждай ничего о рынке, конкурентах, достижениях и цифрах без источника пользователя. Недостающие данные обозначай «Нужно уточнить». Предположения выделяй как гипотезы, а не факты.\n\nЗапрос пользователя:\n${prompt}`
              : textInstruction('script', prompt, {
                  language: 'Русский',
                  target: mode,
                  aspects: [],
                  brand: '',
                }),
        };
      } else {
        const replay =
          restoredGeneration &&
          modelKey(model) === `${restoredGeneration.model.provider}:${restoredGeneration.model.model}`
            ? restoredGeneration.options
            : undefined;
        const preservedSize = typeof replay?.size === 'string' && sizeRatio(replay.size) === effectiveRatio;
        const referenceMode =
          mode === 'video'
            ? videoReferenceMode(
                model,
                savedFiles.length,
                sourceAttachments.some((file) => !!file.slot),
              )
            : undefined;
        const options = mediaOptions(
          model,
          mode,
          prompt,
          savedFiles,
          {
            ...replay,
            ...(ratioOptions.length && !preservedSize ? { aspectRatio: effectiveRatio } : {}),
            ...(mode === 'image' && modelProperties.quality ? { quality: effectiveQuality } : {}),
            ...(mode === 'video'
              ? {
                  ...(modelProperties.duration ? { duration } : {}),
                  ...(modelProperties.resolution ? { resolution: effectiveQuality } : {}),
                  ...(audioValues.length ? { generateAudio: effectiveSound === 'Со звуком' } : {}),
                }
              : {}),
          },
          referenceMode,
        );
        const tool = toolSettings(mode, model, options);
        tools = [tool];
        const launch = [
          `Модель: ${model.reference.model}`,
          modelProperties.size && options.size
            ? `Размер (options.size): ${options.size}`
            : referenceRatio
              ? 'Формат: по исходному кадру'
              : ratioOptions.length
                ? `Формат: ${effectiveRatio}`
                : '',
          effectiveQuality ? `Качество: ${effectiveQuality}` : '',
          mode === 'video' && modelProperties.duration ? `Длительность: ${duration} с` : '',
          mode === 'video' && audioValues.length ? effectiveSound : '',
        ]
          .filter(Boolean)
          .join('; ');
        body = createMessageBody(
          withMessageContext(
            sourceDraft,
            `${context}\n\nПараметры текущего запуска (важнее текста шаблона): ${launch}. Не переопределяй их при вызове инструмента.`,
          ),
          mode,
          tool,
          savedFiles.map((file) => file.id),
          !work.id || !!restoredGeneration || templateStartsFresh,
          undefined,
          referenceMode,
          true,
        );
        const historyFiles = await work.historyFiles();
        if (!current()) return;
        body.text = withStudioContext(body.text, {
          ...(historyFiles.length ? { historyFiles } : {}),
          uid: mode === 'image' ? 'IMAGE' : 'VIDEO',
          settings: tool.settings!,
          input:
            mode === 'image'
              ? {
                  request: { task: { fileIds: savedFiles.map((file) => file.id) } },
                  ...(savedFiles.length
                    ? { isDrawNew: false }
                    : historyFiles.length
                      ? {}
                      : { isDrawNew: true }),
                }
              : { fileIds: savedFiles.map((file) => file.id), referenceMode },
        });
      }
      const success = await work.submit(
        body,
        sourceDraft || picked[0]?.title || 'Студия контента',
        tools,
        mode === 'presentation' ? model : agent,
        (id) => {
          createdConversation.current = id;
        },
      );
      if (success && current()) {
        setTemplateStartsFresh(false);
        setTemplateNotice('');
        if (!work.id) studioDraft.clear();
        setDraft((value) => (value === draft ? '' : value));
        setAttachments((previous) =>
          previous.filter((item) => !sourceAttachments.some((source) => source.id === item.id)),
        );
        setPicked((previous) => previous.filter((item) => !picked.some((source) => source.id === item.id)));
        setAppliedTemplate('');
        setRestoredGeneration(undefined);
      }
    } catch (e) {
      if (current()) work.setError(e instanceof Error ? e.message : 'Не удалось отправить задачу.');
    } finally {
      submitting.current = false;
      if (current()) {
        setUploading(false);
        setUploadProgress(undefined);
      }
    }
  }
  const answeringQuestion = useRef(false);
  async function answerQuestion(question: StudioQuestion, messageId: number, answer: string) {
    if (busy || !work.id || !session || answeringQuestion.current) return false;
    answeringQuestion.current = true;
    const id = work.id;
    const sid = session;
    try {
      const latest = await api.messages(id, 0, undefined, sid);
      if (getSession() !== sid || !alive.current) return false;
      const last = latest.items[0];
      if (
        last?.id !== messageId ||
        last.role !== 'ASSISTANT' ||
        !parseStudioQuestion(last.text, latest.items.find((item) => item.role === 'USER')?.text)
      ) {
        work.setError('На этот вопрос уже ответили. Обновите диалог.');
        return false;
      }
      const connection = { uid: question.context.uid, settings: question.context.settings };
      const ids =
        question.context.uid === 'IMAGE'
          ? (question.context.input as any).request.task.fileIds
          : question.context.input.fileIds;
      let answerContext = question.context;
      if (!(ids as number[]).length && !answerContext.historyFiles) {
        const historyFiles = await work.historyFiles();
        if (historyFiles.length) {
          answerContext = { ...answerContext, historyFiles, input: { ...answerContext.input } };
          delete answerContext.input.isDrawNew;
        }
      }
      return await work.submit(
        {
          role: 'USER',
          text: withStudioContext(`Ответ на вопрос «${question.question}»: ${answer}`, answerContext),
          files: ids as number[],
          settings: { tools: [connection] },
        },
        answer,
        [connection],
        agent,
      );
    } catch (error) {
      work.setError(error instanceof Error ? error.message : 'Не удалось отправить ответ.');
      return false;
    } finally {
      answeringQuestion.current = false;
    }
  }

  return (
    <div className={`content-studio ${mobileGallery ? 'mobile-gallery-open' : ''}`}>
      <div id="creatives" className="panel ms-dots">
        <div className="cw" id="creative-workspace" data-gallery={width}>
          <section className="cw-chat" aria-label="Чат проекта">
            <StudioEmptyState />
            <div className="cw-stage">
              <div className="cw-thread">
                {work.conversation && (
                  <ContentThread
                    key={work.conversation.id}
                    conversation={work.conversation}
                    busy={busy}
                    onAnswer={answerQuestion}
                    onUseParameters={(file) => void restoreResult(file)}
                    onUseScript={(text, id) => void applyScript(text, id)}
                    onRepeat={(text) => {
                      setDraft(text);
                      textarea.current?.focus();
                    }}
                    onUse={(file, kind) => {
                      setMode(kind);
                      setSelectedModel('Auto');
                      setWriter(false);
                      setAttachments([
                        {
                          id: String(file.id),
                          name: file.name,
                          url: file.path,
                          type: file.mime,
                          saved: file,
                          ...(kind === 'video' ? { slot: 'start' as const } : {}),
                        },
                      ]);
                      textarea.current?.focus();
                    }}
                  />
                )}
              </div>
            </div>
            <div className="cw-composer-stack">
              <div
                className="cw-mode ds-segment is-ready"
                id="cw-mode"
                role="group"
                aria-label="Вид генерации"
              >
                <span
                  className="cw-mode-rail"
                  aria-hidden="true"
                  style={{
                    width: 44,
                    transform: `translate(${4 + modes.findIndex(([key]) => key === mode) * 44}px, 4px)`,
                  }}
                />
                {modes.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={label}
                    aria-pressed={mode === key}
                    disabled={busy}
                    onClick={() => {
                      frameEpoch.current++;
                      setFrameSlot(undefined);
                      setMode(key);
                      setSelectedModel('Auto');
                      setGenre('');
                      setFrameMenu(undefined);
                    }}
                  >
                    <Icon name={key} />
                  </button>
                ))}
              </div>
              <form
                className="cw-compose studio-compose"
                id="cw-compose"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <div className="cw-field">
                  {(picked.length > 0 || attachments.length > 0) && (
                    <div className="cw-files">
                      {picked.map((item) => (
                        <ComposerAttachment
                          key={item.id}
                          file={{
                            name: item.title,
                            path: item.src,
                            type: item.kind === 'video' ? 'VIDEO' : 'IMAGE',
                            mime: item.kind === 'video' ? 'video/mp4' : 'image/jpeg',
                          }}
                          caption={`Шаблон: ${item.title}`}
                          disabled={attachmentBusy}
                          onRemove={() => {
                            if (attachmentBusy || submitting.current) return;
                            setPicked((p) => p.filter((t) => t.id !== item.id));
                            setTemplateNotice('');
                          }}
                        />
                      ))}
                      {attachments.map((file) => (
                        <ComposerAttachment
                          key={file.id + file.slot}
                          file={
                            file.saved || {
                              name: file.name,
                              path: file.url,
                              type: file.type.startsWith('video/')
                                ? 'VIDEO'
                                : file.type.startsWith('image/')
                                  ? 'IMAGE'
                                  : 'DOCUMENT',
                              mime: file.type,
                            }
                          }
                          caption={`${file.slot ? `${file.slot === 'start' ? 'Начальный' : 'Конечный'} кадр: ` : ''}${file.name}${file.isUnavailable ? ' · Недоступен' : ''}`}
                          unavailable={file.isUnavailable}
                          disabled={attachmentBusy}
                          onRemove={() => {
                            if (attachmentBusy || submitting.current) return;
                            setAttachments((p) => p.filter((f) => f.id !== file.id || f.slot !== file.slot));
                            if (attachments.length === 1) setRestoringReferences(undefined);
                            studioDraft.changed();
                            setTemplateNotice('');
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <div className="cw-draft-row">
                    <label className="sr-only" htmlFor="cw-draft">
                      Запрос
                    </label>
                    <textarea
                      ref={textarea}
                      disabled={busy}
                      id="cw-draft"
                      className="ds-field"
                      rows={3}
                      value={draft}
                      placeholder="Опишите, что должно произойти в кадре"
                      onChange={(e) => {
                        setDraft(e.target.value);
                        setTemplateNotice('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          void submit();
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="cw-tools">
                  <button
                    type="button"
                    className="mobile-gallery-toggle"
                    aria-expanded={mobileGallery}
                    onClick={() => setMobileGallery(!mobileGallery)}
                  >
                    Шаблоны и настройки
                  </button>
                  <button
                    className="cw-plus ds-icon-button"
                    type="button"
                    aria-label="Добавить файл"
                    disabled={busy || attachments.some((file) => file.slot)}
                    title={
                      attachments.some((file) => file.slot)
                        ? 'Меняйте опорные кадры в настройках или уберите их перед добавлением обычных референсов.'
                        : 'Добавить файл'
                    }
                    onClick={() => {
                      setFrameSlot(undefined);
                      if (user) setLibrary({ scope: draftScope });
                      else input.current?.click();
                    }}
                  >
                    <UploadButtonContent busy={uploading} progress={uploadProgress}>
                      <Plus size={24} />
                    </UploadButtonContent>
                  </button>
                  <StudioMenu
                    key={mode}
                    disabled={busy}
                    label={model ? modelTitle(model) : 'Выбрать модель'}
                    selection={model ? modelKey(model) : selectedModel}
                    ariaLabel={`Модель: ${model ? modelTitle(model) : selectedModel}`}
                    className="cw-model"
                    modelIcon={mode}
                    options={user ? (catalog.data || []).map(modelKey) : ['Сменить модель']}
                    onSelect={(value) => {
                      if (!user && value !== 'Auto') void signIn();
                      else setSelectedModel(value);
                    }}
                    titles={user ? (catalog.data || []).map(modelTitle) : undefined}
                    descriptions={
                      user
                        ? (catalog.data || []).map(modelSummary)
                        : ['Модель раздела подбирается сама.', 'Нужен вход в аккаунт.']
                    }
                    searchTerms={
                      user ? (catalog.data || []).map((item) => `${item.name} ${modelKey(item)}`) : undefined
                    }
                    favorites={user ? prefs.value.favoriteModels : undefined}
                    onFavorite={(key) =>
                      prefs.update((current) => ({
                        ...current,
                        favoriteModels: toggleItem(current.favoriteModels, key),
                      }))
                    }
                    error={prefs.error}
                  />
                  {mode === 'video' && (
                    <>
                      {(!model || modelProperties.duration) && (
                        <div className="cw-stepper">
                          <button
                            type="button"
                            aria-label="Короче"
                            disabled={busy || !durations.some((value) => value < duration)}
                            onClick={() =>
                              setDuration(
                                [...durations].sort((a, b) => b - a).find((value) => value < duration) ??
                                  duration,
                              )
                            }
                          >
                            -
                          </button>
                          <span>{duration} с</span>
                          <button
                            type="button"
                            aria-label="Длиннее"
                            disabled={busy || !durations.some((value) => value > duration)}
                            onClick={() =>
                              setDuration(
                                [...durations].sort((a, b) => a - b).find((value) => value > duration) ??
                                  duration,
                              )
                            }
                          >
                            +
                          </button>
                        </div>
                      )}
                      {soundOptions.length > 0 && (
                        <StudioMenu
                          disabled={busy}
                          label={effectiveSound}
                          options={soundOptions}
                          onSelect={setSound}
                        />
                      )}
                      <StudioMenu
                        disabled={busy}
                        label={shape}
                        options={['Один кадр', 'Набор сцен']}
                        onSelect={setShape}
                      />
                    </>
                  )}
                  {mode !== 'presentation' && ratioOptions.length > 0 && (
                    <StudioMenu
                      disabled={busy || referenceRatio}
                      label={referenceRatio ? 'По исходному кадру' : effectiveRatio}
                      ariaLabel={`Стороны: ${referenceRatio ? 'по исходному кадру' : effectiveRatio}`}
                      options={ratioOptions}
                      onSelect={setRatio}
                    />
                  )}
                  <button
                    className="cw-send"
                    type="submit"
                    aria-label="Отправить запрос"
                    aria-busy={busy}
                    disabled={busy || (!draft.trim() && !picked.length && !attachments.length)}
                  >
                    {busy ? <span className="spinner" aria-hidden="true" /> : <ArrowUp size={24} />}
                  </button>
                </div>
                {templateNotice && (
                  <p className="content-feedback" role="status">
                    {templateNotice}
                  </p>
                )}
                {work.error && !(work.isExecutionError && work.conversation?.status === 'ERROR') && (
                  <p className="content-feedback error" role="alert">
                    {work.error}
                  </p>
                )}
                {preparingFrame && (
                  <p className="content-feedback" role="status">
                    Подготовка кадра…
                  </p>
                )}
              </form>
            </div>
          </section>
          <aside className="cw-gallery" aria-label="Галерея шаблонов" data-gallery-view={panel}>
            <div className="cw-gallery-head">
              <button
                type="button"
                className="mobile-gallery-close icon-button"
                aria-label="Закрыть шаблоны и настройки"
                onClick={() => setMobileGallery(false)}
              >
                ×
              </button>
              <div className="cw-gallery-tabs ds-tabs" role="tablist" aria-label="Шаблоны или настройки">
                {['templates', 'settings'].map((key, index) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={panel === key}
                    onClick={() => setPanel(key)}
                  >
                    {index ? 'Настройки' : 'Шаблоны'}
                  </button>
                ))}
                <i
                  className="cw-tab-rail"
                  aria-hidden="true"
                  style={{ width: '50%', transform: `translateX(${panel === 'settings' ? '100%' : '0'})` }}
                />
              </div>
              <button
                type="button"
                className="cw-width"
                data-size={width}
                aria-label={`Ширина галереи: ${{ s: 'узкая', m: 'средняя', l: 'широкая' }[width]}`}
                onClick={() => {
                  const next = ['s', 'm', 'l'][(['s', 'm', 'l'].indexOf(width) + 1) % 3];
                  setWidth(next);
                  localStorage.setItem('genfactory.content-gallery-width', next);
                }}
              >
                <i />
                <i />
                <i />
              </button>
            </div>
            <div className="cw-gallery-body">
              {panel === 'templates' ? (
                <div className="cw-templates-pane">
                  <div className="cw-genres" role="group" aria-label="Жанры">
                    <button
                      type="button"
                      className={`cw-genre ${!genre && !favoritesOnly ? 'is-on' : ''}`}
                      onClick={() => {
                        setGenre('');
                        setFavoritesOnly(false);
                      }}
                    >
                      Все
                    </button>
                    <button
                      type="button"
                      className={`cw-genre cw-genre-fav ${favoritesOnly ? 'is-on' : ''}`}
                      aria-label="Избранные шаблоны"
                      aria-pressed={favoritesOnly}
                      onClick={() => setFavoritesOnly(!favoritesOnly)}
                    >
                      <Heart size={16} />
                    </button>
                    {genres.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={`cw-genre ${genre === g ? 'is-on' : ''}`}
                        onClick={() => setGenre(genre === g ? '' : g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                  <div className="cw-scroll" id="cw-gallery">
                    {visible.map((item) => (
                      <article
                        className={`cw-card ds-template-card ${selectedTemplate === item.id ? 'is-picked' : ''}`}
                        data-kind={item.kind === 'presentation' ? 'slides' : item.kind}
                        key={item.id}
                      >
                        <div
                          className="cw-card-media ds-template-media"
                          role="button"
                          tabIndex={0}
                          aria-label={`Открыть шаблон: ${item.title}`}
                          onClick={() =>
                            setSelectedTemplate(selectedTemplate === item.id ? undefined : item.id)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')
                              setSelectedTemplate(selectedTemplate === item.id ? undefined : item.id);
                          }}
                        >
                          <TemplateMedia item={item} />
                          <button
                            type="button"
                            className="cw-add ds-template-add"
                            aria-label="Добавить"
                            disabled={busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              void pick(item);
                            }}
                          >
                            <Plus className="template-add-icon" size={18} aria-hidden="true" />
                            <span className="template-add-label">Добавить</span>
                          </button>
                          <button
                            type="button"
                            className={`cw-fav ${favorites.includes(item.id) ? 'is-on' : ''}`}
                            aria-label={`В избранное: ${item.title}`}
                            aria-pressed={favorites.includes(item.id)}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(item.id);
                            }}
                          >
                            <Heart size={18} fill={favorites.includes(item.id) ? 'currentColor' : 'none'} />
                          </button>
                          <span className="cw-card-label">
                            <span>{item.genre}</span>
                            <strong>{item.title}</strong>
                          </span>
                        </div>
                      </article>
                    ))}
                    {!visible.length && (
                      <p className="cw-gallery-empty">
                        {favoritesOnly ? 'В избранном пока ничего нет.' : 'Таких шаблонов нет.'}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="cw-settings-pane">
                  {SCRIPT_WRITER_ENABLED && (
                    <div className="cw-extra-toggles">
                      <Toggle
                        label="Сценарист"
                        description="Включён — обсуждаем сценарий. Выключен — создаём результат."
                        value={writer}
                        onChange={setWriter}
                      />
                    </div>
                  )}
                  {mode === 'presentation' ? (
                    <p className="cw-settings-empty">Для презентации дополнительных настроек съёмки нет.</p>
                  ) : (
                    <div className="cw-shoot">
                      {mode === 'video' &&
                        (['start', 'end'] as const).map((slot) => (
                          <div className="cw-shoot-line" key={slot}>
                            <button
                              className="cw-shoot-row"
                              title={
                                attachments.some((file) => !file.slot)
                                  ? 'Уберите обычные референсы перед выбором опорных кадров.'
                                  : undefined
                              }
                              disabled={
                                busy ||
                                attachments.some((file) => !file.slot) ||
                                (!writer && !!model && referenceLimit(model) < (slot === 'end' ? 2 : 1))
                              }
                              type="button"
                              onClick={() => setFrameMenu(frameMenu === slot ? undefined : slot)}
                            >
                              <span>{slot === 'start' ? 'Начальный кадр' : 'Конечный кадр'}</span>
                              <b>{attachments.find((f) => f.slot === slot)?.name || 'Не задан'}</b>
                            </button>
                            {frameMenu === slot && (
                              <div className="content-frame-menu">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFrameSlot(slot);
                                    setFrameMenu(undefined);
                                    input.current?.click();
                                  }}
                                >
                                  Загрузить
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFrameSlot(slot);
                                    setFrameMenu(undefined);
                                    setPanel('templates');
                                  }}
                                >
                                  Выбрать шаблон
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFrameMenu(undefined);
                                    setFrameSlot(undefined);
                                    if (!user) void signIn();
                                    else setLibrary({ scope: draftScope, slot });
                                  }}
                                >
                                  Из библиотеки
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      {fields
                        .filter(
                          (f) =>
                            (mode === 'video' || !['camera', 'move'].includes(f.id)) &&
                            (f.id !== 'quality' || qualityOptions.length > 0),
                        )
                        .map((f) => (
                          <StudioMenu
                            disabled={busy}
                            key={f.id}
                            fieldId={f.id}
                            label={f.label}
                            value={f.id === 'quality' ? effectiveQuality : settings[f.id]}
                            className="cw-shoot-row"
                            options={f.id === 'quality' ? qualityOptions : f.options}
                            onSelect={(value) => {
                              if (f.id === 'quality' && mode === 'image') setImageQuality(value);
                              else setSettings((s) => ({ ...s, [f.id]: value }));
                            }}
                          />
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
      <input
        ref={input}
        disabled={busy}
        type="file"
        hidden
        multiple={!frameSlot}
        accept={IMAGE_UPLOAD_ACCEPT}
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (busy || !files.length) return;
          if (files.some((file) => !isImageUpload(file))) {
            work.setError('Выберите изображение JPEG, PNG, WebP или HEIC/HEIF.');
            e.target.value = '';
            return;
          }
          const retained = attachments.filter((file) => !frameSlot || file.slot !== frameSlot);
          if (
            !writer &&
            mode !== 'presentation' &&
            model &&
            retained.length + files.length > referenceLimit(model)
          ) {
            work.setError('Модель не поддерживает выбранное количество референсов.');
            e.target.value = '';
            return;
          }
          const scope = imageSelectionScope.current;
          const sid = session;
          const current = () => imageSelectionScope.current === scope && getSession() === sid;
          const slot = frameSlot;
          setPreparingFrame(true);
          work.setError('');
          try {
            const prepared: File[] = [];
            for (const file of files) {
              prepared.push(await prepareImageUpload(file));
              if (!current()) return;
            }
            const added = prepared.map((file) => {
              const url = URL.createObjectURL(file);
              urls.current.add(url);
              return { id: crypto.randomUUID(), name: file.name, url, type: file.type, slot, file };
            });
            setAttachments((old) => [...old.filter((f) => !slot || f.slot !== slot), ...added]);
            setFrameSlot(undefined);
          } catch (error) {
            if (current())
              work.setError(error instanceof Error ? error.message : 'Не удалось открыть фотографию.');
          } finally {
            if (current()) setPreparingFrame(false);
          }
        }}
      />

      {library && library.scope === draftScope && !busy && (
        <LibraryPicker
          selected={library.slot ? [] : attachments.flatMap((file) => (file.saved ? [file.saved.id] : []))}
          onPick={pickLibraryFile}
          onClose={() => setLibrary(undefined)}
        />
      )}
      {editingTemplate && !busy && (
        <TemplateEditor
          key={`${draftScope}:${editingTemplate.id}`}
          referenceAllowed={!model || referenceLimit(model) > 0}
          item={editingTemplate}
          launchSettings={[
            `Модель: ${model ? modelTitle(model) : 'Auto'}`,
            ...(mode === 'video' ? [`Структура: ${shape}`] : []),
            referenceRatio
              ? 'Формат: по исходному кадру'
              : ratioOptions.length
                ? `Формат: ${effectiveRatio}`
                : '',
            effectiveQuality ? `Качество: ${effectiveQuality}` : '',
            mode === 'video' && modelProperties.duration ? `Длительность: ${duration} с` : '',
            mode === 'video' && audioValues.length ? effectiveSound : '',
          ]
            .filter(Boolean)
            .join(' · ')}
          duration={duration}
          reference={attachments.find((file) => !file.isUnavailable && (!file.slot || file.slot === 'start'))}
          onClose={() => {
            setEditingTemplate(undefined);
            requestAnimationFrame(() => textarea.current?.focus());
          }}
          onApply={(prompt, reference) => {
            if (reference && model && referenceLimit(model) < 1) {
              work.setError('Выбранная модель не поддерживает изображение-референс. Выберите другую модель.');
              return;
            }
            if (reference) {
              const file = reference.saved;
              const url = file ? file.path : URL.createObjectURL(reference.file!);
              if (!file) urls.current.add(url);
              setAttachments([
                {
                  id: file ? String(file.id) : crypto.randomUUID(),
                  name: reference.name,
                  url,
                  type: file ? file.mime : reference.file!.type,
                  saved: file,
                  file: reference.file,
                  ...(mode === 'video' ? { slot: 'start' as const } : {}),
                },
              ]);
            } else setAttachments([]);
            setAppliedTemplate(editingTemplate.title);
            setTemplateStartsFresh(true);
            setDraft(prompt);
            setTemplateNotice(
              `Шаблон «${editingTemplate.title}» применён. Задание готово; проверьте настройки и нажмите отправку.`,
            );
            setPicked([]);
            setWriter(false);
            setRestoredGeneration(undefined);
            setFrameSlot(undefined);
            setEditingTemplate(undefined);
            work.setError('');
            requestAnimationFrame(() => textarea.current?.focus());
          }}
        />
      )}
    </div>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="cw-switch-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <button
        className={`cw-switch ${value ? 'is-on' : ''}`}
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={value}
        aria-pressed={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
      >
        <i />
      </button>
    </div>
  );
}
function StudioMenu({
  disabled = false,
  label,
  value,
  ariaLabel,
  className = 'cw-chip',
  options,
  descriptions,
  titles,
  selection,
  searchTerms,
  favorites,
  onFavorite,
  error,
  modelIcon,
  fieldId,
  onSelect,
}: {
  label: string;
  value?: string;
  ariaLabel?: string;
  className?: string;
  options: string[];
  descriptions?: string[];
  titles?: string[];
  selection?: string;
  searchTerms?: string[];
  favorites?: string[];
  onFavorite?: (key: string) => void;
  error?: string;
  modelIcon?: StudioMode;
  fieldId?: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [info, setInfo] = useState<number>();
  const visibleOptions = favoritesFirst(
    options
      .map((option, i) => ({ option, i }))
      .sort((a, b) =>
        searchTerms
          ? (titles?.[a.i] || a.option).localeCompare(titles?.[b.i] || b.option, 'ru', { numeric: true })
          : 0,
      ),
    ['Auto', ...(favorites || [])],
    ({ option }) => option,
  ).filter(
    ({ option, i }) =>
      !searchTerms ||
      option === 'Auto' ||
      (true &&
        `${titles?.[i]} ${descriptions?.[i]} ${searchTerms[i]}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())),
  );
  const ref = useRef<HTMLDivElement>(null);
  useComposerMenu(open, ref);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div
      className={`content-menu ${className === 'cw-shoot-row' ? 'content-shoot-menu' : className === 'cw-model' ? 'cw-model-pick' : 'cw-ratio-pick'}`}
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && info === undefined) {
          setOpen(false);
          ref.current?.querySelector('button')?.focus();
        }
      }}
    >
      <button
        className={className}
        disabled={disabled}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup={searchTerms ? 'dialog' : 'listbox'}
        title={value || label}
        onClick={() => {
          setOpen(!open);
          setSearch('');
        }}
      >
        {value ? (
          <>
            <span>{label}</span>
            <span className="cw-picked">
              {fieldId && (
                <i
                  className="cw-ref"
                  dangerouslySetInnerHTML={{
                    __html: (fieldIcons as Record<string, Record<string, string>>)[fieldId]?.[value] || '',
                  }}
                />
              )}
              <b>{value}</b>
            </span>
          </>
        ) : (
          <span className="content-control-label">{label}</span>
        )}
      </button>
      {open && (
        <div
          className={fieldId ? 'cw-shoot-list' : `cw-model-menu${modelIcon ? ' content-model-menu' : ''}`}
          role={searchTerms ? 'dialog' : 'listbox'}
          aria-label={label}
        >
          {searchTerms && (
            <>
              <input
                className="cw-model-search"
                type="search"
                aria-label="Поиск модели"
                placeholder="Поиск модели"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </>
          )}
          {visibleOptions.map(({ option, i }) =>
            modelIcon ? (
              <div
                key={option}
                className="content-model-row"
                role="option"
                tabIndex={disabled ? -1 : 0}
                aria-label={titles?.[i] || option}
                aria-selected={(selection || label) === option}
                aria-disabled={disabled}
                onClick={() => {
                  if (!disabled) {
                    onSelect(option);
                    setOpen(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && ['Enter', ' '].includes(e.key)) {
                    e.preventDefault();
                    if (!disabled) {
                      onSelect(option);
                      setOpen(false);
                    }
                  }
                }}
              >
                <ModelMark id={option} />
                <span className="cw-model-copy">
                  <span className="content-model-title">
                    <strong>
                      <ModelTitleWithInfo
                        title={titles?.[i] || option}
                        onInfo={searchTerms && option !== 'Auto' ? () => setInfo(i) : undefined}
                        infoClassName="content-model-about"
                        icon={CircleAlert}
                      />
                    </strong>
                  </span>
                  {descriptions?.[i] && <small>{descriptions[i]}</small>}
                </span>
                {favorites && option !== 'Auto' && (
                  <button
                    type="button"
                    className="content-model-favorite"
                    aria-label={`${favorites.includes(option) ? 'Убрать из избранных' : 'В избранные'}: ${titles?.[i] || option}`}
                    aria-pressed={favorites.includes(option)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFavorite?.(option);
                    }}
                  >
                    <Heart size={16} fill={favorites.includes(option) ? 'currentColor' : 'none'} />
                  </button>
                )}
              </div>
            ) : (
              <div key={option}>
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={(selection || value || label) === option}
                  aria-label={searchTerms ? titles?.[i] || option : undefined}
                  disabled={disabled}
                  className="cw-model-option"
                  onClick={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                >
                  {fieldId ? (
                    <>
                      <i
                        className="cw-ref"
                        dangerouslySetInnerHTML={{
                          __html:
                            (fieldIcons as Record<string, Record<string, string>>)[fieldId]?.[option] || '',
                        }}
                      />
                      <span>{option}</span>
                    </>
                  ) : (
                    <span className="cw-model-copy">
                      <strong>{titles?.[i] || option}</strong>
                      {descriptions?.[i] && <small>{descriptions[i]}</small>}
                    </span>
                  )}
                </button>
              </div>
            ),
          )}
          {searchTerms && visibleOptions.every(({ option }) => option === 'Auto') && (
            <p role="status" className="cw-menu-title">
              {'Модели не найдены.'}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          {info !== undefined && (
            <Modal title={titles?.[info] || options[info]} onClose={() => setInfo(undefined)}>
              <p>{descriptions?.[info]}</p>
              <p className="small muted">{searchTerms?.[info]}</p>
            </Modal>
          )}
        </div>
      )}
    </div>
  );
}
function TemplateMedia({ item }: { item: ITemplate }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const update = () => {
      if (visible && !document.hidden && !motion.matches) void video.play().catch(() => {});
      else video.pause();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        update();
      },
      { threshold: 0.2 },
    );
    observer.observe(video);
    document.addEventListener('visibilitychange', update);
    motion.addEventListener('change', update);
    return () => {
      observer.disconnect();
      video.pause();
      document.removeEventListener('visibilitychange', update);
      motion.removeEventListener('change', update);
    };
  }, [item.src]);
  return item.kind === 'video' ? (
    <>
      <img className="cw-still" src={item.src.replace(/\.mp4$/, '.jpg')} alt="" loading="lazy" />
      <video ref={ref} src={item.src} muted loop playsInline preload="metadata" />
    </>
  ) : (
    <img src={item.src} alt="" loading="lazy" />
  );
}
