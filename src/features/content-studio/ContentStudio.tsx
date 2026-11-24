import { VideoDuration } from '../../components/VideoDuration';
import { Dialog, Modal } from '../../components/Modal';
import { ImageAspectGrid, ImageAspectPicker } from '../studio/ImageAspectGrid';
import { StudioQueuePanel } from './StudioQueuePanel';
import { AppliedTemplate } from '../../components/AppliedTemplate';
import { MediaModelPicker } from '../catalog/MediaModelPicker';
import { fitTemplateDuration, resolveTemplateDuration } from './templateDuration';
import {
  galleryTemplateFavoriteId,
  isGalleryTemplate,
  loadTemplate,
  mediaTemplates as archiveTemplates,
} from './templateCatalog';
import { useTemplateSelection } from './useTemplateSelection';
import { resolvePublicReference, restoredPublicReference } from './templatePublicReference';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { StudioMenu } from './StudioMenu';
import { Toggle } from './StudioToggle';
import { Icon } from './StudioIcon';
import { StudioTemplateGallery } from './StudioTemplateGallery';
import { useStudioCatalog, useStudioModels } from './useStudioModels';
import { useStudioQuestion } from './useStudioQuestion';
import { buildStudioMessage } from './buildStudioMessage';
import designSettings from './designSettings.json';
import { fields, modes, SCRIPT_WRITER_ENABLED } from './studioConfig';
import type { StudioMode, IAttachment, IReferenceDraft } from './studioTypes';
import { StudioAttachments } from './StudioAttachments';
import { uploadStudioAttachments } from './uploadStudioAttachments';
import {
  IMAGE_UPLOAD_ACCEPT,
  VIDEO_UPLOAD_ACCEPT,
  isVideoUpload,
  isImageUpload,
  prepareImageUpload,
} from '../../lib/image-upload';
import { scriptReferences } from './script';
import '../catalog/model-favorites.css';
import { PromptTemplate } from './PromptTemplate';
import {
  prepareComposerTemplate,
  rebaseComposerTemplate,
  updateComposerField,
  type ComposerTemplate,
} from './templateComposer';
import { templateTimingError, syncTemplateDuration, updateFeedDuration } from './templateRecipe';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEventCallback } from '../../lib/useEventCallback';
import { useLocation } from 'react-router-dom';
import { api, getSession, type IUploadProgress } from '../../lib/api';
import type { IGnosisFile, IFileGeneration, IConversationMessage, IPagination } from '../../lib/types';
import { useContentConversation } from './useContentConversation';
import { ContentThread } from './ContentThread';
import { choices, sizeRatio, suggestedRatios } from './controls';
import { referenceLimit, supportsReferences, isSchemaValue } from '../catalog/schema';
import { templateFrame, type ITemplate, type ITemplateCard, type ITemplateVideoReference } from './materials';
import {
  videoReferenceMode,
  supportsVideoReferences,
  videoReferenceError,
  validateVideoReferenceMetadata,
} from '../catalog/videoInputs';
import { mediaOptions } from './request';
import { UploadButtonContent } from '../../components/UploadButtonContent';
import { createPortal } from 'react-dom';
import { ArrowUp, Plus, X, Menu, LayoutGrid, Sun, ChevronLeft, ChevronRight } from 'lucide-react';
import { LibraryPicker } from '../../components/LibraryPicker';
import { useAuth } from '../auth/AuthProvider';
import { useDraft } from '../workspace/drafts';
import { usePreferences } from '../workspace/preferences';
import { defaultAssistant } from '../catalog/defaultAssistant';
import { findTemplateModel, modelKey, modelTitle } from '../catalog/presentation';
import { studioTemplates } from './designTemplates';
const templates = [...studioTemplates, ...archiveTemplates];
const designTemplateIds = new Set(studioTemplates.map((item) => item.id));
import './prototype.css';
import './content-studio.css';

interface ISubmittedDraft {
  conversationId?: number;
  session: string;
  text: string;
  afterMessageId: number;
  clear: () => void;
}

