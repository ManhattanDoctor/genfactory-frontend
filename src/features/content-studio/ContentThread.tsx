import { MessageAction } from '../../components/MessageAction';
import { Check, Copy, Download, RotateCw, Settings } from 'lucide-react';
import type { ContentConversation } from './useContentConversation';
import { openActiveJobs } from '../../components/ActiveJobs';
import { CollapsibleMessage } from './CollapsibleMessage';
import { FilePlaceholder } from '../../components/FilePlaceholder';
import type { ReactElement } from 'react';
import { parseStudioQuestion, studioReplyText, type StudioQuestion } from './studioAgent';
import { StudioQuestionCard } from './StudioQuestionCard';
import { isReadyScript } from './script';
import { useEffect, useRef, useState } from 'react';
import { safeMediaUrl } from '../../lib/api';
import type { IConversation, IConversationMessage, IGnosisFile, MediaKind } from '../../lib/types';
import { MessageContent } from '../../components/MessageContent';
import { Media, MediaPreview } from '../../components/MediaPreview';
import { displayMessageText } from '../studio/conversations';
import { useConversationProgress } from '../studio/useConversationProgress';
import { useConversationError } from '../studio/useConversationError';
import { toolLabel } from '../studio/progress';
import { modelTitle } from '../catalog/presentation';

interface ITurn {
  ask?: IConversationMessage;
  reply?: IConversationMessage;
}
function PendingResult({
  tools,
}: {
  tools: ReturnType<typeof useConversationProgress>['tools'];
}): ReactElement {
  const generation = tools.find(
    (tool) =>
      (!tool.status || tool.status === 'STARTED') && /^(IMAGE|VIDEO)(_OPEN_(AI|ROUTER))?$/.test(tool.uid),
  );
  return (
    <div className="studio-pending-result">
      <div className="studio-pending-copy">
        <strong role="status">
          {generation
            ? generation.uid.startsWith('VIDEO')
              ? 'Ролик готовится'
              : 'Кадр готовится'
            : 'Готовим ответ…'}
        </strong>
        {generation && (
          <MessageAction
            aria-haspopup="dialog"

            onClick={openActiveJobs}
          >
            Открыть в работах
          </MessageAction>
        )}
      </div>
    </div>
  );
}

