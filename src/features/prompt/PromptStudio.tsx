import { FileReferenceType } from '../../lib/types';
import { catalogQuery } from '../catalog/catalogQuery';
import type { ReactElement } from 'react';
import { ComposerAttachment } from '../../components/ComposerAttachment';
import { isAllowedProvider } from '../../lib/modelPolicy';
import { useRetainedModel } from '../catalog/useRetainedModel';
import { promptSystem, videoAnalysisError, videoAnalysisTool } from './videoAnalysis';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ArrowUp, Plus, Copy, Download, Expand, ArrowUpRight } from 'lucide-react';
import { api, getSession } from '../../lib/api';
import type { IGnosisFile, IConversationMessage, IToolConnection } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';
import { useConversationRoom } from '../realtime/RealtimeProvider';
import { ImageMenu } from '../studio/MediaWorkspace';
import { modelKey, modelTitle } from '../catalog/presentation';
import { usePreferences, toggleItem } from '../workspace/preferences';
import { useDraft, DraftBar, restoreDraftFiles } from '../workspace/drafts';
import { LibraryPicker } from '../../components/LibraryPicker';
import { Media } from '../../components/MediaPreview';
import { Modal } from '../../components/Modal';
import {
  initialPromptInput,
  promptAspects,
  promptRequest,
  promptTargets,
  promptTasks,
  readPromptInput,
  readPromptResult,
  type PromptInput,
  type PromptResult,
} from './contract';
import '../studio/image-workspace.css';
import '../studio/banana-workspace.css';
import './prompt-workspace.css';

