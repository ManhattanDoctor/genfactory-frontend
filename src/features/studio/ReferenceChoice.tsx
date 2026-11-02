import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Conversation, GnosisFile } from '../../lib/types';
import { Modal } from '../../components/Modal';
import { Media } from '../../components/MediaPreview';

export function ReferenceChoice({
  conversation,
  canUse,
  onUse,
  onFresh,
  onOther,
  onClose,
}: {
  conversation: Conversation;
  canUse: boolean;
  onUse: (file: GnosisFile) => void;
  onFresh: () => void;
  onOther: () => void;
  onClose: () => void;
}) {
  const results = useQuery({
    queryKey: ['reference-choice', conversation.userId, conversation.id, conversation.lastMessageDate],
    queryFn: async ({ signal }) => {
      // The last image may be behind pages of text or video results.
      for (let page = 0; ; page++) {
        const messages = await api.messages(conversation.id, page, signal);
        for (const message of messages.items) {
          if (message.role !== 'ASSISTANT') continue;
          const images = (message.files || []).filter(
            (f) => f.type === 'IMAGE' && f.userId === conversation.userId,
          );
          if (images.length) return images;
        }
        if (page + 1 >= messages.pages || !messages.items.length) return [];
      }
    },
    staleTime: 0,
  });
  return (
    <Modal title="Использовать предыдущий результат?" onClose={onClose}>
      <div className="reference-choice">
        <p>
          Выберите исходное изображение или создайте новый результат с нуля. После выбора проверьте запрос и
          нажмите кнопку создания.
        </p>
        {results.isPending && <p role="status">Ищем последнее изображение в беседе…</p>}
        {results.error && (
          <div role="alert">
            <p>Не удалось загрузить предыдущий результат.</p>
            <button className="button" onClick={() => void results.refetch()}>
              Повторить загрузку
            </button>
          </div>
        )}
        {results.data?.length === 0 && (
          <p>В этой беседе пока нет готовых изображений. Можно выбрать изображение из библиотеки.</p>
        )}
        <div className="reference-choice-images">
          {results.data?.map((file) => (
            <div className="reference-choice-image" key={file.id}>
              <Media file={file} />
              <span>{file.name}</span>
              <button className="button" disabled={!canUse} onClick={() => onUse(file)}>
                Использовать
              </button>
            </div>
          ))}
        </div>
        {!canUse && (
          <p className="small muted">
            Выбранная модель не поддерживает референсы. Закройте окно и выберите модель с поддержкой
            изображений.
          </p>
        )}
        <div className="workspace-actions">
          <button className="button" disabled={!canUse} onClick={onOther}>
            Выбрать другой
          </button>
          <button className="button" onClick={onFresh}>
            Создать с нуля
          </button>
        </div>
        <p className="small muted">Выбор не запускает генерацию и не списывает баланс.</p>
      </div>
    </Modal>
  );
}
