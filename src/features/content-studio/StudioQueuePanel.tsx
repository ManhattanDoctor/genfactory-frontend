import { useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import type { ConversationQueue } from './ConversationQueue';

export function StudioQueuePanel({ queue }: { queue: ConversationQueue }) {
  const { waiting, sending, pause } = useSyncExternalStore(queue.subscribe, queue.snapshot);
  if (!pause && !waiting.length) return null;
  return (
    <section className="cw-queue" aria-label="Очередь запросов">
      {waiting.length > 0 && (
        <>
          <strong>В очереди · {waiting.length}</strong>
          <ol className="cw-queue-list">
            {waiting.map((item, index) => (
              <li className="cw-queue-row" key={item.id}>
                <span className="cw-queue-position" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="cw-queue-title" title={item.title}>
                  {item.title}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Убрать из очереди: ${item.title}`}
                  onClick={() => queue.remove(item.id)}
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
      {pause && (
        <>
          <p role="status">
            {pause} {sending && sending.title}
          </p>
          {sending && (
            <button type="button" className="button" onClick={() => void queue.checkHistory()}>
              Сверить с историей
            </button>
          )}
          <button type="button" className="button" onClick={() => queue.resume()}>
            {sending ? 'Пропустить запрос' : waiting.length ? 'Продолжить очередь' : 'Закрыть'}
          </button>
        </>
      )}
    </section>
  );
}