type Card = { id: number; result?: PromptResult; input?: PromptInput; files: IGnosisFile[]; raw: string };
export function PromptStudio(): ReactElement {
  const { user } = useAuth();
  const location = useLocation();
  return <PromptEditor key={`${user?.id}:${location.search}`} />;
}
function PromptEditor(): ReactElement {
  const auth = useAuth(),
    navigate = useNavigate(),
    client = useQueryClient(),
    prefs = usePreferences();
  const [params] = useSearchParams();
  const rawId = params.get('conversation');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const id =
    rawId && /^[1-9]\d*$/.test(rawId) && Number.isSafeInteger(Number(rawId)) ? Number(rawId) : undefined;
  const [input, setInput] = useState<PromptInput>(initialPromptInput);
  const [files, setFiles] = useState<IGnosisFile[]>([]);
  const [selected, setSelected] = useState('');
  const [picker, setPicker] = useState(false);
  const [aspectsOpen, setAspectsOpen] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [viewer, setViewer] = useState<Card>();
  const dirty = useRef(false),
    restored = useRef(false),
    sending = useRef(false);
  const aspectRoot = useRef<HTMLDivElement>(null),
    dock = useRef<HTMLFormElement>(null);
  const [bottom, setBottom] = useState(234);
  const pending = useIsMutating({ mutationKey: ['send-message', auth.user?.id] });
  useConversationRoom(id);
  const detail = useQuery({
    queryKey: ['conversation', auth.user?.id, id],
    enabled: !!auth.user && !!id,
    retry: false,
    queryFn: ({ signal }) => api.conversation(id!, signal),
    refetchInterval: (q) => (pending || q.state.data?.status === 'LOADING' ? 2000 : false),
  });
  const conversation = detail.data;
  const busy = creating || pending > 0 || conversation?.status === 'LOADING';
  const catalog = useQuery({
    queryKey: ['conversation-models', auth.user?.id],
    enabled: !!auth.user,
    queryFn: ({ signal }) => api.conversationModels(signal),
    staleTime: 300000,
  });
  const videoCatalog = useQuery({
    ...catalogQuery(auth.user?.id, 'OPEN_ROUTER_TEXT'),
    enabled: !!auth.user,
    queryFn: ({ signal }) => api.catalog('OPEN_ROUTER_TEXT', signal),
    staleTime: 300000,
  });
  const hasVideo = files.some((f) => f.type === 'VIDEO');
  const imageModels = (catalog.data || []).filter((m) => m.capabilities?.includes('IMAGE_INPUT'));
  const models = hasVideo
    ? (videoCatalog.data || []).filter(
        (m) => m.capabilities?.includes('VIDEO_INPUT') && m.capabilities?.includes('TEXT_OUTPUT'),
      )
    : imageModels;
  const savedAnalysis = conversation?.options.tools?.find(
    (tool) => typeof tool === 'object' && tool.uid === 'VIDEO_RECOGNITION',
  );
  const savedReference = hasVideo
    ? typeof savedAnalysis === 'object'
      ? savedAnalysis.settings?.model
      : undefined
    : conversation
      ? { provider: conversation.model, model: conversation.options.model }
      : undefined;
  const retained = useRetainedModel(
    savedReference,
    (hasVideo ? videoCatalog.data : catalog.data) ? models : undefined,
    auth.user?.id,
  );
  const model = selected
    ? models.find((m) => m.reference.model === selected) ||
      (retained?.reference.model === selected ? retained : undefined)
    : models.find((m) => m.reference.model === 'gpt-5.4') || models[0];
  const unavailableModel = !!selected && !!(hasVideo ? videoCatalog.data : catalog.data) && !model;
  const retainedAssistant = useRetainedModel(
    conversation ? { provider: conversation.model, model: conversation.options.model } : undefined,
    catalog.data,
    auth.user?.id,
  );
  const assistantModel = hasVideo
    ? (conversation ? retainedAssistant : undefined) ||
      imageModels.find((m) => m.reference.model === 'gpt-4o-mini' && m.capabilities?.includes('TOOLS')) ||
      imageModels.find((m) => m.capabilities?.includes('TOOLS'))
    : model;
  const messages = useInfiniteQuery({
    queryKey: ['prompt-messages', auth.user?.id, id],
    enabled: !!conversation,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.messages(id!, pageParam, signal),
    getNextPageParam: (last) => (last.pageIndex + 1 < last.pages ? last.pageIndex + 1 : undefined),
    refetchInterval: busy ? 2000 : false,
  });
  const ordered = (messages.data?.pages.flatMap((p) => p.items) || []).slice().sort((a, b) => a.id - b.id);
  const cards: Card[] = [];
  let request: IConversationMessage | undefined;
  for (const message of ordered) {
    if (message.role === 'USER') request = message;
    if (message.role !== 'ASSISTANT' || !message.text) continue;
    const source = (request?.files || []).filter(
      (f) => f.userId === auth.user?.id && ['IMAGE', 'VIDEO'].includes(f.type),
    );
    const settings = readPromptInput(request?.text || '');
    const result = request
      ? readPromptResult(
          message.text,
          source.map((f) => f.id),
        )
      : undefined;
    cards.unshift({
      id: message.id,
      files: source,
      input: settings,
      raw: message.text,
      result:
        result ||
        (!settings && !!request
          ? {
              status: 'ready',
              title: 'Готовый промпт',
              prompt: message.text,
              observations: [],
              limitations: [],
              clarifications: [],
            }
          : undefined),
    });
  }
  const draft = useDraft(
    `prompt-canvas:${id || 'new'}`,
    { input, files, selected },
    !!files.length || !!input.note.trim(),
  );
  const change = (patch: Partial<PromptInput>) => {
    dirty.current = true;
    draft.changed();
    setInput((v) => ({ ...v, ...patch }));
  };
  useEffect(() => {
    if (restored.current || dirty.current || !ordered.length || draft.available) return;
    const latest = [...ordered].reverse().find((m) => m.role === 'USER');
    const value = readPromptInput(latest?.text || '');
    if (value) {
      setInput(value);
      // Sent references stay on the result card; the composer starts without them.
    }
    const video = latest?.files?.some((f) => f.type === 'VIDEO');
    if (video) setSelected('');
    else if (conversation && isAllowedProvider(conversation.model)) setSelected(conversation.options.model);
    restored.current = true;
  }, [messages.data, draft.available]);
  useEffect(() => {
    const element = dock.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setBottom(element.offsetHeight + 104));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!aspectsOpen) return;
    const close = (e: PointerEvent) => {
      if (!aspectRoot.current?.contains(e.target as Node)) setAspectsOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAspectsOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
    };
  }, [aspectsOpen]);
  const send = useMutation({
    mutationKey: ['send-message', auth.user?.id],
    retry: false,
    mutationFn: ({
      conversationId,
      text,
      source,
      sid,
      tools,
    }: {
      conversationId: number;
      text: string;
      source: number[];
      tools: IToolConnection[];
      sid: string;
    }) =>
      api.sendMessage(
        conversationId,
        {
          role: 'USER',
          text,
          references: source.map((id) => ({ type: FileReferenceType.FILE, id })),
          settings: { tools, ...(!tools.length ? { isToolsDisabled: true } : {}) },
        },
        sid,
      ),
    onSettled: (_data, failure, v) => {
      client.setQueryData(['prompt-error', auth.user?.id, v.conversationId], failure?.message || null);
      void client.invalidateQueries({ queryKey: ['conversation', auth.user?.id, v.conversationId] });
      void client.invalidateQueries({ queryKey: ['prompt-messages', auth.user?.id, v.conversationId] });
      void client.invalidateQueries({ queryKey: ['conversations', auth.user?.id] });
      window.dispatchEvent(new Event('genfactory:generation-finished'));
    },
  });
  const sendError = useQuery<string | null>({
    queryKey: ['prompt-error', auth.user?.id, id],
    queryFn: () => null,
    enabled: false,
  });
  const submit = async () => {
    if (!auth.user || !auth.session) {
      void auth.signIn();
      return;
    }
    if (
      busy ||
      sending.current ||
      !model ||
      !assistantModel ||
      unavailableModel ||
      !files.length ||
      !input.aspects.length
    )
      return;
    if (model?.status === 'DISABLED' || assistantModel?.status === 'DISABLED') {
      setError('Модель отключена администратором. Выберите другую модель.');
      return;
    }
    if (rawId && !conversation) {
      setError('Откройте доступную беседу.');
      return;
    }
    const sid = auth.session,
      userId = auth.user.id;
    sending.current = true;
    setCreating(true);
    setError('');
    try {
      const actual = await Promise.all(files.map((f) => api.file(f.id, sid)));
      if (actual.some((f) => f.userId !== userId || !['IMAGE', 'VIDEO'].includes(f.type)))
        throw Error('Исходный материал недоступен.');
      for (const file of actual) {
        const issue = videoAnalysisError(file);
        if (issue) throw Error(issue);
      }
      const videos = actual.filter((f) => f.type === 'VIDEO');
      const tools = videos.length
        ? [{ ...videoAnalysisTool(model), ...(videos.length === 1 ? { isRequired: true } : {}) }]
        : [];
      const connections = tools.map(({ isRequired, ...tool }) => tool);
      if (getSession() !== sid || !mounted.current) return;
      let active = conversation;
      if (active) {
        active = await api.conversation(active.id, undefined, sid);
        if (active.userId !== userId || active.status === 'LOADING')
          throw Error('Беседа занята или недоступна.');
        if (active.model !== assistantModel.reference.provider)
          throw Error('Для другой модели анализа начните новую работу.');
        if (
          active.options.model !== assistantModel.reference.model ||
          JSON.stringify(active.options.tools || []) !== JSON.stringify(connections) ||
          active.system !== promptSystem
        )
          active = await api.editConversation(
            active,
            {
              options: {
                ...active.options,
                model: assistantModel.reference.model,
                tools: connections,
              },
              system: promptSystem,
            },
            sid,
          );
      } else
        active = await api.createConversation(
          {
            name: input.note.trim().slice(0, 64) || 'Промпт по материалам',
            model: assistantModel.reference.provider,
            options: {
              model: assistantModel.reference.model,
              tools: connections,
            },
            tags: ['genfactory', 'prompt'],
            history: 32,
            isConsiderHistory: true,
            system: promptSystem,
          },
          sid,
        );
      if (getSession() !== sid || !mounted.current) return;
      client.setQueryData(['conversation', userId, active.id], active);
      const promise = send.mutateAsync({
        conversationId: active.id,
        text: promptRequest(input, actual),
        source: actual.map((f) => f.id),
        tools,
        sid,
      });
      if (!id) navigate(`/prompt?conversation=${active.id}`, { replace: true });
      await promise;
      const sameConversation =
        getSession() === sid &&
        window.location.pathname === '/prompt' &&
        new URLSearchParams(window.location.search).get('conversation') === String(active.id);
      if (sameConversation) draft.clear();
      if (sameConversation && mounted.current) {
        restored.current = true;
        if (videos.length) setSelected('');
        setFiles((previous) => previous.filter((item) => !actual.some((source) => source.id === item.id)));
      }
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : 'Ответ не получен.'} Проверьте результат перед повторной отправкой. Автоматического повтора нет.`,
      );
    } finally {
      sending.current = false;
      setCreating(false);
    }
  };
  const usePrompt = (card: Card) => {
    if (!card.result?.prompt) return;
    const chosen = card.input?.target === 'universal' ? card.input.task : card.input?.target || 'image';
    const path =
      chosen === 'video'
        ? '/video'
        : chosen === 'banana'
          ? '/image?studio=banana'
          : chosen === 'presentation' || chosen === 'other'
            ? '/chat'
            : '/image';
    navigate(path, {
      state: {
        prompt: card.result.prompt,
        references: card.files.filter((f) => f.type === 'IMAGE'),
        userId: auth.user?.id,
      },
    });
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Промпт скопирован');
    } catch {
      setNotice('Не удалось скопировать. Откройте промпт и выделите текст вручную.');
    }
  };
  const download = (text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompt.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const issue =
    error ||
    (unavailableModel ? 'Сохранённая модель недоступна. Выберите модель анализа.' : '') ||
    detail.error?.message ||
    messages.error?.message ||
    catalog.error?.message ||
    (hasVideo ? videoCatalog.error?.message : undefined) ||
    sendError.data ||
    (rawId && !id ? 'Некорректный адрес беседы.' : '') ||
    (conversation?.status === 'ERROR'
      ? 'Запрос завершился с ошибкой. Проверьте результат перед повторной отправкой.'
      : '');
  return (
    <div className="image-workspace prompt-workspace" aria-label="Generate Prompt">
      {!cards.length && !busy && (
        <div className="banana-brand prompt-brand" aria-hidden="true">
          <img src="/media/prototype/prompt.webp" alt="" />
          <span>Generate Prompt</span>
        </div>
      )}
      <div className="prompt-wall" style={{ paddingBottom: bottom }} aria-label="Готовые промпты">
        {busy && (
          <div className="prompt-card prompt-wait" role="status">
            Подготавливаем промпт…
          </div>
        )}
        {cards.map((card) => (
          <article className="prompt-card" key={card.id}>
            <div className="prompt-card-shot">
              <button
                className="prompt-card-open"
                aria-label={`Открыть ${card.result?.title || 'ответ'}`}
                onClick={() => setViewer(card)}
              >
                {card.files[0] ? <Media file={card.files[0]} /> : <span>Готовый промпт</span>}
              </button>
              <div className="img-actions is-tools">
                {card.result?.prompt && (
                  <>
                    <button aria-label="Скопировать промпт" onClick={() => void copy(card.result!.prompt!)}>
                      <Copy size={18} />
                    </button>
                    <button aria-label="Скачать TXT" onClick={() => download(card.result!.prompt!)}>
                      <Download size={18} />
                    </button>
                    <button aria-label="В генератор" onClick={() => usePrompt(card)}>
                      <ArrowUpRight size={18} />
                    </button>
                  </>
                )}
                <button aria-label="Открыть промпт" onClick={() => setViewer(card)}>
                  <Expand size={18} />
                </button>
              </div>
            </div>
            <h3>{card.result?.title || 'Не удалось разобрать ответ'}</h3>
            <p className="prompt-card-text">
              {card.result?.prompt ||
                card.result?.clarifications.join(' ') ||
                card.result?.limitations.join(' ') ||
                'Ответ не соответствует формату промпта. Откройте его для просмотра.'}
            </p>
            {dirty.current &&
              card.input &&
              (JSON.stringify(card.input) !== JSON.stringify(input) ||
                card.files.map((f) => f.id).join(',') !== files.map((f) => f.id).join(',')) && (
                <p className="prompt-stale">
                  Это промпт предыдущего набора. Он не относится к текущим файлам.
                </p>
              )}
          </article>
        ))}
        {messages.hasNextPage && (
          <button
            className="button"
            disabled={messages.isFetchingNextPage}
            onClick={() => void messages.fetchNextPage()}
          >
            Загрузить ещё
          </button>
        )}
      </div>
      <form
        className="img-dock"
        ref={dock}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {draft.available && (
          <DraftBar
            draft={draft}
            busy={busy}
            onRestore={async (v) => {
              const value = readPromptInput('[Genfactory:prompt-input] ' + JSON.stringify(v.input));
              if (!value || !auth.user || !auth.session) return;
              const restored = await restoreDraftFiles(v.files, auth.user.id, auth.session);
              setFiles(restored.files.filter((f) => ['IMAGE', 'VIDEO'].includes(f.type)).slice(0, 4));
              setInput(value);
              setSelected(typeof v.selected === 'string' ? v.selected : '');
              dirty.current = true;
              draft.changed();
            }}
          />
        )}
        {!!files.length && (
          <div className="img-files">
            {files.map((f) => (
              <ComposerAttachment
                key={f.id}
                file={f}
                disabled={busy}
                onRemove={() => {
                  dirty.current = true;
                  draft.changed();
                  if (f.type === 'VIDEO' && files.filter((x) => x.type === 'VIDEO').length === 1)
                    setSelected('');
                  setFiles((v) => v.filter((x) => x.id !== f.id));
                }}
              />
            ))}
          </div>
        )}
        <textarea
          id="gp-note"
          aria-label="Что сохранить или изменить?"
          rows={3}
          value={input.note}
          disabled={busy}
          placeholder="Что сохранить или изменить? Например: оставить красную чашку, убрать фон"
          onChange={(e) => change({ note: e.target.value })}
        />
        <div className="img-tools">
          <button
            className="cw-plus"
            type="button"
            aria-label="Добавить изображение или видео"
            disabled={busy || files.length >= 4}
            onClick={() => (auth.user ? setPicker(true) : void auth.signIn())}
          >
            <Plus size={20} />
          </button>
          <ImageMenu
            label={
              unavailableModel
                ? 'Модель недоступна'
                : selected
                  ? model
                    ? modelTitle(model)
                    : 'Авто'
                  : 'Авто'
            }
            name="Модель"
            models={models}
            selection={selected && model ? modelKey(model) : undefined}
            autoOption={{
              selected: !selected,
              onSelect: () => {
                dirty.current = true;
                draft.changed();
                setSelected('');
              },
            }}
            disabled={busy}
            favorites={prefs.value.favoriteModels}
            onFavorite={(k) =>
              prefs.update((v) => ({ ...v, favoriteModels: toggleItem(v.favoriteModels, k) }))
            }
            onSelect={(k) => {
              const m = models.find((m) => modelKey(m) === k);
              if (m) {
                dirty.current = true;
                draft.changed();
                setSelected(m.reference.model);
              }
            }}
          />
          <ImageMenu
            label={promptTasks[input.task]}
            name="Задача"
            values={Object.values(promptTasks)}
            selection={promptTasks[input.task]}
            disabled={busy}
            note="Что нужно получить. Сам файл здесь не создаётся."
            onSelect={(v) =>
              change({
                task: Object.keys(promptTasks).find(
                  (k) => promptTasks[k as keyof typeof promptTasks] === v,
                ) as PromptInput['task'],
              })
            }
          />
          <div className="prompt-aspects" ref={aspectRoot}>
            <button
              className="cw-chip"
              type="button"
              aria-expanded={aspectsOpen}
              disabled={busy}
              onClick={() => setAspectsOpen((v) => !v)}
            >
              Что взять
            </button>
            {aspectsOpen && (
              <div className="cw-model-menu" role="group" aria-label="Что взять из материала">
                {promptAspects.map((a) => (
                  <label key={a}>
                    <input
                      type="checkbox"
                      checked={input.aspects.includes(a)}
                      onChange={() =>
                        change({
                          aspects: input.aspects.includes(a)
                            ? input.aspects.filter((x) => x !== a)
                            : [...input.aspects, a],
                        })
                      }
                    />
                    {a}
                  </label>
                ))}
              </div>
            )}
          </div>
          <ImageMenu
            label={promptTargets[input.target]}
            name="Куда пойдёт промпт"
            values={Object.values(promptTargets)}
            selection={promptTargets[input.target]}
            disabled={busy}
            note="От этого зависит формулировка и переход в генератор."
            onSelect={(v) =>
              change({
                target: Object.keys(promptTargets).find(
                  (k) => promptTargets[k as keyof typeof promptTargets] === v,
                ) as PromptInput['target'],
              })
            }
          />
          <ImageMenu
            label={input.language}
            name="Язык"
            values={['English', 'Русский']}
            selection={input.language}
            disabled={busy}
            note="Язык готового промпта."
            onSelect={(v) => change({ language: v as PromptInput['language'] })}
          />
          <button
            className="cw-send"
            type="submit"
            aria-label="Собрать промпт"
            disabled={
              busy ||
              !files.length ||
              !input.aspects.length ||
              (!!auth.user && (!model || !assistantModel || unavailableModel || (!!rawId && !conversation)))
            }
          >
            <ArrowUp size={22} />
          </button>
        </div>
        {issue && (
          <p className="image-error" role="alert">
            {issue}
          </p>
        )}
        {notice && (
          <p role="status" className="prompt-notice">
            {notice}
          </p>
        )}
      </form>
      {picker && (
        <LibraryPicker
          multiple
          maxFiles={4 - files.length}
          acceptedTypes={['IMAGE', 'VIDEO']}
          validateFile={videoAnalysisError}
          selected={files.map((f) => f.id)}
          onClose={() => setPicker(false)}
          onPick={(f) => {
            if (f.userId !== auth.user?.id || !['IMAGE', 'VIDEO'].includes(f.type)) return;
            const issue = videoAnalysisError(f);
            if (issue) {
              setError(issue);
              return;
            }
            if (f.type === 'VIDEO' && !hasVideo) setSelected('');
            setError('');
            dirty.current = true;
            draft.changed();
            setFiles((v) => (v.some((x) => x.id === f.id) ? v : [...v, f].slice(0, 4)));
          }}
        />
      )}

      {viewer && (
        <Modal
          className="prompt-result-modal"
          title={viewer.result?.title || 'Ответ ассистента'}
          onClose={() => setViewer(undefined)}
          wide
        >
          <div className="prompt-view">
            {(viewer.result ? viewer.result.prompt : viewer.raw) && (
              <p>{viewer.result ? viewer.result.prompt : viewer.raw}</p>
            )}
            {!!viewer.result?.observations.length && (
              <>
                <h3>Что использовано из файлов</h3>
                {viewer.result.observations.map((o, i) => (
                  <p key={i}>
                    {viewer.files.find((f) => f.id === o.fileId)?.name}: {o.text}
                  </p>
                ))}
              </>
            )}
            {!!viewer.result?.clarifications.length && (
              <>
                <h3>Что нужно уточнить</h3>
                {viewer.result.clarifications.map((s, i) => (
                  <p key={i}>{s}</p>
                ))}
              </>
            )}
            {!!viewer.result?.limitations.length && (
              <>
                <h3>Ограничения анализа</h3>
                {viewer.result.limitations.map((s, i) => (
                  <p key={i}>{s}</p>
                ))}
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