export function ContentStudio(): ReactElement {
  const { user, session, signIn } = useAuth();
  const work = useContentConversation();
  const queryClient = useQueryClient();
  const submittedDraft = useRef<ISubmittedDraft | undefined>(undefined);

  const [awaitingAcceptance, setAwaitingAcceptance] = useState<object>();
  const [preparingFrame, setPreparingFrame] = useState(false);
  const frameEpoch = useRef(0);
  const [uploading, setUploading] = useState(false);
  const [restoringResult, setRestoringResult] = useState(false);
  const [restoredGeneration, setRestoredGeneration] = useState<IFileGeneration>();
  const [uploadProgress, setUploadProgress] = useState<IUploadProgress>();
  const submitting = useRef<{ scope: object } | undefined>(undefined);
  const activeSubmissionScope = useRef(work.scope);
  activeSubmissionScope.current = work.scope;
  useEffect(() => {
    setUploading(false);
    setUploadProgress(undefined);
  }, [work.scope]);
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
  const storedFavorites = user ? prefs.value.favoriteTemplates : guestFavorites;
  const favorites = useMemo(
    () => [...new Set(storedFavorites.map(galleryTemplateFavoriteId))],
    [storedFavorites],
  );
  const toggleFavorite = useEventCallback((id: string) => {
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
    if (user) prefs.update((current) => ({ ...current, favoriteTemplates: next }));
    else {
      setGuestFavorites(next);
      localStorage.setItem('genfactory.content-template-favorites.guest', JSON.stringify(next));
    }
  });
  const [mode, setMode] = useState<StudioMode>('image');
  const [expandedSetting, setExpandedSetting] = useState<string>();
  const [panel, setPanel] = useState('templates');
  const [selectedModel, setSelectedModel] = useState('Auto');
  const catalog = useStudioCatalog(mode, user?.id);
  const [desktopGalleryHidden, setDesktopGalleryHidden] = useState(
    () => localStorage.getItem('genfactory.rail-open') !== '1',
  );
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
    quality: '',
  });
  const [ratios, setRatios] = useState<Record<StudioMode, string>>({
    image: '',
    video: '',
    presentation: '16:9',
  });
  const ratio = ratios[mode];
  const setRatio = (value: string) => setRatios((current) => ({ ...current, [mode]: value }));
  const [imageQuality, setImageQuality] = useState('');
  const [durationOverride, setDuration] = useState(0);
  const [sound, setSound] = useState('');
  const [shape, setShape] = useState('Один кадр');
  const [picked, setPicked] = useState<ITemplateCard[]>([]);
  const [attachments, setAttachments] = useState<IAttachment[]>([]);
  const [templateVideoReference, setTemplateVideoReference] = useState<ITemplateVideoReference>();
  const publicReference =
    mode === 'video' && templateVideoReference?.source === 'public'
      ? resolvePublicReference(templateVideoReference)
      : undefined;
  const [restoringReferences, setRestoringReferences] = useState<{
    scope: string;
    values: Array<IReferenceDraft>;
  }>();
  const [frameSlot, setFrameSlot] = useState<'start' | 'end'>();
  const [frameMenu, setFrameMenu] = useState<'start' | 'end'>();
  const [library, setLibrary] = useState<{ scope: string; slot?: 'start' | 'end' }>();
  const [appliedTemplate, setAppliedTemplate] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [composerTemplate, setComposerTemplate] = useState<ComposerTemplate>();
  const currentTemplate = useMemo(
    () => (templates as ITemplateCard[]).find((item) => item.id === templateId && item.kind === mode),
    [mode, templateId],
  );
  const templateRecipe = useMemo(
    () => new PromptTemplate(composerTemplate?.slots.map((slot) => slot.expression).join(' ') || ''),
    [composerTemplate?.slots],
  );
  function clearTemplateFields(): void {
    setComposerTemplate(undefined);
    setTemplateId('');
    setAppliedTemplate('');
  }
  const [templateStartsFresh, setTemplateStartsFresh] = useState(false);
  const [templateGlowActive, setTemplateGlowActive] = useState(false);
  const templateGlowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(templateGlowTimer.current), []);
  function resetComposerTemplate(): void {
    setAttachments([]);
    setFrameSlot(undefined);
    clearTemplateFields();
    setTemplateVideoReference(undefined);
    setTemplateStartsFresh(false);
    setTemplateGlowActive(false);
    setDraft('');
    work.setError('');
    studioDraft.changed();
    textarea.current?.focus();
  }
  const applyTemplateText = (item: ITemplate, target: typeof model): void => {
    const prepared = prepareComposerTemplate(item.prompt, (item.references?.min ?? 0) > 0);
    const prompt = prepared.text;
    if (busy) return;
    if (item.referenceVideoSrc && attachments.some((attachment) => attachment.slot)) {
      work.setError('Для видеореференса шаблона уберите опорные кадры из основной формы.');
      return;
    }
    const sid = getSession();
    if (!sid) return;
    const previousId = templateVideoReference?.fileId;
    work.setError('');
    let chosenDuration: number | undefined;
    try {
      chosenDuration = resolveTemplateDuration(item, duration, target);
      const timingError = item.kind === 'video' ? templateTimingError(prompt, chosenDuration) : undefined;
      if (timingError) throw new Error(timingError);
      if (item.id.startsWith(mode + '-feed-')) {
        if (
          choices(target?.schema.properties?.options?.properties?.aspectRatio, suggestedRatios).includes(
            item.ratio,
          )
        )
          setRatio(item.ratio);
      }
      setAttachments((current) =>
        current.filter(
          (attachment) => !previousId || (attachment.saved?.id ?? attachment.restoreId) !== previousId,
        ),
      );
      setTemplateVideoReference(
        item.referenceVideoSrc ? { templateId: item.id, source: 'public' } : undefined,
      );
    } catch (error) {
      work.setError(error instanceof Error ? error.message : 'Не удалось прикрепить видео шаблона.');
      return;
    }
    if (item.model) setSelectedModel(modelKey({ reference: item.model }));
    if (chosenDuration !== undefined) setDuration(chosenDuration);
    clearTimeout(templateGlowTimer.current);
    setTemplateGlowActive(true);
    templateGlowTimer.current = setTimeout(() => setTemplateGlowActive(false), 1000);
    setAppliedTemplate(item.title);
    setTemplateId(item.id);
    setComposerTemplate(prepared.slots.length ? prepared : undefined);
    setTemplateStartsFresh(true);
    setDraft(prompt);
    textarea.current?.focus();
    setPicked([]);
    setWriter(false);
    setRestoredGeneration(undefined);
    setFrameSlot(undefined);
    work.setError('');
  };
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 780px)').matches);
  const studio = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const element = studio.current?.closest<HTMLElement>('.gf-app');
    if (!mobile || !viewport || !element) return;
    const fit = () => {
      element.style.setProperty('--studio-viewport-top', `${viewport.offsetTop}px`);
      element.style.setProperty('--studio-visible-height', `${viewport.height}px`);
    };
    fit();
    viewport.addEventListener('resize', fit);
    viewport.addEventListener('scroll', fit);
    return () => {
      viewport.removeEventListener('resize', fit);
      viewport.removeEventListener('scroll', fit);
      element.style.removeProperty('--studio-viewport-top');
      element.style.removeProperty('--studio-visible-height');
    };
  }, [mobile]);
  const [mobileSettings, setMobileSettings] = useState(false);
  const [mobileGallery, setMobileGallery] = useState(false);
  const [overlayGallery, setOverlayGallery] = useState(() => matchMedia('(max-width: 900px)').matches);
  const galleryHidden = overlayGallery ? !mobileGallery : desktopGalleryHidden;
  const toggleGallery = (open: boolean) => {
    if (overlayGallery) setMobileGallery(open);
    else {
      setDesktopGalleryHidden(!open);
      localStorage.setItem('genfactory.rail-open', open ? '1' : '0');
    }
  };
  useEffect(() => {
    const query = matchMedia('(max-width: 900px)');
    const change = () => {
      setOverlayGallery(query.matches);
      setMobileGallery(false);
    };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 780px)');
    const change = () => {
      setMobile(query.matches);
      if (!query.matches) {
        setMobileGallery(false);
        setMobileSettings(false);
      }
    };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

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
  const current = useMemo(
    () => [
      ...studioTemplates.filter(
        (item) =>
          item.kind === mode &&
          isGalleryTemplate(item.id) &&
          (frameSlot ||
            (item.model && findTemplateModel(catalog.data || [], item.model.model, item.modelTitle || ''))),
      ),
      ...archiveTemplates.filter((item) => item.kind === mode),
    ],
    [mode, frameSlot, catalog.data],
  );
  const genres = useMemo(
    () => [...new Set(current.flatMap((t: ITemplateCard) => t.tags || [t.genre]).filter(Boolean))],
    [current],
  );
  const visible = useMemo(() => {
    const favoriteIds = new Set(favorites);
    return current
      .filter(
        (t) =>
          (!genre || ((t as ITemplateCard).tags || [t.genre]).includes(genre)) &&
          (!favoritesOnly || favoriteIds.has(t.id)),
      )
      .sort(
        (a, b) =>
          Number(designTemplateIds.has(a.id)) - Number(designTemplateIds.has(b.id)) ||
          (b.addedAt || '').localeCompare(a.addedAt || '') ||
          Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)),
      );
  }, [current, genre, favoritesOnly, favorites]);
  const controls = useStudioModels({
    catalog,
    mode,
    userId: user?.id,
    selectedModel,
    savedTools: work.conversation?.options.tools,
    resultReference: restoredGeneration?.model,
    attachments,
    ratio,
    imageQuality,
    quality: settings.quality,
    sound,
  });
  const {
    retained,
    model,
    modelProperties,
    ratioOptions,
    referenceRatio,
    effectiveRatio,
    qualityOptions,
    effectiveQuality,
    durations,
    soundOptions,
    effectiveSound,
  } = controls;
  const duration = durationOverride || controls.defaults.duration;
  useEffect(() => {
    if (mode === 'video') setDraft((value) => syncTemplateDuration(value, duration));
  }, [mode, duration]);
  const prepareTemplate = useTemplateSelection([work.scope, mode, session, draft, duration, selectedModel]);
  const pick = useEventCallback(async (item: ITemplateCard): Promise<void> => {
    if (busy) return;
    if (!user || !session) {
      void signIn();
      return;
    }
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
            name: `${slot === 'start' ? 'Первый' : 'Последний'} кадр - ${item.title}`,
            url,
            type: file.type,
            slot,
            file,
          },
        ]);
        setFrameSlot(undefined);
        textarea.current?.focus();
      } catch (error) {
        if (alive.current && frameEpoch.current === epoch)
          work.setError(error instanceof Error ? error.message : 'Не удалось подготовить кадр.');
      } finally {
        if (alive.current) setPreparingFrame(false);
      }
    } else {
      try {
        const loaded = await prepareTemplate(item);
        if (!loaded) return;
        const target =
          loaded.model && loaded.modelTitle
            ? findTemplateModel(catalog.data || [], loaded.model.model, loaded.modelTitle)
            : loaded.model
              ? catalog.data?.find(
                  (candidate) => modelKey(candidate) === modelKey({ reference: loaded.model! }),
                )
              : model;
        if (loaded.model && !target)
          throw new Error(
            loaded.modelTitle
              ? 'Модель «' + loaded.modelTitle + '» сейчас недоступна.'
              : 'Модель шаблона сейчас недоступна.',
          );
        const full = fitTemplateDuration(loaded, duration, target);
        applyTemplateText(loaded.model && target ? { ...full, model: target.reference } : full, target);
      } catch (error) {
        work.setError(error instanceof Error ? error.message : 'Не удалось загрузить шаблон.');
        return;
      }
    }
  });
  const visibleFields = fields.filter(
    (field) =>
      mode !== 'presentation' &&
      field.modes.includes(mode) &&
      (field.id !== 'quality' || qualityOptions.length > 0),
  );
  const settingsChanged =
    writer !== SCRIPT_WRITER_ENABLED ||
    visibleFields.some((field) =>
      field.id === 'quality'
        ? effectiveQuality !== controls.defaults.quality
        : settings[field.id] !== field.options[0],
    ) ||
    (mode !== 'presentation' &&
      !referenceRatio &&
      ratioOptions.length > 0 &&
      effectiveRatio !== controls.defaults.ratio) ||
    (mode === 'video' &&
      (((!model || !!modelProperties.duration) && duration !== controls.defaults.duration) ||
        (soundOptions.length > 0 && effectiveSound !== controls.defaults.sound) ||
        shape !== 'Один кадр' ||
        attachments.some((file) => file.slot)));
  function resetSettings(): void {
    setWriter(SCRIPT_WRITER_ENABLED);
    setSettings((current) => ({
      ...current,
      ...Object.fromEntries(
        visibleFields.filter((field) => field.id !== 'quality').map((field) => [field.id, field.options[0]]),
      ),
      ...(mode === 'video' ? { quality: '' } : {}),
    }));
    setRatio('');
    if (mode === 'image') setImageQuality('');
    if (mode === 'video') {
      setDuration(0);
      setSound('');
      setShape('Один кадр');
      setAttachments((current) => current.filter((file) => !file.slot));
      setFrameMenu(undefined);
      setFrameSlot(undefined);
    }
    setRestoredGeneration(undefined);
  }
  const pageReload = useRef(
    (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ===
      'reload',
  );
  const studioValue = useMemo(
    () => ({
      entryKey: location.key,
      mode,
      selectedModel,
      writer,
      brand,
      settings,
      ratios,
      imageQuality,
      duration: durationOverride,
      sound,
      shape,
      restoredGeneration,
      appliedTemplate,
      templateId,
      composerTemplate,
      templateStartsFresh,
      templateVideoReference,
      templateIds: picked.map((item) => item.id),
      draft,
      references: attachments.map((item): IReferenceDraft => ({
        id: item.saved?.id ?? item.restoreId,
        userId: item.saved?.userId ?? user?.id,
        name: item.name,
        slot: item.slot,
      })),
    }),
    [
      location.key,
      mode,
      selectedModel,
      writer,
      brand,
      settings,
      ratios,
      imageQuality,
      durationOverride,
      sound,
      shape,
      restoredGeneration,
      appliedTemplate,
      templateId,
      composerTemplate,
      templateStartsFresh,
      templateVideoReference,
      picked,
      draft,
      attachments,
      user?.id,
    ],
  );
  const initialStudioValue = useRef({ ...studioValue, draft: '' });
  const studioDraft = useDraft(`content-studio.${work.id ?? 'new'}`, studioValue, true);
  const draftScope = `${user?.id ?? 'guest'}:${work.id ?? `new:${location.key}`}`;
  const requiredPhotos = Math.max(0, (currentTemplate?.references?.min ?? 0) - (publicReference ? 1 : 0));
  const photoCount = attachments.filter(
    (file) => !file.isUnavailable && file.type.startsWith('image/'),
  ).length;
  const needsTemplateImages = photoCount < requiredPhotos;
  const missingFields =
    !!currentTemplate && templateRecipe.variables.some((key) => !composerTemplate?.values[key]?.trim());
  useEffect(() => {
    const pending = submittedDraft.current;
    if (pending && (pending.session !== session || pending.conversationId !== work.id))
      submittedDraft.current = undefined;
  }, [work.id, session, location.key]);
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
    const available = studioDraft.available?.value;
    const stored =
      work.id || (pageReload.current && available?.entryKey === location.key) ? available : undefined;
    const ownCreation = work.id !== undefined && createdConversation.current === work.id;
    const changingProject = !!readyScope && !ownCreation;
    const saved = stored || (changingProject || !work.id ? initialStudioValue.current : undefined);
    if (changingProject) {
      setAttachments([]);
      setTemplateVideoReference(undefined);
      setPicked([]);
      setDraft('');
      setRestoringReferences(undefined);
      setLibrary(undefined);
      clearTemplateFields();
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
      if (['', 'Без звука', 'Со звуком'].includes(saved.sound)) setSound(saved.sound);
      if (['Один кадр', 'Набор сцен'].includes(saved.shape)) setShape(saved.shape);
      setAppliedTemplate(
        !removedPresentation && typeof saved.appliedTemplate === 'string' ? saved.appliedTemplate : '',
      );
      setTemplateId(
        removedPresentation
          ? ''
          : (saved.templateId ??
              (templates as ITemplateCard[]).find(
                (item) => item.kind === saved.mode && item.title === saved.appliedTemplate,
              )?.id ??
              ''),
      );
      setComposerTemplate(removedPresentation ? undefined : saved.composerTemplate);
      setTemplateStartsFresh(!removedPresentation && saved.templateStartsFresh === true);
      setTemplateVideoReference(saved.templateVideoReference);
      if (Array.isArray(saved.templateIds))
        setPicked(
          (templates as ITemplateCard[]).filter(
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
            if (file.userId === user.id && (file.type === 'IMAGE' || file.type === 'VIDEO')) {
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
  const studioSerialized = studioDraft.serialized;
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
        ['IMAGE', 'IMAGE_OPEN_AI', 'IMAGE_OPEN_ROUTER', 'VIDEO', 'VIDEO_OPEN_ROUTER'].includes(item.uid),
    );
    if (tool && typeof tool !== 'string') {
      const target = ['IMAGE', 'IMAGE_OPEN_AI', 'IMAGE_OPEN_ROUTER'].includes(tool.uid) ? 'image' : 'video';
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
  const attachmentBusy = awaitingAcceptance === work.scope || uploading || preparingFrame || restoringResult;
  const busy = attachmentBusy || restoringReferences?.scope === draftScope;
  useEffect(() => {
    if (!busy && focusRestoredDraft.current) {
      focusRestoredDraft.current = false;
      textarea.current?.focus();
    }
  }, [busy]);
  function pickLibraryFiles(files: Array<IGnosisFile>): void {
    const file = files[0];
    if (!file) return;
    if (!library || library.scope !== draftScope || busy || file.userId !== user?.id) return;
    if (
      files.some(
        (item) =>
          item.userId !== user?.id ||
          !(
            (item.type === 'IMAGE' && /^image\/(jpeg|png|webp)$/.test(item.mime)) ||
            (mode === 'video' && !library.slot && supportsVideoReferences(model) && item.type === 'VIDEO')
          ),
      )
    ) {
      work.setError('Выберите изображение JPEG, PNG или WebP.');
      return;
    }
    const slot = library.slot;
    const retained = attachments.filter((item) => !slot || item.slot !== slot);
    if (mode === 'video' && model) {
      const issue = videoReferenceError(
        model,
        [
          ...retained.map((item) => ({
            type: item.type.startsWith('video/') ? 'VIDEO' : 'IMAGE',
            mime: item.type,
            size: item.saved?.size ?? item.file?.size,
          })),
          ...files,
        ],
        library.slot ? 'frames' : undefined,
      );
      if (issue) {
        work.setError(issue);
        return;
      }
    }

    if (!slot && retained.some((item) => item.saved?.id === file.id)) return;
    if (retained.some((item) => (slot ? !item.slot : !!item.slot))) {
      work.setError('Не смешивайте опорные кадры и обычные референсы.');
      return;
    }
    if (
      !writer &&
      mode !== 'presentation' &&
      model &&
      (retained.length + files.length > referenceLimit(model) ||
        (slot === 'end' && referenceLimit(model) < 2))
    ) {
      work.setError('Модель не поддерживает выбранное количество референсов.');
      return;
    }
    setAttachments([
      ...retained,
      ...files.map((item) => ({
        id: String(item.id),
        name: item.name,
        url: item.path,
        type: item.mime,
        saved: item,
        slot,
      })),
    ]);
    setFrameSlot(undefined);
    work.setError('');
  }

  async function restoreResult(file: IGnosisFile): Promise<void> {
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
      const reference = generation.model;
      const listed = (await api.catalog(reference.provider, undefined, sid)).find(
        (item) => modelKey(item) === modelKey({ reference }),
      );
      const selected = listed || (await api.modelDescription(reference, undefined, sid));
      if (!current()) return;
      if (!selected?.reference || modelKey(selected) !== modelKey({ reference }) || !selected.schema)
        throw new Error('Модель этой генерации больше недоступна.');
      if (selected.status === 'DISABLED') throw new Error('Модель отключена администратором.');
      if (!listed)
        queryClient.setQueryData(['retained-model', user.id, reference.provider, reference.model], selected);
      const publicInput = restoredPublicReference(generation.references);
      const publicFile = resolvePublicReference(publicInput);
      const sources = await Promise.all((file.origin?.sourceFileIds || []).map((id) => api.file(id, sid)));
      if (sources.some((source) => source.userId !== user.id || !['IMAGE', 'VIDEO'].includes(source.type)))
        throw new Error('Один из исходных файлов недоступен или не является изображением.');
      const properties = selected.schema.properties?.options?.properties || {};
      if (Object.keys(generation.options).some((key) => !properties[key]))
        throw new Error('Некоторые сохранённые параметры больше не поддерживаются моделью.');
      mediaOptions(
        selected,
        target,
        generation.prompt,
        publicFile ? [publicFile, ...sources] : sources,
        generation.options,
        target === 'video'
          ? generation.referenceMode ||
              (Array.isArray(generation.options.frameImages) && generation.options.frameImages.length
                ? 'frames'
                : videoReferenceMode(selected, sources.length))
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
      clearTemplateFields();
      setDraft(generation.prompt);
      setRestoredGeneration(generation);
      setTemplateVideoReference(publicInput);
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
  async function applyScript(text: string, messageId: number): Promise<void> {
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
      clearTemplateFields();
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

  async function submit(): Promise<void> {
    if (!user || !session) {
      void signIn();
      return;
    }
    if (model?.status === 'DISABLED') {
      work.setError('Модель отключена администратором. Выберите другую модель.');
      return;
    }
    if (busy || submitting.current?.scope === work.scope) return;
    if (currentTemplate && needsTemplateImages) {
      studio.current?.querySelector<HTMLButtonElement>('.feed-photo-tile > button')?.focus();
      return;
    }
    if (missingFields || needsTemplateImages) {
      work.setError(missingFields ? 'Заполните параметры шаблона.' : 'Добавьте недостающие фото.');
      return;
    }
    if (!draft.trim() && !picked.length && !attachments.length) return;
    const submissionScope = work.scope;
    const submission = { scope: submissionScope };
    submitting.current = submission;
    setAwaitingAcceptance(submissionScope);
    work.setError('');
    const sid = session;
    const current = () =>
      alive.current && getSession() === sid && activeSubmissionScope.current === submissionScope;
    const sourceDraft = draft;
    const sourceAttachments = attachments;
    const preparingScript = SCRIPT_WRITER_ENABLED && writer;
    try {
      const timingError = mode === 'video' ? templateTimingError(sourceDraft, duration) : undefined;
      if (timingError) throw new Error(timingError);
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
          (!supportsReferences(model) ||
            sourceAttachments.length + (publicReference ? 1 : 0) > referenceLimit(model))
        )
          throw new Error('Модель не поддерживает выбранное количество референсов.');
        if (ratioOptions.length && !ratioOptions.includes(effectiveRatio))
          throw new Error('Выберите формат из доступных для этой модели.');
        if (qualityOptions.length && !qualityOptions.includes(effectiveQuality))
          throw new Error('Выберите качество из доступных для этой модели.');
        if (
          mode === 'video' &&
          modelProperties.duration &&
          !isSchemaValue(modelProperties.duration, duration)
        )
          throw new Error('Выберите длительность из доступных для этой модели.');
        if (mode === 'video' && soundOptions.length && !soundOptions.includes(effectiveSound))
          throw new Error('Выберите доступную настройку звука.');
      }
      if (
        sourceAttachments.some(
          (item) =>
            !item.type.startsWith('image/') &&
            !(
              mode === 'video' &&
              !item.slot &&
              supportsVideoReferences(model) &&
              item.type.startsWith('video/')
            ),
        )
      )
        throw new Error('Тип вложения не поддерживается выбранной моделью или режимом.');
      if (
        mode === 'video' &&
        sourceAttachments.some((item) => item.slot === 'end') &&
        !sourceAttachments.some((item) => item.slot === 'start')
      )
        throw new Error(
          'Для конечного кадра добавьте начальный: текущий видеоинструмент не поддерживает только конечный кадр.',
        );
      const preparedTemplates = (await Promise.all(picked.map(loadTemplate))).map((item) =>
        fitTemplateDuration(item, duration, model),
      );
      if (!current()) return;
      if (preparedTemplates.some((item) => !item.prompt.trim()))
        throw new Error(
          'У выбранного шаблона нет описания для генерации. Уберите его и опишите задачу текстом.',
        );
      if (!model) throw new Error('Выберите доступную модель.');
      if (!work.conversation && !agent) throw new Error('Не удалось загрузить модель ассистента.');
      setUploading(sourceAttachments.length > 0);
      const savedFiles = await uploadStudioAttachments({
        attachments: sourceAttachments,
        session: sid,
        userId: user.id,
        isCurrent: current,
        onProgress: setUploadProgress,
        onSaved: (id, saved) =>
          setAttachments((previous) => previous.map((item) => (item.id === id ? { ...item, saved } : item))),
      });
      if (!savedFiles) return;
      if (mode === 'video')
        await validateVideoReferenceMetadata(
          model,
          publicReference ? [publicReference, ...savedFiles] : savedFiles,
          duration,
        );
      if (!current()) return;
      setUploading(false);
      const request = await buildStudioMessage({
        mode,
        model,
        controls,
        sourceDraft,
        sourceAttachments,
        savedFiles,
        publicReference,
        preparingScript,
        picked: preparedTemplates,
        settings,
        duration,
        shape,
        brandRules: brand && prefs.value.brand ? prefs.value.brand : '',
        restoredGeneration,
        startsFresh: !work.id || !!restoredGeneration || templateStartsFresh,
        isCurrent: current,
      });
      if (!request) return;
      const { body, tools } = request;
      const cached = queryClient.getQueriesData<IPagination<IConversationMessage>>({
        queryKey: ['messages', user.id, work.id],
      });
      const pending: ISubmittedDraft = {
        conversationId: work.id,
        session: sid,
        text: body.text,
        afterMessageId: Math.max(
          0,
          ...cached.flatMap(([, page]) => page?.items.map((message) => message.id) || []),
        ),
        clear: () => {
          submitting.current = undefined;
          setAwaitingAcceptance(undefined);
          setTemplateStartsFresh(false);
          setTemplateVideoReference(undefined);
          if (!work.id) studioDraft.clear();
          setDraft((value) => (value === draft ? '' : value));
          setRestoringReferences(undefined);
          setAttachments((previous) =>
            previous.filter(
              (item) =>
                !sourceAttachments.some((source) => source.id === item.id) &&
                !savedFiles.some((file) => file.id === (item.saved?.id ?? item.restoreId)),
            ),
          );
          setPicked((previous) => previous.filter((item) => !picked.some((source) => source.id === item.id)));
          clearTemplateFields();
          setRestoredGeneration(undefined);
        },
      };
      const queue = work.queue;
      if (queue && (work.busy || queue.occupied)) {
        queue.add(sourceDraft || picked[0]?.title || 'Запрос студии', body, tools);
        pending.clear();
        return;
      }
      submittedDraft.current = pending;
      const success = await work.submit(
        body,
        sourceDraft || picked[0]?.title || 'Студия контента',
        tools,
        mode === 'presentation' ? model : agent,
        (id) => {
          createdConversation.current = id;
          pending.conversationId = id;
        },
      );
      if (success && current() && submittedDraft.current === pending) {
        submittedDraft.current = undefined;
        pending.clear();
      }
    } catch (e) {
      if (current()) work.setError(e instanceof Error ? e.message : 'Не удалось отправить задачу.');
    } finally {
      if (submitting.current === submission) {
        submitting.current = undefined;
        setAwaitingAcceptance(undefined);
      }
      if (current() && !submitting.current) {
        setUploading(false);
        setUploadProgress(undefined);
      }
    }
  }
  const answerQuestion = useStudioQuestion({
    work,
    busy: busy || work.busy || !!work.queue?.occupied,
    session,
    agent,
    alive,
  });

  const generationControls = (
    <>
      {mode === 'video' && (
        <>
          {(!model || modelProperties.duration) && (
            <VideoDuration
              values={durations}
              value={duration}
              disabled={busy || work.busy}
              mobile={mobile}
              label="Длительность видео"
              onChange={(value) => {
                if (
                  currentTemplate &&
                  'prompt' in currentTemplate &&
                  typeof currentTemplate.prompt === 'string'
                ) {
                  const original = currentTemplate.prompt;
                  setDraft((text) => updateFeedDuration(text, original, duration, value));
                }
                setDuration(value);
              }}
            />
          )}
          {soundOptions.length > 0 && (
            <StudioMenu disabled={busy} label={effectiveSound} options={soundOptions} onSelect={setSound} />
          )}
          <StudioMenu
            disabled={busy}
            label={shape}
            options={['Один кадр', 'Набор сцен']}
            onSelect={setShape}
          />
        </>
      )}
      {!mobile && mode !== 'presentation' && ratioOptions.length > 0 && (
        <ImageAspectPicker
          disabled={busy || referenceRatio}
          value={effectiveRatio}
          referenceRatio={referenceRatio}
          label={`Стороны: ${referenceRatio ? 'по исходному кадру' : effectiveRatio}`}
        >
          {(close) => (
            <ImageAspectGrid
              values={ratioOptions}
              selected={effectiveRatio}
              disabled={busy || referenceRatio}
              onSelect={(value) => {
                setRatio(value);
                close();
              }}
            />
          )}
        </ImageAspectPicker>
      )}
    </>
  );
  const gallery = (
    <aside id="studio-gallery" className="cw-gallery" aria-label="Галерея шаблонов" data-gallery-view={panel}>
      <div className="cw-gallery-head">
        <button
          type="button"
          className="mobile-gallery-close icon-button"
          aria-label={mobile ? 'Закрыть шаблоны и настройки' : 'Свернуть панель'}
          title={mobile ? 'Закрыть шаблоны и настройки' : 'Свернуть панель'}
          onClick={() => setMobileGallery(false)}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <div className="cw-gallery-tabs" role="tablist" aria-label="Шаблоны или настройки">
          {['templates', 'settings'].map((key, index) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={panel === key}
              aria-label={index ? (settingsChanged ? 'Настройки, есть изменения' : 'Настройки') : 'Шаблоны'}
              title={key === 'settings' && settingsChanged ? 'Есть изменения' : undefined}
              onClick={() => setPanel(key)}
            >
              {index ? <Sun size={18} aria-hidden /> : <LayoutGrid size={18} aria-hidden />}
              <span className="studio-tab-label">{index ? 'Настройки' : 'Шаблоны'}</span>
              {key === 'settings' && settingsChanged && (
                <span className="settings-change-dot" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
        {!mobile && (
          <div className="studio-width">
            {[1, -1].map((direction) => {
              const sizes = ['s', 'm', 'l'];
              const next = sizes[sizes.indexOf(width) + direction];
              return (
                <button
                  type="button"
                  key={direction}
                  disabled={!next}
                  aria-label={direction > 0 ? 'Сделать панель шире' : 'Сделать панель уже'}
                  title={direction > 0 ? 'Сделать панель шире' : 'Сделать панель уже'}
                  onClick={() => {
                    setWidth(next);
                    localStorage.setItem('genfactory.content-gallery-width', next);
                  }}
                >
                  {direction > 0 ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {!mobile && panel === 'templates' && (
        <p className="rail-hint">Клик по шаблону подставит текст в поле</p>
      )}
      <div className="cw-gallery-body">
        {panel === 'templates' ? (
          <>
            <StudioTemplateGallery
              genre={genre}
              setGenre={setGenre}
              favoritesOnly={favoritesOnly}
              setFavoritesOnly={setFavoritesOnly}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              genres={genres}
              visible={visible}
              busy={busy}
              pick={pick}
            />
          </>
        ) : (
          <div className="cw-settings-pane">
            <p className="settings-intro">
              {mode === 'video'
                ? 'Подсказки для ролика - можно ничего не менять'
                : 'Подсказки для картинки - можно ничего не менять'}
            </p>

            {SCRIPT_WRITER_ENABLED && (
              <div className="cw-extra-toggles">
                <Toggle
                  label="Сценарист"
                  description="Включён - обсуждаем сценарий. Выключен - создаём результат."
                  value={writer}
                  onChange={setWriter}
                />
              </div>
            )}
            {mode === 'presentation' ? (
              <p className="cw-settings-empty">Для презентации дополнительных настроек съёмки нет.</p>
            ) : (
              <div className="studio-setting-list">
                {mode === 'video' &&
                  (['start', 'end'] as const).map((slot) => {
                    const frame = attachments.find((item) => item.slot === slot);
                    return (
                      <div className={'settings-row' + (frameMenu === slot ? ' is-open' : '')} key={slot}>
                        <button
                          className="settings-row-head"
                          aria-expanded={frameMenu === slot}
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
                          onClick={() => {
                            setExpandedSetting(undefined);
                            setFrameMenu(frameMenu === slot ? undefined : slot);
                          }}
                        >
                          <span className="settings-row-title">
                            {slot === 'start' ? 'Начальный кадр' : 'Конечный кадр'}
                          </span>
                          <span className="settings-row-value">
                            {frame?.url && <img className="settings-row-thumb" src={frame.url} alt="" />}
                            <span>{frame?.name || 'Не задан'}</span>
                          </span>
                        </button>
                        {frameMenu === slot && (
                          <div className="settings-row-body studio-frame-body">
                            <p className="settings-hint">
                              {slot === 'start'
                                ? 'Своё фото - с него начнётся ролик'
                                : 'Куда ролик должен прийти в финале'}
                            </p>
                            <div className="studio-frame-wrap">
                              <button
                                type="button"
                                className="studio-frame-slot"
                                aria-label={
                                  slot === 'start' ? 'Выбрать начальный кадр' : 'Выбрать конечный кадр'
                                }
                                title={slot === 'start' ? 'Выбрать начальный кадр' : 'Выбрать конечный кадр'}
                                popoverTarget={'frame-sources-' + slot}
                              >
                                {frame?.url ? <img src={frame.url} alt="" /> : <Plus size={18} />}
                              </button>
                              {frame && (
                                <button
                                  type="button"
                                  className="studio-frame-remove"
                                  aria-label="Убрать кадр"
                                  title="Убрать кадр"
                                  disabled={busy}
                                  onClick={() => {
                                    setAttachments((previous) =>
                                      previous.filter((item) => item.slot !== slot),
                                    );
                                    studioDraft.changed();
                                  }}
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                            <div id={'frame-sources-' + slot} className="content-frame-menu" popover="auto">
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
                          </div>
                        )}
                      </div>
                    );
                  })}
                {visibleFields.map((f) => {
                  const value = f.id === 'quality' ? effectiveQuality : settings[f.id] || f.options[0];
                  const thumbs = designSettings.find((g) => g.id === f.id)!.options;
                  const preview = thumbs.find((o) => o.label === value)?.src;
                  const open = expandedSetting === f.id;
                  return (
                    <div className={'settings-row' + (open ? ' is-open' : '')} key={f.id}>
                      <button
                        type="button"
                        className="settings-row-head"
                        disabled={busy}
                        aria-expanded={open}
                        onClick={() => {
                          setFrameMenu(undefined);
                          setExpandedSetting(open ? undefined : f.id);
                        }}
                      >
                        <span className="settings-row-title">{f.label}</span>
                        <span className="settings-row-value">
                          {preview && <img className="settings-row-thumb" alt="" src={preview} />}
                          <span>{value}</span>
                        </span>
                      </button>
                      {open && (
                        <div className="settings-row-body">
                          <p className="settings-hint">{f.hint}</p>
                          <div className="settings-pick-grid">
                            {(f.id === 'quality' ? qualityOptions : f.options).map((label) => {
                              const src = thumbs.find((o) => o.label === label)?.src;
                              return (
                                <button
                                  type="button"
                                  key={label}
                                  className={
                                    'settings-card' +
                                    (value === label
                                      ? ['Не задано', 'Авто', 'Нет'].includes(label)
                                        ? ' is-selected is-quiet'
                                        : ' is-selected'
                                      : '')
                                  }
                                  disabled={busy}
                                  aria-pressed={value === label}
                                  onClick={() => {
                                    setSettings((current) => ({ ...current, [f.id]: label }));
                                  }}
                                >
                                  <span className="settings-card-preview">
                                    {src && <img src={src} loading="lazy" alt="" />}
                                  </span>
                                  <span className="settings-card-label">{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <button className="button" type="button" disabled={busy} onClick={resetSettings}>
              Сбросить к обычному
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  const studioAttachments = (!!publicReference || picked.length > 0 || attachments.length > 0) && (
    <StudioAttachments
      inline={!!currentTemplate}
      publicReference={publicReference}
      onRemovePublicReference={() => {
        setTemplateVideoReference(undefined);
        studioDraft.changed();
      }}
      picked={picked}
      attachments={attachments}
      attachmentBusy={attachmentBusy}
      onRemoveTemplate={(id) => {
        if (attachmentBusy || submitting.current?.scope === work.scope) return;
        setPicked((previous) => previous.filter((item) => item.id !== id));
        setAttachments([]);
        setTemplateVideoReference(undefined);
        setRestoringReferences(undefined);
        setFrameSlot(undefined);
        studioDraft.changed();
      }}
      onRemoveAttachment={(file) => {
        if (attachmentBusy || submitting.current?.scope === work.scope) return;
        setAttachments((previous) =>
          previous.filter((item) => item.id !== file.id || item.slot !== file.slot),
        );
        if (
          templateVideoReference?.fileId &&
          templateVideoReference.fileId === (file.saved?.id ?? file.restoreId)
        )
          setTemplateVideoReference(undefined);
        if (attachments.length === 1) setRestoringReferences(undefined);
        studioDraft.changed();
      }}
    />
  );
  return (
    <div ref={studio} className={`content-studio ${mobileGallery ? 'mobile-gallery-open' : ''}`}>
      <div id="creatives" className="panel">
        <div className="cw" id="creative-workspace" data-gallery={width} data-gallery-hidden={galleryHidden}>
          <section className="cw-chat" aria-label="Чат проекта">
            <div className="cw-stage">
              <div className="cw-thread">
                {!work.id && !work.conversation && (
                  <div className="studio-intro">
                    <h2>Генерация в диалоге</h2>
                    <p>Опишите кадр или правку - следующее сообщение продолжит работу с результатом.</p>
                    <div className="starter-list">
                      {[
                        ['image', 'Сделай обложку для поста: товар на чистом фоне, мягкий свет'],
                        ['image', 'Перерисуй приложенное фото в более тёплый свет и квадратный кадр'],
                        ['video', 'Короткий ролик 8 с: камера медленно объезжает предмет'],
                      ].map(([kind, text]) => (
                        <button
                          type="button"
                          key={text}
                          disabled={busy}
                          className="starter-btn"
                          onClick={() => {
                            clearTemplateFields();
                            setMode(kind === 'video' ? 'video' : 'image');
                            setSelectedModel('Auto');
                            studioDraft.changed();
                            setDraft(text);
                            textarea.current?.focus();
                          }}
                        >
                          {text}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {work.conversation && (
                  <ContentThread
                    thread={work.thread}
                    key={work.conversation.id}
                    conversation={work.conversation}
                    busy={busy || work.busy || !!work.queue?.occupied}
                    onAnswer={answerQuestion}
                    onRequest={(ask) => {
                      const pending = submittedDraft.current;
                      if (
                        !pending ||
                        pending.session !== session ||
                        pending.conversationId !== work.id ||
                        ask.id <= pending.afterMessageId ||
                        ask.text !== pending.text
                      )
                        return;
                      submittedDraft.current = undefined;
                      work.confirmSubmission();
                      pending.clear();
                    }}
                    onUseParameters={(file) => void restoreResult(file)}
                    onUseScript={(text, id) => void applyScript(text, id)}
                    onRepeat={(text) => {
                      work.setError('');
                      clearTemplateFields();
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
                          ...(kind === 'video' && file.type === 'IMAGE' ? { slot: 'start' as const } : {}),
                        },
                      ]);
                      textarea.current?.focus();
                    }}
                  />
                )}
              </div>
            </div>
            <div className="cw-composer-stack">
              <form
                className="cw-compose studio-compose"
                id="cw-compose"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <div
                  className="studio-mode-selector ds-segment"
                  id="cw-mode"
                  role="group"
                  aria-label="Вид генерации"
                >
                  {modes.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-label={label}
                      title={label}
                      aria-pressed={mode === key}
                      disabled={busy}
                      onClick={() => {
                        frameEpoch.current++;
                        setFrameSlot(undefined);
                        if (key !== mode) {
                          clearTemplateFields();
                          setTemplateVideoReference(undefined);
                        }
                        setMode(key);
                        setSelectedModel('Auto');
                        setGenre('');
                        setFrameMenu(undefined);
                      }}
                    >
                      <Icon name={key} />
                      {label}
                    </button>
                  ))}
                </div>
                <div className={currentTemplate ? 'cw-field feed-template-fields' : 'cw-field'}>
                  {currentTemplate ? (
                    <AppliedTemplate
                      title={currentTemplate.title}
                      key={currentTemplate.id}
                      fields={
                        composerTemplate
                          ? {
                              recipe: templateRecipe,
                              values: composerTemplate.values,
                              onChange: (key, value) => {
                                const next = updateComposerField(
                                  rebaseComposerTemplate(composerTemplate, draft),
                                  key,
                                  value,
                                );
                                setComposerTemplate(next);
                                setDraft(next.text);
                                work.setError('');
                              },
                            }
                          : undefined
                      }
                      disabled={busy}
                      photoDisabled={busy || attachments.some((file) => !!file.slot)}
                      photoCount={photoCount}
                      missingPhotos={Math.max(0, requiredPhotos - photoCount)}
                      video={mode === 'video'}
                      onReset={resetComposerTemplate}
                      onAdd={() => {
                        setFrameSlot(undefined);
                        setLibrary({ scope: draftScope });
                      }}
                    >
                      {studioAttachments}
                    </AppliedTemplate>
                  ) : (
                    studioAttachments
                  )}
                  <div className="cw-draft-row">
                    <label className="sr-only" htmlFor="cw-draft">
                      Запрос
                    </label>
                    <textarea
                      ref={textarea}
                      disabled={
                        awaitingAcceptance === work.scope ||
                        preparingFrame ||
                        restoringResult ||
                        readyScope !== draftScope
                      }
                      id="cw-draft"
                      className="ds-field"
                      rows={2}
                      value={draft}
                      placeholder={
                        mode === 'video'
                          ? 'Что происходит в ролике? Кто в кадре, куда едет камера.'
                          : 'Опишите задачу или правку. Можно приложить фото.'
                      }
                      onChange={(e) => {
                        const text = e.target.value;
                        if (!text.trim()) {
                          resetComposerTemplate();
                        } else if (composerTemplate)
                          setComposerTemplate(rebaseComposerTemplate(composerTemplate, text));
                        setDraft(text);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !busy && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          void submit();
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="cw-tools">
                  <button
                    className={`cw-plus ds-icon-button ${needsTemplateImages ? `needs-template-images${templateGlowActive ? ' template-glow-active' : ''}` : ''}`}
                    type="button"
                    aria-label="Добавить файл"
                    disabled={busy || attachments.some((file) => file.slot)}
                    title={
                      attachments.some((file) => file.slot)
                        ? 'Меняйте опорные кадры в настройках или уберите их перед добавлением обычных референсов.'
                        : needsTemplateImages
                          ? `Добавьте свои ${mode === 'video' && supportsVideoReferences(model) ? 'фото или видео' : 'изображения'}: минимум ${requiredPhotos}`
                          : 'Добавить файл'
                    }
                    onClick={() => {
                      setFrameSlot(undefined);
                      if (user) setLibrary({ scope: draftScope });
                      else input.current?.click();
                    }}
                  >
                    <UploadButtonContent compact busy={uploading} progress={uploadProgress}>
                      <Plus size={24} />
                    </UploadButtonContent>
                  </button>
                  <MediaModelPicker
                    key={mode}
                    kind={mode}
                    models={catalog.data || []}
                    mobile={false}
                    studio
                    composer
                    disabled={busy}
                    label={model ? modelTitle(model) : 'Выбрать модель'}
                    selected={model ? modelKey(model) : selectedModel}
                    name={`Модель: ${model ? modelTitle(model) : selectedModel}`}
                    onSelect={setSelectedModel}
                    favorites={prefs.value.favoriteModels}
                    onFavorite={prefs.toggleFavoriteModel}
                    error={prefs.error}
                  />
                  {mobile && (
                    <button
                      type="button"
                      className="mobile-gallery-toggle"
                      aria-haspopup="dialog"
                      aria-expanded={mobileSettings}
                      onClick={() => setMobileSettings(true)}
                    >
                      Ещё
                    </button>
                  )}
                  {!mobile && generationControls}
                  <button
                    className="cw-send"
                    type="submit"
                    aria-label="Отправить запрос"
                    title="Отправить запрос"
                    aria-busy={busy || (work.busy && !draft.trim() && !picked.length && !attachments.length)}
                    disabled={
                      busy ||
                      missingFields ||
                      (needsTemplateImages && !currentTemplate) ||
                      (!draft.trim() && !picked.length && !attachments.length)
                    }
                  >
                    {busy || (work.busy && !draft.trim() && !picked.length && !attachments.length) ? (
                      <span className="spinner" aria-hidden="true" />
                    ) : (
                      <ArrowUp size={24} />
                    )}
                  </button>
                </div>
                {work.queue && <StudioQueuePanel queue={work.queue} />}
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
          {!mobile && (
            <div className={overlayGallery || galleryHidden ? 'studio-strip' : 'studio-fold'}>
              <button
                aria-label={galleryHidden ? 'Развернуть панель' : 'Свернуть панель'}
                title={galleryHidden ? 'Развернуть панель' : 'Свернуть панель'}
                aria-expanded={!galleryHidden}
                onClick={() => toggleGallery(galleryHidden)}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
                  <path d="M15 7.5v9" strokeLinecap="round" />
                </svg>
              </button>
              {(overlayGallery || galleryHidden) &&
                ['templates', 'settings'].map((key) => (
                  <button
                    key={key}
                    aria-label={key === 'templates' ? 'Шаблоны' : 'Настройки'}
                    title={key === 'templates' ? 'Шаблоны' : 'Настройки'}
                    onClick={() => {
                      setPanel(key);
                      toggleGallery(true);
                    }}
                  >
                    {key === 'templates' ? <LayoutGrid size={20} /> : <Sun size={20} />}
                  </button>
                ))}
            </div>
          )}
          {mobile &&
            document.getElementById('studio-mobile-actions') &&
            createPortal(
              <button
                className="gf-sidebar-toggle"
                aria-label="Шаблоны и настройки"
                title="Шаблоны и настройки"
                aria-expanded={mobileGallery}
                onClick={() => setMobileGallery(true)}
              >
                <Menu size={18} />
              </button>,
              document.getElementById('studio-mobile-actions')!,
            )}
          {mobile && (
            <Modal
              swipeToClose
              open={mobileSettings}
              title="Кадр и длина"
              className="design-image-settings"
              onClose={() => setMobileSettings(false)}
            >
              <p className="aspect-title">Размер кадра</p>
              <ImageAspectGrid
                values={ratioOptions}
                selected={effectiveRatio}
                disabled={busy || referenceRatio}
                onSelect={(value) => {
                  setRatio(value);
                  setMobileSettings(false);
                }}
              />
              {mode === 'video' && <div className="mobile-generation-controls">{generationControls}</div>}
            </Modal>
          )}
          {overlayGallery ? (
            <Dialog
              open={mobileGallery}
              swipeToClose={mobile}
              className={mobile ? 'studio-mobile-sheet studio-gallery-sheet' : 'studio-gallery-drawer'}
              aria-label="Шаблоны и настройки"
              onClose={() => setMobileGallery(false)}
            >
              {gallery}
            </Dialog>
          ) : (
            gallery
          )}
        </div>
      </div>
      <input
        ref={input}
        disabled={busy}
        type="file"
        hidden
        multiple={!frameSlot}
        accept={
          mode === 'video' && !frameSlot && supportsVideoReferences(model)
            ? `${IMAGE_UPLOAD_ACCEPT},${VIDEO_UPLOAD_ACCEPT}`
            : IMAGE_UPLOAD_ACCEPT
        }
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (busy || !files.length) return;
          if (
            files.some(
              (file) =>
                !isImageUpload(file) &&
                !(mode === 'video' && !frameSlot && supportsVideoReferences(model) && isVideoUpload(file)),
            )
          ) {
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
            if (mode === 'video' && model) {
              const issue = videoReferenceError(
                model,
                [
                  ...retained.map((item) => ({
                    type: item.type.startsWith('video/') ? 'VIDEO' : 'IMAGE',
                    mime: item.type,
                    size: item.saved?.size ?? item.file?.size ?? 0,
                  })),
                  ...files.map((file) => ({
                    type: isVideoUpload(file) ? 'VIDEO' : 'IMAGE',
                    mime: file.type,
                    size: file.size,
                  })),
                ],
                slot ? 'frames' : undefined,
              );
              if (issue) throw new Error(issue);
            }
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
          acceptedTypes={
            mode === 'video' && !library.slot && supportsVideoReferences(model)
              ? ['IMAGE', 'VIDEO']
              : ['IMAGE']
          }
          selected={library.slot ? [] : attachments.flatMap((file) => (file.saved ? [file.saved.id] : []))}
          multiple={!library.slot}
          maxFiles={model ? Math.max(0, referenceLimit(model) - attachments.length) : 4 - attachments.length}
          validateFile={(file) =>
            mode === 'video' && model
              ? videoReferenceError(model, [file], library.slot ? 'frames' : undefined)
              : !/^image\/(jpeg|png|webp)$/.test(file.mime)
                ? 'Выберите изображение JPEG, PNG или WebP.'
                : undefined
          }
          onPick={(file) => pickLibraryFiles([file])}
          onPickMany={pickLibraryFiles}
          onClose={() => setLibrary(undefined)}
        />
      )}
    </div>
  );
}
