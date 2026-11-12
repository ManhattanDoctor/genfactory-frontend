import type { ReactElement } from 'react';
import { ComposerAttachment } from '../../components/ComposerAttachment';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowUp, Plus } from 'lucide-react';
import type { IConversation, IGnosisFile, IModelDescription } from '../../lib/types';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { useConversationRoom } from '../realtime/RealtimeProvider';
import { ImageMenu } from '../studio/MediaWorkspace';
import { displayMessageText } from '../studio/conversations';
import { modelKey, modelTitle } from '../catalog/presentation';
import { usePreferences, toggleItem } from './preferences';
import { Media } from '../../components/MediaPreview';
import '../studio/image-workspace.css';
import '../studio/banana-workspace.css';
import './agent-workspace.css';

export function agentRequest(text: string, model: IModelDescription): string {
  return (
    '[Genfactory:chat]\nОбсуди вопрос пользователя и приложенные изображения. Отвечай по существу. Не создавай медиафайлы и не вызывай инструменты.\n[Genfactory:agent-model] ' +
    JSON.stringify({ name: modelTitle(model), ...model.reference }) +
    '\n\nЗапрос пользователя:\n' +
    (text.trim() || 'Опиши, что видно на приложенных изображениях.')
  );
}
export function agentModelName(text: string): string {
  const line = text.split('\n').find((l) => l.startsWith('[Genfactory:agent-model] '));
  try {
    const data = JSON.parse(line?.slice('[Genfactory:agent-model] '.length) || 'null');
    return typeof data?.name === 'string' ? data.name : 'AI agent';
  } catch {
    return 'AI agent';
  }
}
export function AgentWorkspace({
  conversation,
  models,
  model,
  prompt,
  files,
  busy,
  disabled,
  error,
  notice,
  draft,
  onPrompt,
  onFiles,
  onModel,
  onLibrary,
  onSubmit,
}: {
  conversation?: IConversation;
  models: IModelDescription[];
  model?: IModelDescription;
  prompt: string;
  files: IGnosisFile[];
  busy: boolean;
  disabled: boolean;
  error: string;
  notice: string;
  draft?: ReactNode;
  onPrompt: (v: string) => void;
  onFiles: (v: IGnosisFile[]) => void;
  onModel: (v: IModelDescription) => void;
  onLibrary: () => void;
  onSubmit: () => void;
}): ReactElement {
  const { user } = useAuth(),
    prefs = usePreferences();
  const dock = useRef<HTMLFormElement>(null),
    thread = useRef<HTMLDivElement>(null),
    area = useRef<HTMLTextAreaElement>(null);
  const [bottom, setBottom] = useState(240);
  useConversationRoom(conversation?.id);
  const messages = useInfiniteQuery({
    queryKey: ['agent-messages', user?.id, conversation?.id],
    enabled: !!conversation,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.messages(conversation!.id, pageParam, signal),
    getNextPageParam: (last) => (last.pageIndex + 1 < last.pages ? last.pageIndex + 1 : undefined),
    refetchInterval: busy ? 2000 : false,
  });
  const ordered = (messages.data?.pages.flatMap((p) => p.items) || [])
    .slice()
    .sort((a, b) => a.id - b.id)
    .filter((m) => m.role === 'USER' || m.role === 'ASSISTANT');
  let name = 'AI agent';
  const rows = ordered.map((m) => {
    if (m.role === 'USER') name = agentModelName(m.text || '');
    return { ...m, modelName: name };
  });
  useEffect(() => {
    if (!dock.current) return;
    const resize = new ResizeObserver(() => setBottom(dock.current!.offsetHeight + 94));
    resize.observe(dock.current);
    return () => resize.disconnect();
  }, []);
  const lastId = ordered.at(-1)?.id;
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [lastId, busy]);
  useLayoutEffect(() => {
    if (!area.current) return;
    area.current.style.height = '72px';
  }, [prompt]);
  return (
    <div className="image-workspace agent-workspace" aria-label="AI agent">
      {!rows.length && !busy && (
        <div className="banana-brand agent-brand" aria-hidden="true">
          <img src="/media/prototype/agent.webp" alt="" />
          <span>AI agent</span>
        </div>
      )}
      <div className="agent-thread" ref={thread} style={{ bottom }} aria-label="Диалог" aria-live="polite">
        {messages.hasNextPage && (
          <button
            className="text-button"
            disabled={messages.isFetchingNextPage}
            onClick={() => void messages.fetchNextPage()}
          >
            Предыдущие сообщения
          </button>
        )}
        {rows.map((m) => (
          <article className={`agent-msg ${m.role === 'USER' ? 'is-user' : 'is-assistant'}`} key={m.id}>
            {m.role === 'ASSISTANT' && <div className="agent-who">{m.modelName}</div>}
            {m.text && <p>{m.role === 'USER' ? displayMessageText(m.text) : m.text}</p>}
            {!!m.files?.length && (
              <div className="agent-pics">
                {m.files
                  .filter((f) => f.userId === user?.id && f.type === 'IMAGE')
                  .map((f) => (
                    <Media key={f.id} file={f} />
                  ))}
              </div>
            )}
          </article>
        ))}
        {busy && (
          <p className="agent-wait" role="status">
            Ассистент отвечает…
          </p>
        )}
        {messages.error && (
          <p role="alert" className="image-error">
            {messages.error.message}
          </p>
        )}
      </div>
      <form
        className="img-dock"
        ref={dock}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {draft}
        {!!files.length && (
          <div className="img-files">
            {files.map((f) => (
              <ComposerAttachment
                key={f.id}
                file={f}
                disabled={busy}
                onRemove={() => onFiles(files.filter((x) => x.id !== f.id))}
              />
            ))}
          </div>
        )}
        <textarea
          id="agent-draft"
          ref={area}
          aria-label="Вопрос"
          rows={3}
          value={prompt}
          disabled={busy}
          maxLength={24000}
          placeholder="Напишите вопрос. Если нужно, приложите изображение"
          onChange={(e) => onPrompt(e.target.value)}
        />
        <div className="img-tools">
          <button
            className="cw-plus"
            type="button"
            aria-label="Добавить изображение"
            disabled={busy || files.length >= 4 || (!!user && !model?.capabilities?.includes('IMAGE_INPUT'))}
            onClick={onLibrary}
          >
            <Plus size={20} />
          </button>
          <ImageMenu
            name="Модель"
            label={model ? modelTitle(model) : 'GPT 5.4'}
            models={models}
            selection={model && modelKey(model)}
            disabled={busy}
            favorites={prefs.value.favoriteModels}
            onFavorite={(k) =>
              prefs.update((v) => ({ ...v, favoriteModels: toggleItem(v.favoriteModels, k) }))
            }
            onSelect={(k) => {
              const value = models.find((m) => modelKey(m) === k);
              if (value) onModel(value);
            }}
          />
          <button
            className="cw-send"
            type="submit"
            aria-label="Отправить"
            disabled={busy || disabled || (!prompt.trim() && !files.length)}
          >
            <ArrowUp size={22} />
          </button>
        </div>
        {error && (
          <p role="alert" className="image-error">
            {error}
          </p>
        )}
        {notice && (
          <p className="agent-note" role="status">
            {notice}
          </p>
        )}
      </form>
    </div>
  );
}
