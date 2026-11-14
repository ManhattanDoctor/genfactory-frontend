import { VariantsPanel } from './VariantsPanel';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { IConversation, IGnosisFile, MediaKind } from '../../lib/types';
import { useConversationProgress } from './useConversationProgress';
import { useConversationError } from './useConversationError';
import { toolLabel } from './progress';
import { displayMessageText } from './conversations';
import { MessageContent } from '../../components/MessageContent';
import { Media, MediaPreview } from '../../components/MediaPreview';
export function ConversationResults({
  conversation,
  latestRequest,
  onUse,
  onUseText,
}: {
  conversation: IConversation;
  latestRequest: number;
  onUse: (file: IGnosisFile, kind: MediaKind) => void;
  onUseText?: (text: string, kind: MediaKind, files: IGnosisFile[]) => void;
}) {
  const navigate = useNavigate();
  const progress = useConversationProgress(conversation);
  const error = useConversationError(conversation);
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (latestRequest) setPage(0);
  }, [latestRequest]);
  const [copyNotice, setCopyNotice] = useState('');
  const [preview, setPreview] = useState<IGnosisFile>();
  const messages = useQuery({
    queryKey: ['messages', conversation.userId, conversation.id, page],
    queryFn: ({ signal }) => api.messages(conversation.id, page, signal),
  });
  return (
    <>
      {conversation.status === 'LOADING' && (
        <div className="conversation-progress" role="status" aria-live="polite">
          <p className="conversation-status">
            <span className="spinner" /> Ассистент работает. Результат появится в этой беседе.
          </p>
          {!!progress.tools.length && (
            <ul>
              {progress.tools.map((tool, index) => (
                <li key={`${tool.uid}:${index}`} className={tool.status === 'ERRORED' ? 'error' : undefined}>
                  {toolLabel(tool)}
                </li>
              ))}
            </ul>
          )}
          {progress.unavailable && (
            <p className="small muted">
              Ход работы временно недоступен. Сообщения продолжают обновляться; повторять запрос не нужно.
            </p>
          )}
        </div>
      )}
      {conversation.status === 'ERROR' && (
        <p className="inline-error" role="status">
          {error ||
            'Выполнение завершилось с ошибкой. Проверьте сообщения и библиотеку перед новым запуском.'}
        </p>
      )}
      {messages.isPending && <p className="muted">Загружаем сообщения…</p>}
      {messages.error && (
        <p className="error" role="alert">
          Не удалось обновить сообщения.{' '}
          <button className="text-button" onClick={() => void messages.refetch()}>
            Обновить
          </button>
        </p>
      )}
      {messages.data && !messages.data.items.length && <p className="muted">В беседе пока нет сообщений.</p>}
      {copyNotice && (
        <p role="status" className="small muted">
          {copyNotice}
        </p>
      )}
      <VariantsPanel
        conversation={conversation}
        messages={[...(messages.data?.items || [])].reverse()}
        onPreview={setPreview}
      />
      {[...(messages.data?.items || [])].reverse().map((message, index, chronological) => (
        <article className="generation-card" key={message.id}>
          <header>
            <strong>
              {message.role === 'USER'
                ? 'Вы'
                : message.role === 'ASSISTANT'
                  ? 'Ассистент'
                  : 'Системное сообщение'}
            </strong>
            <time className="small muted">{new Date(message.createdDate).toLocaleString('ru-RU')}</time>
          </header>
          {message.text &&
            (message.role === 'USER' ? (
              <p className="conversation-text">{displayMessageText(message.text)}</p>
            ) : (
              <MessageContent text={message.text} files={message.files} onOpen={setPreview} />
            ))}
          {message.text && (
            <div className="workspace-actions message-actions">
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(displayMessageText(message.text!));
                    setCopyNotice('Текст скопирован.');
                  } catch {
                    setCopyNotice('Не удалось скопировать. Выделите текст сообщения вручную.');
                  }
                }}
              >
                Копировать текст
              </button>
              {message.role === 'ASSISTANT' && (
                <button
                  className="text-button"
                  onClick={() =>
                    navigate('/audio', { state: { prompt: message.text, userId: conversation.userId } })
                  }
                >
                  Озвучить
                </button>
              )}
              {onUseText && (
                <>
                  {(['image', 'video'] as const).map((kind) => (
                    <button
                      className="text-button"
                      key={kind}
                      onClick={() =>
                        onUseText(
                          displayMessageText(message.text!),
                          kind,
                          message.files?.filter((f) => f.type === 'IMAGE').length
                            ? message.files.filter((f) => f.type === 'IMAGE')
                            : [...chronological.slice(0, index)]
                                .reverse()
                                .find((m) => m.role === 'USER')
                                ?.files?.filter((f) => f.type === 'IMAGE') || [],
                        )
                      }
                    >
                      {kind === 'image' ? 'В задачу изображения' : 'В задачу видео'}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
          {!!message.files?.length && (
            <div className="result-grid">
              {message.files.map((file) => (
                <div key={file.id}>
                  <button
                    className="result-image"
                    onClick={() => setPreview(file)}
                    aria-label={`Открыть ${file.name}`}
                  >
                    <Media file={file} />
                  </button>
                  {file.type === 'IMAGE' && (
                    <div className="conversation-file-actions">
                      <button className="text-button" onClick={() => onUse(file, 'image')}>
                        Изменить
                      </button>
                      <button className="text-button" onClick={() => onUse(file, 'video')}>
                        Оживить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>
      ))}
      {messages.data && messages.data.pages > 1 && (
        <div className="pagination">
          <button className="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Новее
          </button>
          <span>
            {page + 1} / {messages.data.pages}
          </span>
          <button
            className="button"
            disabled={page + 1 >= messages.data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Ранее
          </button>
        </div>
      )}
      {preview && (
        <MediaPreview
          file={preview}
          files={messages.data?.items.flatMap((m) => m.files || [])}
          onClose={() => setPreview(undefined)}
          onUse={(f) => {
            setPreview(undefined);
            onUse(f, 'image');
          }}
          onAnimate={(f) => {
            setPreview(undefined);
            onUse(f, 'video');
          }}
          onAnalyze={(f) => navigate('/prompt', { state: { reference: f, userId: conversation.userId } })}
        />
      )}
    </>
  );
}
