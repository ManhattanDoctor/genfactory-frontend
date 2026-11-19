import { ComposerTemplatePanel } from './ComposerTemplatePanel';
import { RequiredPhotoSlots } from '../../components/RequiredPhotoSlots';
import { MediaModelPicker } from '../catalog/MediaModelPicker';
import { fitTemplateDuration, resolveTemplateDuration } from './templateDuration';
import { loadTemplate } from './templateCatalog';
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
import { ComposerTemplateFields } from './ComposerTemplateFields';
import { PromptTemplate } from './PromptTemplate';
import {
  prepareComposerTemplate,
  rebaseComposerTemplate,
  updateComposerField,
  type ComposerTemplate,
} from './templateComposer';
import { templateTimingError, syncTemplateDuration } from './templateRecipe';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEventCallback } from '../../lib/useEventCallback';
import { useLocation } from 'react-router-dom';
import { api, getSession, type IUploadProgress } from '../../lib/api';
import type { IGnosisFile, IFileGeneration, IConversationMessage, IPagination } from '../../lib/types';
import { useContentConversation } from './useContentConversation';
import { ContentThread } from './ContentThread';
import { sizeRatio } from './controls';
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
import { ArrowUp, Plus, X } from 'lucide-react';
import { LibraryPicker } from '../../components/LibraryPicker';
import { useAuth } from '../auth/AuthProvider';
import { useDraft } from '../workspace/drafts';
import { toggleItem, usePreferences } from '../workspace/preferences';
import { defaultAssistant } from '../catalog/defaultAssistant';
import { isAllowedProvider } from '../../lib/modelPolicy';
import { modelKey, modelTitle } from '../catalog/presentation';
import templates from './templates.json';
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
  const submitting = useRef<object | undefined>(undefined);
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
  const favorites = user ? prefs.value.favoriteTemplates : guestFavorites;
  const toggleFavorite = useEventCallback((id: string) => {
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
    if (user) prefs.update((current) => ({ ...current, favoriteTemplates: next }));
    else {
      setGuestFavorites(next);
      localStorage.setItem('genfactory.content-template-favorites.guest', JSON.stringify(next));
    }
  });
  const [mode, setMode] = useState<StudioMode>('image');
  const [panel, setPanel] = useState('templates');
  const [selectedModel, setSelectedModel] = useState('Auto');
  const catalog = useStudioCatalog(mode, user?.id);
  const [galleryHidden, setGalleryHidden] = useState(false);
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
    const referenceId = templateVideoReference?.fileId;
    if (referenceId) {
      setAttachments((files) => files.filter((file) => (file.saved?.id ?? file.restoreId) !== referenceId));
    }
    clearTemplateFields();
    setTemplateVideoReference(undefined);
    setTemplateStartsFresh(false);
    setTemplateGlowActive(false);
    setDraft('');
    work.setError('');
    studioDraft.changed();
    textarea.current?.focus();
  }
  const applyTemplateText = (item: ITemplate): void => {
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
      const target = item.model
        ? catalog.data?.find((candidate) => modelKey(candidate) === modelKey({ reference: item.model! }))
        : model;
      chosenDuration = resolveTemplateDuration(item, duration, target);
      const timingError = item.kind === 'video' ? templateTimingError(prompt, chosenDuration) : undefined;
      if (timingError) throw new Error(timingError);
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
    setPicked([]);
    setWriter(false);
    setRestoredGeneration(undefined);
    setFrameSlot(undefined);
    work.setError('');
    requestAnimationFrame(() => textarea.current?.focus());
  };
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 720px)').matches);
  const sheet = useRef<HTMLDialogElement>(null);
  const studio = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const element = studio.current;
    if (!mobile || !viewport || !element) return;
    const fit = () => {
      const covered = Math.max(
        0,
        element.getBoundingClientRect().bottom - viewport.offsetTop - viewport.height,
      );
      element.style.setProperty('--studio-keyboard-inset', `${covered}px`);
      element.style.setProperty('--studio-visible-height', `${viewport.height}px`);
    };
    fit();
    viewport.addEventListener('resize', fit);
    viewport.addEventListener('scroll', fit);
    return () => {
      viewport.removeEventListener('resize', fit);
      viewport.removeEventListener('scroll', fit);
      element.style.removeProperty('--studio-keyboard-inset');
      element.style.removeProperty('--studio-visible-height');
    };
  }, [mobile]);
  const [mobileGallery, setMobileGallery] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)');
    const change = () => {
      setMobile(query.matches);
      if (!query.matches) setMobileGallery(false);
    };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (mobileGallery) sheet.current?.showModal();
    else sheet.current?.close();
  }, [mobileGallery]);

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
  const current = useMemo(() => (templates as ITemplateCard[]).filter((t) => t.kind === mode), [mode]);
  const genres = useMemo(
    () => [...new Set(current.map((t) => t.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    [current],
  );
  const visible = useMemo(() => {
    const favoriteIds = new Set(favorites);
    return current
      .filter((t) => (!genre || t.genre === genre) && (!favoritesOnly || favoriteIds.has(t.id)))
      .sort(
        (a, b) =>
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
        const target = loaded.model
          ? catalog.data?.find((candidate) => modelKey(candidate) === modelKey({ reference: loaded.model! }))
          : model;
        const full = fitTemplateDuration(loaded, duration, target);
        applyTemplateText(full);
      } catch (error) {
        work.setError(error instanceof Error ? error.message : 'Не удалось загрузить шаблон.');
        return;
      }
    }
  });
  const visibleFields = fields.filter(
    (field) =>
      mode !== 'presentation' &&
      (mode === 'video' || !['camera', 'move'].includes(field.id)) &&
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
      if (!isAllowedProvider(generation.model.provider)) {
        const title = modelTitle({ reference: generation.model, name: generation.model.model });
        throw new Error(
          `Для результата использовалась модель ${title}. В Студии доступны модели OpenRouter. Чтобы перенести текст, нажмите «Повторить запрос».`,
        );
      }
      const available = await api.catalog(generation.model.provider);
      const selected = available.find(
        (item) =>
          item.reference.provider === generation.model.provider &&
          item.reference.model === generation.model.model,
      );
      if (!selected) throw new Error('Модель этой генерации больше недоступна.');
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
    if (busy || submitting.current === work.scope) return;
    if (missingFields || needsTemplateImages) {
      work.setError(missingFields ? 'Заполните параметры шаблона.' : 'Добавьте недостающие фото.');
      return;
    }
    if (!draft.trim() && !picked.length && !attachments.length) return;
    const submissionScope = work.scope;
    submitting.current = submissionScope;
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
      if (submitting.current === submissionScope) {
        submitting.current = undefined;
        setAwaitingAcceptance(undefined);
      }
      if (current()) {
        setUploading(false);
        setUploadProgress(undefined);
      }
    }
  }
  const answerQuestion = useStudioQuestion({ work, busy, session, agent, alive });

  const generationControls = (
    <>
      {mode === 'video' && (
        <>
          {(!model || modelProperties.duration) && (
            <div className="cw-stepper" role="group" aria-label="Длительность видео" aria-disabled={busy}>
              <button
                type="button"
                aria-label="Короче"
                disabled={busy || !durations.some((value) => value < duration)}
                onClick={() =>
                  setDuration(
                    [...durations].sort((a, b) => b - a).find((value) => value < duration) ?? duration,
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
                    [...durations].sort((a, b) => a - b).find((value) => value > duration) ?? duration,
                  )
                }
              >
                +
              </button>
            </div>
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
      {mode !== 'presentation' && ratioOptions.length > 0 && (
        <StudioMenu
          disabled={busy || referenceRatio}
          label={referenceRatio ? 'По исходному кадру' : effectiveRatio}
          ariaLabel={`Стороны: ${referenceRatio ? 'по исходному кадру' : effectiveRatio}`}
          options={ratioOptions}
          onSelect={setRatio}
        />
      )}
    </>
  );
  const gallery = (
    <aside id="studio-gallery" className="cw-gallery" aria-label="Галерея шаблонов" data-gallery-view={panel}>
      <div className="cw-gallery-head">
        <button
          type="button"
          className="mobile-gallery-close icon-button"
          aria-label="Закрыть шаблоны и настройки"
          onClick={() => setMobileGallery(false)}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <div className="cw-gallery-tabs ds-tabs" role="tablist" aria-label="Шаблоны или настройки">
          {['templates', 'settings'].map((key, index) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={panel === key}
              aria-label={key === 'settings' && settingsChanged ? 'Настройки, есть изменения' : undefined}
              title={key === 'settings' && settingsChanged ? 'Есть изменения' : undefined}
              onClick={() => setPanel(key)}
            >
              {index ? 'Настройки' : 'Шаблоны'}
              {key === 'settings' && settingsChanged && (
                <span className="settings-change-dot" aria-hidden="true" />
              )}
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
        ) : (
          <div className="cw-settings-pane">
            {mobile && <div className="mobile-generation-controls">{generationControls}</div>}
            {settingsChanged && (
              <button className="button" type="button" disabled={busy} onClick={resetSettings}>
                Сбросить к умолчанию
              </button>
            )}
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
                {visibleFields.map((f) => (
                  <StudioMenu
                    disabled={busy}
                    key={f.id}
                    fieldId={f.id}
                    showPreviews={mode === 'video'}
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
  );

  return (
    <div ref={studio} className={`content-studio ${mobileGallery ? 'mobile-gallery-open' : ''}`}>
      <div id="creatives" className="panel ms-dots">
        <div className="cw" id="creative-workspace" data-gallery={width} data-gallery-hidden={galleryHidden}>
          <section className="cw-chat" aria-label="Чат проекта">
            <div className="cw-stage">
              <div className="cw-thread">
                {work.conversation && (
                  <ContentThread
                    thread={work.thread}
                    key={work.conversation.id}
                    conversation={work.conversation}
                    busy={busy}
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
                <div className="cw-field">
                  {currentTemplate && (
                    <ComposerTemplatePanel
                      title={currentTemplate.title}
                      disabled={busy}
                      onReset={resetComposerTemplate}
                    >
                      {composerTemplate && templateRecipe.variables.length > 0 && (
                        <ComposerTemplateFields
                          key={currentTemplate.id}
                          disabled={busy}
                          recipe={templateRecipe}
                          values={composerTemplate.values}
                          onChange={(key, value) => {
                            const next = updateComposerField(
                              rebaseComposerTemplate(composerTemplate, draft),
                              key,
                              value,
                            );
                            setComposerTemplate(next);
                            setDraft(next.text);
                            work.setError('');
                          }}
                        />
                      )}
                      <RequiredPhotoSlots
                        count={requiredPhotos}
                        filled={photoCount}
                        disabled={busy || attachments.some((file) => !!file.slot)}
                        onAdd={() => {
                          setFrameSlot(undefined);
                          setLibrary({ scope: draftScope });
                        }}
                      />
                    </ComposerTemplatePanel>
                  )}
                  <StudioAttachments
                    publicReference={publicReference}
                    onRemovePublicReference={() => {
                      setTemplateVideoReference(undefined);
                      studioDraft.changed();
                    }}
                    picked={picked}
                    attachments={attachments}
                    attachmentBusy={attachmentBusy}
                    onRemoveTemplate={(id) => {
                      if (attachmentBusy || submitting.current === work.scope) return;
                      setPicked((previous) => previous.filter((item) => item.id !== id));
                    }}
                    onRemoveAttachment={(file) => {
                      if (attachmentBusy || submitting.current === work.scope) return;
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
                      rows={3}
                      value={draft}
                      placeholder={
                        mode === 'video' && supportsVideoReferences(model)
                          ? 'Опишите сюжет и движение. Можно добавить свои фото и видео - укажите, что использовать как образец, что изменить и что сохранить.'
                          : 'Опишите идею и желаемый результат. Можно добавить свои изображения - объясните, как их использовать и какие детали сохранить.'
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
                    mobile={mobile}
                    studio
                    disabled={busy}
                    label={model ? modelTitle(model) : 'Выбрать модель'}
                    selected={model ? modelKey(model) : selectedModel}
                    name={`Модель: ${model ? modelTitle(model) : selectedModel}`}
                    onSelect={setSelectedModel}
                    favorites={user ? prefs.value.favoriteModels : undefined}
                    onFavorite={
                      user
                        ? (key) =>
                            prefs.update((current) => ({
                              ...current,
                              favoriteModels: toggleItem(current.favoriteModels, key),
                            }))
                        : undefined
                    }
                    error={prefs.error}
                  />
                  {mobile && (
                    <button
                      type="button"
                      className="mobile-gallery-toggle"
                      aria-haspopup="dialog"
                      aria-controls="studio-gallery"
                      aria-expanded={mobileGallery}
                      onClick={() => {
                        setPanel('settings');
                        setMobileGallery(true);
                      }}
                    >
                      Ещё
                    </button>
                  )}
                  {!mobile && generationControls}
                  <button
                    className="cw-send"
                    type="submit"
                    aria-label="Отправить запрос"
                    aria-busy={busy}
                    disabled={
                      busy ||
                      missingFields ||
                      needsTemplateImages ||
                      (!draft.trim() && !picked.length && !attachments.length)
                    }
                  >
                    {busy ? <span className="spinner" aria-hidden="true" /> : <ArrowUp size={24} />}
                  </button>
                </div>
                {work.busy && awaitingAcceptance !== work.scope && (
                  <p className="content-feedback" role="status">
                    Можно набрать следующий запрос. Отправка станет доступна после завершения текущего.
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
          <button
            type="button"
            className="icon-button shell-collapse gallery-collapse"
            aria-label={galleryHidden ? 'Показать галерею' : 'Скрыть галерею'}
            title={galleryHidden ? 'Показать галерею' : 'Скрыть галерею'}
            aria-expanded={!galleryHidden}
            aria-controls="studio-gallery"
            onClick={() => setGalleryHidden((hidden) => !hidden)}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
          {mobile ? (
            <dialog
              ref={sheet}
              className="studio-mobile-sheet"
              aria-label="Шаблоны и настройки"
              onClose={() => setMobileGallery(false)}
              onClick={(event) => {
                if (event.target === sheet.current) setMobileGallery(false);
              }}
            >
              {gallery}
            </dialog>
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
