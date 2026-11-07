import { useRetainedModel } from '../catalog/useRetainedModel';
import { AgentWorkspace, agentRequest } from './AgentWorkspace';
import { UploadButtonContent } from '../../components/UploadButtonContent';
import type { IUploadProgress } from '../../lib/api';
import { FileOutputEditor, useFileOutputSettings } from '../../components/FileOutputEditor';
import { useDraft, DraftBar, restoreDraftFiles } from './drafts';
import { UploadSurface } from '../../components/UploadSurface';
import { ReferenceList } from '../../components/ReferenceList';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getSession } from '../../lib/api';
import type { IGnosisFile, MediaKind, IMessageCreate, IConversation } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';
import { ConversationResults } from '../studio/ConversationResults';
import { connection } from '../studio/conversations';
import { WorkspaceNav } from './WorkspaceNav';
import { textInstruction, textModes, type TextMode } from './prompt';
import { usePreferences } from './preferences';
import { ToolPicker } from './ToolPicker';
import { LibraryPicker } from '../../components/LibraryPicker';
import { SelectControl } from '../../components/SelectControl';
import { videoAnalysisError, videoAnalysisTool } from '../prompt/videoAnalysis';

export function TextStudio({ mode }: { mode: TextMode }) {
  const auth = useAuth();
  const location = useLocation();
  return <TextEditor key={`${auth.user?.id}:${mode}:${location.key}`} mode={mode} />;
}
function TextEditor({ mode }: { mode: TextMode }) {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const modernAgent = mode === 'chat' && params.get('studio') !== 'advanced';
  const client = useQueryClient();
  const prefs = usePreferences();
  const rawId = params.get('conversation');
  const id =
    rawId && /^[1-9]\d*$/.test(rawId) && Number.isSafeInteger(Number(rawId)) ? Number(rawId) : undefined;
  const incoming = location.state as {
    userId?: number;
    prompt?: string;
    reference?: IGnosisFile;
    references?: IGnosisFile[];
  } | null;
  const ownsIncoming = incoming?.userId === undefined || incoming.userId === auth.user?.id;
  const [prompt, setPrompt] = useState(ownsIncoming ? incoming?.prompt || '' : '');
  const [files, setFiles] = useState<IGnosisFile[]>(
    ownsIncoming
      ? (incoming?.references || (incoming?.reference ? [incoming.reference] : []))
          .filter((f) => f.userId === auth.user?.id && (!modernAgent || f.type === 'IMAGE'))
          .slice(0, 4)
      : [],
  );
  const [selected, setSelected] = useState('');
  const [toolIds, setToolIds] = useState<string[]>([]);
  const [language, setLanguage] = useState('Русский');
  const [target, setTarget] = useState('image');
  const [aspects, setAspects] = useState(['Объект', 'Композицию', 'Стиль']);
  const [useBrand, setUseBrand] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<IUploadProgress>();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const submitting = useRef(false);
  const restored = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrent = (sid: string) =>
    mounted.current &&
    getSession() === sid &&
    window.location.pathname === location.pathname &&
    window.location.search === location.search;
  const detail = useQuery<IConversation>({
    queryKey: ['conversation', auth.user?.id, id],
    enabled: !!auth.user && !!id,
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === 'LOADING' ? 2000 : false),
    queryFn: async ({ signal }) => {
      const c = await api.conversation(id!, signal);
      if (c.userId !== auth.user!.id) throw new Error('Эта беседа принадлежит другому аккаунту.');
      return c;
    },
  });
  const conversation = detail.data;
  const fileOutput = useFileOutputSettings(
    `${auth.user?.id}:${location.pathname}:${location.search}`,
    conversation,
  );
  const models = useQuery({
    queryKey: ['conversation-models', auth.user?.id],
    enabled: !!auth.user,
    staleTime: 300000,
    queryFn: ({ signal }) => api.catalog('OPEN_AI_CONVERSATION', signal),
  });
  const videoModels = useQuery({
    queryKey: ['video-analysis-models', auth.user?.id],
    enabled: !!auth.user && !modernAgent,
    queryFn: ({ signal }) => api.catalog('OPEN_ROUTER_TEXT', signal),
    staleTime: 300000,
  });
  const savedVideoTool = conversation?.options.tools?.find(
    (t) => typeof t !== 'string' && t.uid === 'VIDEO_RECOGNITION',
  );
  const videoModel = (videoModels.data || []).find(
    (m) =>
      m.capabilities?.includes('VIDEO_INPUT') &&
      (typeof savedVideoTool !== 'object' ||
        !savedVideoTool.settings ||
        m.reference.model === savedVideoTool.settings.model.model),
  );
  const videoTool = videoModel
    ? typeof savedVideoTool === 'object' && savedVideoTool.settings
      ? { ...savedVideoTool, settings: { ...savedVideoTool.settings, isLockSelection: true } }
      : videoAnalysisTool(videoModel)
    : undefined;
  const retained = useRetainedModel(
    conversation ? { provider: conversation.model, model: conversation.options.model } : undefined,
    models.data,
    auth.user?.id,
  );
  const requestedModelKey = modernAgent
    ? selected || conversation?.options.model
    : conversation?.options.model || selected;
  const model = requestedModelKey
    ? models.data?.find((m) => m.reference.model === requestedModelKey) ||
      (retained?.reference.model === requestedModelKey ? retained : undefined)
    : (modernAgent ? models.data?.find((m) => m.reference.model === 'gpt-5.4') : undefined) ||
      models.data?.[0];
  useEffect(() => {
    if (conversation && !restored.current) {
      setToolIds((conversation.options.tools || []).map((t) => (typeof t === 'string' ? t : t.uid)));
      restored.current = true;
    }
  }, [conversation]);
  const send = useMutation({
    mutationKey: ['send-message', auth.user?.id],
    retry: false,
    mutationFn: ({ id, body, sid }: { id: number; body: IMessageCreate; sid: string }) =>
      api.sendMessage(id, body, sid),
    onSettled: (_data, failure, v) => {
      client.setQueryData(['send-error', auth.user?.id, v.id], failure?.message || null);
      void client.invalidateQueries({ queryKey: ['conversation', auth.user?.id, v.id] });
      void client.invalidateQueries({ queryKey: ['messages', auth.user?.id, v.id] });
      void client.invalidateQueries({ queryKey: ['agent-messages', auth.user?.id, v.id] });
      void client.invalidateQueries({ queryKey: ['conversations', auth.user?.id] });
      window.dispatchEvent(new Event('genfactory:generation-finished'));
    },
  });
  const sendError = useQuery<string | null>({
    queryKey: ['send-error', auth.user?.id, id],
    queryFn: () => null,
    enabled: false,
  });
  const pending = useIsMutating({ mutationKey: ['send-message', auth.user?.id] });
  const busy = creating || saving || pending > 0 || conversation?.status === 'LOADING';
  const connected = (conversation?.options.tools || []).map((t) => (typeof t === 'string' ? t : t.uid));
  const toolsChanged =
    !!conversation && (toolIds.length !== connected.length || toolIds.some((t) => !connected.includes(t)));
  const imageCapable =
    !conversation || conversation.model === 'OPEN_AI_CONVERSATION'
      ? !!model?.capabilities?.includes('IMAGE_INPUT')
      : false;
  const saveTools = async () => {
    if (!conversation || !auth.session || busy) return;
    setSaving(true);
    setError('');
    const sid = auth.session;
    try {
      const fresh = await api.conversation(conversation.id, undefined, sid);
      if (!isCurrent(sid)) return;
      if (fresh.userId !== auth.user!.id || fresh.status === 'LOADING')
        throw new Error('Беседа занята. Дождитесь завершения работы.');
      const tools = toolIds.map(
        (uid) => fresh.options.tools?.find((t) => (typeof t === 'string' ? t : t.uid) === uid) || { uid },
      );
      const updated = await api.editConversation(fresh, { options: { ...fresh.options, tools } }, sid);
      if (isCurrent(sid)) {
        client.setQueryData(['conversation', auth.user!.id, id], updated);
        setNotice('Инструменты сохранены.');
      }
    } catch (e) {
      if (isCurrent(sid)) setError(e instanceof Error ? e.message : 'Не удалось сохранить инструменты.');
    } finally {
      if (isCurrent(sid)) setSaving(false);
    }
  };
  const draft = useDraft(
    `${mode}:${id || 'new'}`,
    { prompt, files, selected, toolIds, language, target, aspects, useBrand },
    true,
  );
  const restoreDraft = async (value: NonNullable<typeof draft.available>['value']) => {
    if (!auth.user || !auth.session || busy || uploading) return;
    if (
      typeof value.prompt !== 'string' ||
      !Array.isArray(value.toolIds) ||
      value.toolIds.some((v) => typeof v !== 'string') ||
      !Array.isArray(value.aspects) ||
      value.aspects.some((v) => typeof v !== 'string') ||
      typeof value.language !== 'string' ||
      typeof value.target !== 'string'
    ) {
      setError('Черновик повреждён.');
      return;
    }
    const sid = auth.session;
    setUploading(true);
    const restored = await restoreDraftFiles(value.files, auth.user.id, sid);
    if (!isCurrent(sid)) return;
    setPrompt(value.prompt);
    setFiles(modernAgent ? restored.files.filter((f) => f.type === 'IMAGE').slice(0, 4) : restored.files);
    setSelected(value.selected);
    setToolIds(value.toolIds);
    setLanguage(value.language);
    setTarget(value.target);
    setAspects(value.aspects);
    setUseBrand(!!value.useBrand);
    draft.changed();
    setUploading(false);
    setUploadProgress(undefined);
    setNotice(
      restored.missing ? 'Черновик восстановлен. Недоступные файлы пропущены.' : 'Черновик восстановлен.',
    );
  };
  const upload = async (selectedFiles: FileList | File[] | null) => {
    if (!auth.user || !auth.session) {
      void auth.signIn();
      return;
    }
    if (!selectedFiles || uploading || busy) return;
    const sid = auth.session;
    setUploading(true);
    setUploadProgress(undefined);
    setError('');
    try {
      let count = files.length;
      draft.changed();
      for (const source of Array.from(selectedFiles)) {
        if (!isCurrent(sid)) return;
        if (source.size > 20 * 1024 * 1024) throw new Error('Используйте файлы до 20 МБ.');
        if (/\.(txt|md)$/i.test(source.name)) {
          if (source.size > 100_000) throw new Error('Текстовый материал должен быть меньше 100 КБ.');
          const text = await source.text();
          if (isCurrent(sid)) setPrompt((p) => `${p}\n\nМатериал «${source.name}»:\n${text}`.slice(0, 24000));
          continue;
        }
        const isVideo = ['video/mp4', 'video/webm', 'video/quicktime'].includes(source.type);
        const isImage = ['image/png', 'image/jpeg', 'image/webp'].includes(source.type);
        const isDocument = /\.(pdf|docx?|xlsx?|csv|json)$/i.test(source.name);
        const isAudio = /\.(mp3|wav|ogg|m4a)$/i.test(source.name);
        if (isImage && !imageCapable) throw new Error('Выбранная модель не поддерживает анализ изображений.');
        if (!isVideo && !isImage && !isDocument && !isAudio)
          throw new Error('Выберите изображение, видео, документ, таблицу или аудиозапись.');
        if (isVideo) {
          const issue = videoAnalysisError({ type: 'VIDEO', mime: source.type, size: source.size });
          if (issue) throw Error(issue);
        }
        const images = [source];
        if (count + images.length > 4) throw new Error('Можно прикрепить до четырёх файлов.');
        for (const image of images) {
          if (!isCurrent(sid)) return;
          const saved = await api.upload(image, sid, undefined, (progress) => {
            if (isCurrent(sid)) setUploadProgress(progress);
          });
          if (!isCurrent(sid)) return;
          if (
            saved.userId !== auth.user.id ||
            (isImage && saved.type !== 'IMAGE') ||
            (isVideo && saved.type !== 'VIDEO')
          )
            throw new Error('Не удалось получить файл вашего аккаунта.');
          count++;
          setFiles((prev) => (prev.some((f) => f.id === saved.id) ? prev : [...prev, saved]));
        }
        if (isDocument) setNotice('Для анализа документа подключите инструмент «Чтение документов».');
        if (isAudio) setNotice('Для аудиозаписи подключите инструмент «Расшифровка аудио».');
        if (isVideo) {
          setToolIds((v) => (v.includes('VIDEO_RECOGNITION') ? v : [...v, 'VIDEO_RECOGNITION']));
          setNotice('Видео будет проанализировано инструментом «Анализ видео».');
        }
        void client.invalidateQueries({ queryKey: ['files', auth.user.id] });
      }
    } catch (e) {
      if (isCurrent(sid)) setError(e instanceof Error ? e.message : 'Не удалось загрузить материал.');
    } finally {
      if (isCurrent(sid)) {
        setUploading(false);
        setUploadProgress(undefined);
        if (input.current) input.current.value = '';
      }
    }
  };
  const submit = async () => {
    if (!auth.user || !auth.session) {
      void auth.signIn();
      return;
    }
    if (busy || uploading || submitting.current || (!prompt.trim() && !(modernAgent && files.length))) return;
    if (rawId && !conversation) {
      setError('Откройте доступную беседу или начните новую.');
      return;
    }
    if ((!conversation || modernAgent) && !model) {
      setError('Дождитесь загрузки моделей.');
      return;
    }
    if (model?.status === 'DISABLED') {
      setError('Модель отключена администратором. Выберите другую модель.');
      return;
    }
    const requestedModel = selected || conversation?.options.model;
    if (modernAgent && requestedModel && !model) {
      setError('Сохранённая модель недоступна. Выберите модель из списка.');
      return;
    }
    if (toolsChanged && !modernAgent) {
      setError('Сохраните выбранные инструменты перед отправкой.');
      return;
    }
    if (files.some((f) => f.type === 'IMAGE') && !imageCapable) {
      setError('Для этих вложений нужна модель с поддержкой изображений.');
      return;
    }
    if (
      files.some((f) => f.type === 'DOCUMENT') &&
      !toolIds.some((t) => ['DOCUMENT_READ', 'DOCUMENT_SEARCH', 'TABLE_QUERY'].includes(t))
    ) {
      setError('Подключите инструмент чтения документов или работы с таблицами.');
      return;
    }
    if (files.some((f) => f.type === 'AUDIO') && !toolIds.includes('STT')) {
      setError('Подключите инструмент «Расшифровка аудио».');
      return;
    }
    const videos = files.filter((f) => f.type === 'VIDEO');
    if (videos.length && (!videoTool || !toolIds.includes('VIDEO_RECOGNITION'))) {
      setError('Подключите инструмент «Анализ видео» и дождитесь загрузки совместимой модели.');
      return;
    }
    for (const file of videos) {
      const issue = videoAnalysisError(file);
      if (issue) {
        setError(issue);
        return;
      }
    }
    submitting.current = true;
    setError('');
    const sid = auth.session;
    const userId = auth.user.id;
    const body: IMessageCreate = {
      role: 'USER',
      text: modernAgent
        ? agentRequest(prompt, model!)
        : textInstruction(mode, prompt, {
            language,
            target,
            aspects,
            brand: useBrand ? prefs.value.brand : '',
          }),
      files: files.map((f) => f.id),
      settings: {
        tools: videos.length && videoTool ? [videoTool] : [],
        ...(modernAgent ? { isToolsDisabled: true } : {}),
      },
    };
    try {
      if (videos.length) {
        const checked = await Promise.all(videos.map((f) => api.file(f.id, sid)));
        if (checked.some((f) => f.userId !== userId || f.type !== 'VIDEO' || videoAnalysisError(f)))
          throw Error('Исходное видео недоступно или не подходит для анализа.');
        body.text +=
          '\nДля каждого видео вызови VIDEO_RECOGNITION с его fileId один раз, без повторов после ошибки. Не делай выводов о звуке без подтверждения. Видео: ' +
          videos.map((f) => f.id).join(', ');
      }
      let active = conversation;
      if (modernAgent) {
        const checked = await Promise.all(files.map((f) => api.file(f.id, sid)));
        if (checked.some((f) => f.userId !== userId || f.type !== 'IMAGE'))
          throw Error('Исходное изображение недоступно.');
        if (!isCurrent(sid)) return;
        if (active) {
          active = await api.conversation(active.id, undefined, sid);
          if (!isCurrent(sid)) return;
          if (active.userId !== userId || active.status === 'LOADING')
            throw Error('Беседа занята или недоступна.');
          if (active.options.tools?.length)
            throw Error(
              'В этой беседе подключены инструменты. Продолжите в расширенном режиме или начните новый диалог.',
            );
          if (active.model !== model!.reference.provider)
            throw Error('Для этой модели начните новый диалог.');
          if (active.options.model !== model!.reference.model)
            active = await api.editConversation(
              active,
              { options: { ...active.options, model: model!.reference.model } },
              sid,
            );
          client.setQueryData(['conversation', userId, active.id], active);
        }
      }
      if (active && fileOutput.changed) {
        active = await api.editFileOutput(active.id, fileOutput.value, sid);
        if (!isCurrent(sid)) return;
        client.setQueryData(['conversation', userId, active.id], active);
      }
      if (!active) {
        setCreating(true);
        active = await api.createConversation(
          {
            name:
              prompt.trim().length < 2
                ? modernAgent
                  ? 'Обсуждение изображения'
                  : `Идея ${prompt.trim()}`
                : prompt.trim().slice(0, 64),
            model: model!.reference.provider,
            options: {
              model: model!.reference.model,
              tools: modernAgent
                ? []
                : toolIds.map((uid) => (uid === 'VIDEO_RECOGNITION' && videoTool ? videoTool : { uid })),
            },
            tags: ['genfactory', mode],
            ...(fileOutput.changed ? { fileOutput: fileOutput.value } : {}),
            history: 32,
            isConsiderHistory: true,
            system:
              'Ты — творческий ассистент Genfactory. Следуй режиму последнего сообщения. Обсуждение, подготовка промпта и сценария не являются разрешением запускать генерацию медиа. Не выдумывай содержимое файлов. Используй инструменты только для задачи пользователя. После ошибки не повторяй платный вызов автоматически.',
          },
          sid,
        );
        void client.invalidateQueries({ queryKey: ['conversations', userId] });
        if (!isCurrent(sid)) return;
        client.setQueryData(['conversation', userId, active.id], active);
        navigate(
          `/${mode === 'chat' ? 'agent' : mode}?conversation=${active.id}${params.get('studio') === 'advanced' ? '&studio=advanced' : ''}`,
          { replace: true },
        );
      }
      client.setQueryData(['send-error', userId, active.id], null);
      await send.mutateAsync({ id: active.id, body, sid });
      draft.clear();
      if (isCurrent(sid)) {
        setPrompt('');
        if (modernAgent) setFiles([]);
      }
    } catch (e) {
      if (isCurrent(sid))
        setError(
          `${e instanceof Error ? e.message : 'Ответ не получен.'} Проверьте историю перед повторной отправкой. Автоматического повтора нет.`,
        );
    } finally {
      if (mounted.current) setCreating(false);
      submitting.current = false;
    }
  };
  const handoff = (text: string, kind: MediaKind, refs: IGnosisFile[] = files) =>
    navigate(
      `/${kind}${conversation && connection(conversation, kind) ? `?conversation=${conversation.id}` : ''}`,
      {
        state: {
          prompt: text,
          references: (refs.length ? refs : files)
            .filter((f) => f.type === 'IMAGE' && f.userId === auth.user?.id)
            .slice(0, 4),
          userId: auth.user?.id,
        },
      },
    );
  if (modernAgent)
    return (
      <>
        <AgentWorkspace
          conversation={conversation}
          models={models.data || []}
          model={model}
          prompt={prompt}
          files={files}
          busy={busy || uploading}
          disabled={!!auth.user && (!model || (!!rawId && !conversation))}
          error={
            error ||
            detail.error?.message ||
            models.error?.message ||
            (rawId && !id ? 'Некорректный адрес беседы.' : '') ||
            (send.error?.message || sendError.data
              ? `${send.error?.message || sendError.data} Проверьте историю перед повторной отправкой. Автоматического повтора нет.`
              : '') ||
            (conversation?.status === 'ERROR'
              ? 'Предыдущий запрос завершился с ошибкой. Проверьте сообщения.'
              : '')
          }
          notice={notice}
          draft={
            <>
              {!!conversation?.options.tools?.length && (
                <Link className="text-button" to={`/agent?conversation=${conversation.id}&studio=advanced`}>
                  Расширенный режим
                </Link>
              )}
              {draft.available && (
                <DraftBar draft={draft} busy={busy || uploading} onRestore={(v) => void restoreDraft(v)} />
              )}
            </>
          }
          onPrompt={(v) => {
            draft.changed();
            setPrompt(v);
          }}
          onFiles={(v) => {
            draft.changed();
            setFiles(v);
          }}
          onModel={(m) => {
            draft.changed();
            setSelected(m.reference.model);
          }}
          onLibrary={() => (auth.user ? setPicker(true) : void auth.signIn())}
          onSubmit={() => void submit()}
        />
        {picker && (
          <LibraryPicker
            selected={files.map((f) => f.id)}
            onClose={() => setPicker(false)}
            onPick={(f) => {
              if (f.userId !== auth.user?.id || f.type !== 'IMAGE') return;
              draft.changed();
              setFiles((v) => (v.some((x) => x.id === f.id) ? v : [...v, f].slice(0, 4)));
            }}
          />
        )}
      </>
    );
  return (
    <div className="studio page-enter">
      <header className="studio-heading">
        <div>
          <span className="eyebrow">ОТ ИДЕИ К ГОТОВОМУ КАДРУ</span>
          <h1>{textModes[mode].title}</h1>
        </div>
      </header>
      <WorkspaceNav
        conversationId={conversation?.id}
        draft={{ prompt, references: files, userId: auth.user?.id }}
        media={!!conversation && !!connection(conversation, 'image') && !!connection(conversation, 'video')}
      />
      <div className="conversation-toolbar">
        <span className="muted small">
          {conversation ? `Работа: ${conversation.name}` : 'Новая рабочая беседа'}
        </span>
        <button
          className="button"
          disabled={creating}
          onClick={() => navigate(`/${mode === 'chat' ? 'agent' : mode}`)}
        >
          Новая работа
        </button>
      </div>
      {detail.error && (
        <p role="alert" className="error">
          {detail.error.message}
          <button className="text-button" onClick={() => void detail.refetch()}>
            Повторить
          </button>
        </p>
      )}
      {rawId && !id && (
        <p role="alert" className="error">
          Некорректный адрес беседы.
        </p>
      )}
      <div className="studio-layout">
        <UploadSurface disabled={busy || uploading} onFiles={(files) => void upload(files)}>
          <section className="composer" onChange={draft.changed}>
            <DraftBar
              draft={draft}
              busy={busy || uploading}
              onRestore={(value) => void restoreDraft(value)}
            />
            <h2>
              {mode === 'chat'
                ? 'О чём поговорим?'
                : mode === 'prompt'
                  ? 'Что нужно получить?'
                  : 'Бриф для сценария'}
            </h2>
            {mode === 'prompt' && (
              <>
                <div className="settings-grid">
                  <label className="setting-field">
                    <span>Назначение промпта</span>
                    <SelectControl value={target} onChange={(e) => setTarget(e.target.value)}>
                      <option value="image">Изображение</option>
                      <option value="video">Видео</option>
                    </SelectControl>
                  </label>
                  <label className="setting-field">
                    <span>Язык промпта</span>
                    <SelectControl value={language} onChange={(e) => setLanguage(e.target.value)}>
                      <option>Русский</option>
                      <option>English</option>
                    </SelectControl>
                  </label>
                </div>
                <div className="tool-choices">
                  {['Объект', 'Композицию', 'Стиль', 'Свет'].map((a) => (
                    <label key={a}>
                      <input
                        type="checkbox"
                        checked={aspects.includes(a)}
                        onChange={() =>
                          setAspects((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]))
                        }
                      />
                      {a}
                    </label>
                  ))}
                </div>
              </>
            )}
            <label className="prompt-label" htmlFor="text-prompt">
              Ваш запрос
            </label>
            <textarea
              id="text-prompt"
              rows={7}
              maxLength={24000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
              placeholder={textModes[mode].placeholder}
            />
            <ReferenceList
              files={files}
              disabled={busy || uploading}
              onChange={(files) => {
                draft.changed();
                setFiles(files);
              }}
            />
            <div className="workspace-actions material-actions">
              <button
                className="button"
                disabled={busy || uploading}
                aria-busy={uploading}
                onClick={() => (auth.user ? input.current?.click() : void auth.signIn())}
              >
                <UploadButtonContent busy={uploading} progress={uploadProgress}>
                  Добавить материал
                </UploadButtonContent>
              </button>
              <button
                className="button"
                disabled={!auth.user || busy || uploading || files.length >= 4}
                onClick={() => setPicker(true)}
              >
                Из библиотеки
              </button>
            </div>
            <input
              type="file"
              hidden
              ref={input}
              accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,.txt,.md,.pdf,.doc,.docx,.csv,.xls,.xlsx,.json,.mp3,.wav,.ogg,.m4a"
              onChange={(e) => void upload(e.target.files)}
            />
            <p className="small muted">
              Изображения, документы, таблицы и аудио до 20 МБ. Видео MP4/WebM до 12 МБ анализируется целиком.
            </p>
            {!conversation && (
              <label className="setting-field">
                <span>Ассистент</span>
                <SelectControl
                  aria-label="Ассистент"
                  disabled={busy || uploading || !models.data?.length}
                  value={model?.reference.model || ''}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setToolIds([]);
                  }}
                >
                  {!models.data?.length && <option>Загружаем модели…</option>}
                  {models.data?.map((m) => (
                    <option key={m.reference.model} value={m.reference.model}>
                      {m.name}
                    </option>
                  ))}
                </SelectControl>
              </label>
            )}
            {models.error && (
              <p className="error">
                Не удалось загрузить модели.
                <button className="text-button" onClick={() => void models.refetch()}>
                  Повторить
                </button>
              </p>
            )}
            <label className="option-check">
              <input
                type="checkbox"
                checked={useBrand}
                disabled={!prefs.value.brand}
                onChange={(e) => setUseBrand(e.target.checked)}
              />
              Использовать правила бренда
            </label>
            {auth.user && (conversation || model) && (
              <ToolPicker
                provider={conversation?.model || model!.reference.provider}
                value={toolIds}
                onChange={setToolIds}
                disabled={busy || uploading || (!conversation && !model?.capabilities?.includes('TOOLS'))}
              />
            )}
            {auth.user && (
              <FileOutputEditor value={fileOutput.value} onChange={fileOutput.onChange} disabled={busy} />
            )}
            {toolsChanged && (
              <button className="button" disabled={busy} onClick={() => void saveTools()}>
                Сохранить инструменты
              </button>
            )}
            {(error || send.error || sendError.data) && (
              <p role="alert" className="error">
                {error ||
                  `${send.error?.message || sendError.data} Проверьте историю перед повторной отправкой.`}
              </p>
            )}
            {notice && (
              <p role="status" className="small muted">
                {notice}
              </p>
            )}
            <button
              className="button primary generate-button"
              disabled={
                busy ||
                uploading ||
                (!!auth.user &&
                  (!prompt.trim() || toolsChanged || (!!rawId && !conversation) || (!rawId && !model)))
              }
              onClick={() => void submit()}
            >
              {busy
                ? 'Ассистент работает…'
                : auth.user
                  ? mode === 'prompt'
                    ? 'Подготовить промпт'
                    : mode === 'script'
                      ? 'Подготовить сценарий'
                      : 'Отправить'
                  : 'Войти и продолжить'}
            </button>
            <p className="billing-note">Ответ ассистента и вызванные инструменты оплачиваются с баланса.</p>
          </section>
        </UploadSurface>
        <section className="studio-output" aria-label="Ответы ассистента">
          {conversation ? (
            <ConversationResults
              conversation={conversation}
              latestRequest={send.submittedAt}
              onUse={(f, kind) => handoff('', kind, [f])}
              onUseText={handoff}
            />
          ) : (
            <div className="studio-empty">
              <h2>
                {mode === 'chat'
                  ? 'Сначала — хорошая идея.'
                  : mode === 'prompt'
                    ? 'От референса к точному описанию.'
                    : 'История начинается с замысла.'}
              </h2>
              <p>
                Обсудите задачу, уточните результат, затем передайте готовый текст в редактор изображения или
                видео.
              </p>
            </div>
          )}
        </section>
      </div>
      {picker && (
        <LibraryPicker
          imagesOnly={false}
          acceptedTypes={['IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO']}
          selected={files.map((f) => f.id)}
          onClose={() => setPicker(false)}
          onPick={(f) => {
            const issue = videoAnalysisError(f);
            if (issue) {
              setError(issue);
              return;
            }
            if (f.type === 'VIDEO')
              setToolIds((v) => (v.includes('VIDEO_RECOGNITION') ? v : [...v, 'VIDEO_RECOGNITION']));
            draft.changed();
            setFiles((p) => [...p, f].slice(0, 4));
          }}
        />
      )}
    </div>
  );
}