export function ContentThread({
  thread: { page, setPage, messages },
  conversation,
  onUse,
  onRepeat,
  onUseScript,
  onUseParameters,
  onAnswer,
  onRequest,
  busy,
}: {
  thread: ContentConversation['thread'];
  conversation: IConversation;
  onUse: (file: IGnosisFile, kind: MediaKind) => void;
  onRepeat: (text: string) => void;
  onUseScript: (text: string, messageId: number) => void;
  busy: boolean;
  onRequest?: (message: IConversationMessage) => void;
  onAnswer: (question: StudioQuestion, messageId: number, answer: string) => Promise<boolean>;
  onUseParameters: (file: IGnosisFile) => void;
}): ReactElement {
  const end = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [preview, setPreview] = useState<IGnosisFile>();
  const [copied, setCopied] = useState<string>();
  const [copyError, setCopyError] = useState(false);
  const [jump, setJump] = useState(false);
  const progress = useConversationProgress(conversation);
  const error = useConversationError(conversation);
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
  return (
    <>
      {messages.isPending && <p role="status">Загружаем сообщения…</p>}
      {messages.error && (
        <p role="alert">
          Не удалось загрузить сообщения.{' '}
          <MessageAction onClick={() => void messages.refetch()}>Повторить</MessageAction>
        </p>
      )}
      {turns.map(({ ask, reply }, index) => {
        const prompt = displayMessageText(ask?.text || '').replace(
          /^Подготовь сценарий для (изображения|видео)\. Сохрани смысл исходного брифа\. При необходимости уточни детали\. Предложи сценарий отдельно, не запускай генерацию\.\n\n/,
          '',
        );
        const waiting = !reply && index === turns.length - 1 && conversation.status === 'LOADING';
        const files = reply?.files || [];
        const question = reply?.files?.length ? undefined : parseStudioQuestion(reply?.text, ask);
        const nextPrompt = displayMessageText(turns[index + 1]?.ask?.text || '');
        const answerPrefix = question && `Ответ на вопрос «${question.question}»: `;
        const previousAnswer =
          answerPrefix && nextPrompt.startsWith(answerPrefix)
            ? nextPrompt.slice(answerPrefix.length)
            : undefined;
        const copyText = question?.question || reply?.text || prompt;
        const key = ask ? `ask:${ask.id}` : `reply:${reply!.id}`;
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
                            title={`Открыть ${file.name}`}
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
                  {ask.references
                    ?.filter(
                      (reference) => reference.type === 'URL' && /^https?:\/\//.test(reference.url || ''),
                    )
                    .map((reference) => (
                      <p className="as-file" key={reference.url}>
                        <a
                          className="content-external-reference"
                          href={reference.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span className="content-thumb">
                            <FilePlaceholder
                              file={{
                                name: 'Внешний референс',
                                mime: reference.mime || '',
                                type: reference.mime?.startsWith('image/')
                                  ? 'IMAGE'
                                  : reference.mime?.startsWith('video/')
                                    ? 'VIDEO'
                                    : 'DOCUMENT',
                              }}
                            />
                          </span>
                          Внешний референс
                        </a>
                      </p>
                    ))}
                  {prompt && (
                    <CollapsibleMessage>
                      <p className="as-ask">{prompt}</p>
                    </CollapsibleMessage>
                  )}
                </div>
              </div>
            )}
            <div className="as-bot">
              <div className="as-bot-main">
                {waiting && <PendingResult tools={progress.tools} />}
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
                      title={`Открыть ${file.name}`}
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
                {reply?.text && (
                  <div className="as-reply">
                    <div className="as-body">
                      {question ? (
                        <StudioQuestionCard
                          question={question}
                          previousAnswer={previousAnswer}
                          disabled={busy || page !== 0 || messages.data?.items[0]?.id !== reply.id}
                          onAnswer={(answer) => onAnswer(question, reply.id, answer)}
                        />
                      ) : (
                        <CollapsibleMessage>
                          <MessageContent
                            text={studioReplyText(reply.text)}
                            files={reply.files}
                            onOpen={setPreview}
                          />
                        </CollapsibleMessage>
                      )}
                    </div>
                  </div>
                )}
                {files.map((file) => {
                  const generation = file.origin?.generation;
                  const options = generation?.options;
                  const values = [
                    file.type === 'IMAGE' ? 'Изображение' : file.type === 'VIDEO' ? 'Видео' : 'Файл',
                    generation && modelTitle({ reference: generation.model, name: generation.model.model }),
                    options?.size,
                    options?.aspectRatio,
                    options?.quality,
                    options?.resolution,
                    typeof options?.duration === 'number' ? `${options.duration} с` : undefined,
                    typeof options?.generateAudio === 'boolean'
                      ? options.generateAudio
                        ? 'Со звуком'
                        : 'Без звука'
                      : undefined,
                    typeof options?.seed === 'number' ? `Seed: ${options.seed}` : undefined,
                  ];
                  return (
                    <p key={file.id} className="content-result-meta" title={file.name}>
                      {[
                        ...new Set(
                          values
                            .filter((value) => value !== undefined && value !== null && value !== '')
                            .map(String),
                        ),
                      ].map((value) => (
                        <span key={value}>{value}</span>
                      ))}
                    </p>
                  );
                })}
                {!question && !waiting && (
                  <div className={files.length ? 'as-actions content-result-actions' : 'as-actions'}>
                    {files.map((file) => (
                      <a
                        className="button"
                        key={file.id}
                        href={safeMediaUrl(file.path)}
                        title={files.length > 1 ? `Скачать ${file.name}` : 'Скачать'}
                        aria-label={files.length > 1 ? `Скачать ${file.name}` : 'Скачать'}
                        download={file.name}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download size={16} aria-hidden="true" />
                      </a>
                    ))}
                    {(ask?.settings?.isToolsDisabled === true ||
                      ask?.text?.startsWith('[Genfactory:script]\n')) &&
                      !!reply?.text &&
                      !question &&
                      isReadyScript(reply.text) &&
                      !files.length && (
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() => onUseScript(reply.text!, reply.id)}
                        >
                          Использовать сценарий
                        </button>
                      )}
                    <button
                      className="button"
                      disabled={!prompt || conversation.status === 'LOADING'}
                      title="Повторить запрос"
                      aria-label="Повторить запрос"
                      onClick={() => onRepeat(prompt)}
                    >
                      <RotateCw size={16} aria-hidden="true" />
                    </button>
                    {files
                      .filter((file) => file.origin?.generation)
                      .map((file) => (
                        <button
                          className="button"
                          key={file.id}
                          disabled={busy}
                          title={
                            files.length > 1
                              ? `Использовать параметры: ${file.name}`
                              : 'Использовать параметры'
                          }
                          aria-label={
                            files.length > 1
                              ? `Использовать параметры: ${file.name}`
                              : 'Использовать параметры'
                          }
                          onClick={() => onUseParameters(file)}
                        >
                          <Settings size={16} aria-hidden="true" />
                        </button>
                      ))}
                    <button
                      className="button"
                      title={copied === key ? 'Текст скопирован' : 'Скопировать текст'}
                      aria-label={copied === key ? 'Текст скопирован' : 'Скопировать текст'}
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
                      {copied === key ? (
                        <Check size={16} aria-hidden="true" />
                      ) : (
                        <Copy size={16} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </article>
        );
      })}
      {conversation.status === 'LOADING' && !turns.some((turn) => !turn.reply) && (
        <div className="as-turn cw-turn">
          <PendingResult tools={progress.tools} />
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
          <MessageAction disabled={page === 0} onClick={() => setPage(page - 1)}>
            Новее
          </MessageAction>
          <MessageAction disabled={page + 1 >= messages.data.pages} onClick={() => setPage(page + 1)}>
            Раньше
          </MessageAction>
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
