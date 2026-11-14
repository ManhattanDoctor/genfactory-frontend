import type { ReactElement } from 'react';
import { parseStudioQuestion, studioReplyText, type StudioQuestion } from './studioAgent';
import { StudioQuestionCard } from './StudioQuestionCard';
import { isReadyScript } from './script';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, safeMediaUrl } from '../../lib/api';
import type { IConversation, IConversationMessage, IGnosisFile, MediaKind } from '../../lib/types';
import { MessageContent } from '../../components/MessageContent';
import { Media, MediaPreview } from '../../components/MediaPreview';
import { displayMessageText } from '../studio/conversations';
import { useConversationProgress } from '../studio/useConversationProgress';
import { useConversationError } from '../studio/useConversationError';
import { toolLabel } from '../studio/progress';
import { modelTitle } from '../catalog/presentation';
import { useAuth } from '../auth/AuthProvider';

interface ITurn {
  ask?: IConversationMessage;
  reply?: IConversationMessage;
}
export function ContentThread({
  conversation,
  onUse,
  onRepeat,
  onUseScript,
  onUseParameters,
  onAnswer,
  onRequest,
  busy,
}: {
  conversation: IConversation;
  onUse: (file: IGnosisFile, kind: MediaKind) => void;
  onRepeat: (text: string) => void;
  onUseScript: (text: string, messageId: number) => void;
  busy: boolean;
  onRequest?: (message: IConversationMessage) => void;
  onAnswer: (question: StudioQuestion, messageId: number, answer: string) => Promise<boolean>;
  onUseParameters: (file: IGnosisFile) => void;
}): ReactElement {
  const { user } = useAuth();
  const end = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<IGnosisFile>();
  const [copied, setCopied] = useState<number>();
  const [copyError, setCopyError] = useState(false);
  const [jump, setJump] = useState(false);
  const progress = useConversationProgress(conversation);
  const error = useConversationError(conversation);
  const messages = useQuery({
    queryKey: ['messages', conversation.userId, conversation.id, page],
    queryFn: ({ signal }) => api.messages(conversation.id, page, signal),
  });
  const turns: ITurn[] = [];
  for (const message of [...(messages.data?.items || [])].reverse()) {
    if (message.role === 'USER') turns.push({ ask: message });
    else if (message.role === 'ASSISTANT') {
      const last = turns.at(-1);
      if (last && !last.reply) last.reply = message;
      else turns.push({ reply: message });
    }
  }
  const latestTurn = turns.at(-1);
  useEffect(() => {
    if (latestTurn?.ask) onRequest?.(latestTurn.ask);
  }, [latestTurn?.ask, onRequest]);
  const scrollToEnd = () => {
    const thread = end.current?.closest('.cw-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
  };
  useEffect(() => {
    const thread = end.current?.closest('.cw-thread');
    if (!thread) return;
    const onScroll = () => {
      follow.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
      setJump(!follow.current);
    };
    thread.addEventListener('scroll', onScroll);
    return () => thread.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (follow.current) scrollToEnd();
    else setJump(true);
  }, [messages.data, conversation.status]);
  const you = user?.preferences?.email?.charAt(0).toUpperCase() || 'Я';
  return (
    <>
      {messages.isPending && <p role="status">Загружаем сообщения…</p>}
      {messages.error && (
        <p role="alert">
          Не удалось загрузить сообщения. <button onClick={() => void messages.refetch()}>Повторить</button>
        </p>
      )}
      {turns.map(({ ask, reply }, index) => {
        const prompt = displayMessageText(ask?.text || '').replace(
          /^Подготовь сценарий для (изображения|видео)\. Сохрани смысл исходного брифа\. При необходимости уточни детали\. Предложи сценарий отдельно, не запускай генерацию\.\n\n/,
          '',
        );
        const waiting = !reply && index === turns.length - 1 && conversation.status === 'LOADING';
        const files = reply?.files || [];
        const question = reply?.files?.length ? undefined : parseStudioQuestion(reply?.text, ask?.text);
        const copyText = question?.question || reply?.text || prompt;
        const key = reply?.id || ask!.id;
        return (
          <article className="as-turn cw-turn" key={key}>
            {ask && (
              <div className="as-user">
                <div className="as-bubble">
                  {!!ask.files?.length && (
                    <div className="as-thumbs">
                      {ask.files
                        .filter((file) => file.type === 'IMAGE')
                        .map((file) => (
                          <button
                            key={file.id}
                            className="content-thumb"
                            aria-label={`Открыть ${file.name}`}
                            onClick={() => setPreview(file)}
                          >
                            <Media file={file} isPlaybackDisabled />
                          </button>
                        ))}
                    </div>
                  )}
                  {ask.files
                    ?.filter((file) => file.type !== 'IMAGE')
                    .map((file) => (
                      <p className="as-file" key={file.id}>
                        {file.name}
                      </p>
                    ))}
                  {prompt && <p className="as-ask">{prompt}</p>}
                </div>
                <span className="as-face as-face-you" aria-hidden="true">
                  {you}
                </span>
              </div>
            )}
            <div className="as-bot">
              <span className="as-face as-face-bot" aria-hidden="true">
                А
              </span>
              <div className="as-bot-main">
                <p className="as-role">Ассистент</p>
                {(reply?.text || waiting) && (
                  <div className="as-reply">
                    {waiting && (
                      <p className="as-status" role="status">
                        Собираю…
                      </p>
                    )}
                    {reply?.text && (
                      <div className="as-body">
                        {question ? (
                          <StudioQuestionCard
                            question={question}
                            disabled={busy || page !== 0 || messages.data?.items[0]?.id !== reply.id}
                            onAnswer={(answer) => onAnswer(question, reply.id, answer)}
                          />
                        ) : (
                          <MessageContent
                            text={studioReplyText(reply.text)}
                            files={reply.files}
                            onOpen={setPreview}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
                {waiting &&
                  progress.tools.map((tool, i) => (
                    <p className="as-status" key={i}>
                      {toolLabel(tool)}
                    </p>
                  ))}
                {files.map((file) =>
                  file.type === 'VIDEO' ? (
                    <Media
                      key={file.id}
                      file={file}
                      controls
                      autoPlay={false}
                      className="as-pic cw-shot"
                      frameClassName="cw-shot-frame"
                      showLoadingState
                      onReady={() => {
                        if (follow.current) scrollToEnd();
                      }}
                    />
                  ) : (
                    <button
                      className="content-result-preview"
                      key={file.id}
                      aria-label={`Открыть ${file.name}`}
                      onClick={() => setPreview(file)}
                    >
                      <Media
                        file={file}
                        className="as-pic cw-shot"
                        frameClassName="cw-shot-frame"
                        showLoadingState
                        onReady={() => {
                          if (follow.current) scrollToEnd();
                        }}
                      />
                    </button>
                  ),
                )}
                {!!files.length && (
                  <div className="cw-turn-chips">
                    {[
                      ...new Set(
                        files.map((file) =>
                          file.type === 'IMAGE' ? 'Изображение' : file.type === 'VIDEO' ? 'Видео' : 'Файл',
                        ),
                      ),
                    ].map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                )}
                {files
                  .filter((file) => file.origin?.generation)
                  .map((file) => {
                    const generation = file.origin!.generation!;
                    const options = generation.options;
                    const values = [
                      modelTitle({ reference: generation.model, name: generation.model.model }),
                      options.size,
                      options.aspectRatio,
                      options.quality,
                      options.resolution,
                      typeof options.duration === 'number' ? `${options.duration} с` : undefined,
                      typeof options.generateAudio === 'boolean'
                        ? options.generateAudio
                          ? 'Со звуком'
                          : 'Без звука'
                        : undefined,
                      typeof options.seed === 'number' ? `Seed: ${options.seed}` : undefined,
                    ];
                    return (
                      <div key={file.id} className="content-result-settings">
                        <div
                          className="cw-turn-chips"
                          aria-label={`Параметры ${file.name}`}
                          title="Параметры фактического запроса генерации"
                        >
                          {[
                            ...new Set(
                              values.filter(
                                (value) => typeof value === 'string' || typeof value === 'number',
                              ),
                            ),
                          ].map((value) => (
                            <span key={String(value)}>{String(value)}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                <div className="as-actions">
                  {files
                    .filter((file) => file.origin?.generation)
                    .map((file) => (
                      <button key={file.id} disabled={busy} onClick={() => onUseParameters(file)}>
                        Использовать параметры{files.length > 1 ? `: ${file.name}` : ''}
                      </button>
                    ))}
                  {ask?.text?.startsWith('[Genfactory:script]\n') &&
                    !!reply?.text &&
                    !question &&
                    isReadyScript(reply.text) &&
                    !files.length && (
                      <button disabled={busy} onClick={() => onUseScript(reply.text!, reply.id)}>
                        Использовать сценарий
                      </button>
                    )}
                  <button
                    disabled={!prompt || conversation.status === 'LOADING'}
                    onClick={() => onRepeat(prompt)}
                  >
                    Повторить запрос
                  </button>
                  <button
                    disabled={!copyText}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(copyText);
                        setCopied(key);
                        setCopyError(false);
                      } catch {
                        setCopyError(true);
                      }
                    }}
                  >
                    {copied === key ? 'Текст скопирован' : 'Скопировать текст'}
                  </button>
                  {files.map((file) => (
                    <a
                      key={file.id}
                      href={safeMediaUrl(file.path)}
                      download={file.name}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Скачать{files.length > 1 ? ` ${file.name}` : ''}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </article>
        );
      })}
      {conversation.status === 'LOADING' && !turns.some((turn) => !turn.reply) && (
        <div className="as-turn cw-turn">
          <p className="as-status" role="status">
            Собираю…
          </p>
        </div>
      )}
      {copyError && <p role="status">Не удалось скопировать текст.</p>}
      {conversation.status === 'ERROR' && (
        <p className="cw-turn inline-error content-error" role="alert">
          {error || 'Работа завершилась с ошибкой. Проверьте сообщения перед новым запуском.'}
        </p>
      )}
      {!!messages.data && messages.data.pages > 1 && (
        <nav aria-label="Страницы сообщений">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>
            Новее
          </button>
          <button disabled={page + 1 >= messages.data.pages} onClick={() => setPage(page + 1)}>
            Раньше
          </button>
        </nav>
      )}
      <div ref={end} />
      {jump && (
        <button
          className="as-jump"
          onClick={() => {
            follow.current = true;
            scrollToEnd();
            setJump(false);
          }}
        >
          К новым
        </button>
      )}
      {preview && (
        <MediaPreview
          file={preview}
          onClose={() => setPreview(undefined)}
          onUse={(file) => {
            onUse(file, 'image');
            setPreview(undefined);
          }}
          onAnimate={(file) => {
            onUse(file, 'video');
            setPreview(undefined);
          }}
        />
      )}
    </>
  );
}
