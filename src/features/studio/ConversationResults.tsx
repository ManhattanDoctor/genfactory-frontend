import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Conversation, GnosisFile, MediaKind } from '../../lib/types';
import { displayMessageText } from './conversations';
import { Media, MediaPreview } from '../../components/MediaPreview';
export function ConversationResults({
  conversation,
  onUse,
}: {
  conversation: Conversation;
  onUse: (file: GnosisFile, kind: MediaKind) => void;
}) {
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<GnosisFile>();
  const messages = useQuery({
    queryKey: ['messages', conversation.userId, conversation.id, page],
    queryFn: ({ signal }) => api.messages(conversation.id, page, signal),
    refetchInterval: 3000,
  });
  return (
    <>
      <div className="output-heading">
        <h2>{conversation.name}</h2>
        <span className="small muted">Беседа #{conversation.id}</span>
      </div>
      {conversation.status === 'LOADING' && (
        <p className="conversation-status" role="status">
          <span className="spinner" /> Ассистент работает. Результат появится в этой беседе.
        </p>
      )}
      {conversation.status === 'ERROR' && (
        <p className="inline-error" role="status">
          Выполнение завершилось с ошибкой. Проверьте сообщения и библиотеку перед новым запуском.
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
      {[...(messages.data?.items || [])].reverse().map((message) => (
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
          {message.text && (
            <p className="conversation-text">
              {message.role === 'USER' ? displayMessageText(message.text) : message.text}
            </p>
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
                        Изменить изображение
                      </button>
                      <button className="text-button" onClick={() => onUse(file, 'video')}>
                        Создать видео из изображения
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
      {preview && <MediaPreview file={preview} onClose={() => setPreview(undefined)} />}
    </>
  );
}
