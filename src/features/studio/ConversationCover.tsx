import type { ReactElement } from 'react';
import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { safeMediaUrl } from '../../lib/api';
import type { IConversationCardData } from './ConversationCard';
import { CardPreview } from '../../components/CardPreview';
import { connection } from './conversations';

export function ConversationCover({
  conversation,
  onOpen,
  isStatic = false,
}: {
  conversation: IConversationCardData;
  onOpen?: () => void;
  isStatic?: boolean;
}): ReactElement {
  const [failed, setFailed] = useState<string>();
  const image = conversation.preview?.image;
  const src = image?.status === 'READY' ? safeMediaUrl(image.url) : undefined;
  const pending = image?.status === 'PENDING' || image?.status === 'PROCESSING';
  const video =
    !!conversation.preview?.video ||
    conversation.tags?.includes('video') ||
    !!connection(conversation, 'video');
  const kind = video ? 'video' : conversation.options && connection(conversation, 'image') ? 'image' : 'chat';
  const content = (
    <CardPreview className={isStatic ? 'history-cover' : undefined} isVideo={!!video}>
      {src && failed !== src ? (
        <img src={src} alt={`Превью: ${conversation.name}`} loading="lazy" onError={() => setFailed(src)} />
      ) : (
        <>
          <div
            className="file-placeholder file-placeholder-document"
            role="img"
            aria-label={`Беседа: ${conversation.name}`}
          >
            <div className="file-placeholder-icon">
              <MessageCircle aria-hidden="true" strokeWidth={1.35} />
            </div>
            <span className="file-placeholder-label">Беседа</span>
          </div>
          {pending && (
            <span className="history-cover-status" role="status">
              Создаётся…
            </span>
          )}
        </>
      )}
    </CardPreview>
  );
  if (isStatic) return content;
  return onOpen ? (
    <button
      type="button"
      className="history-cover"
      onClick={onOpen}
      aria-label={`Открыть файл ${conversation.name}`}
      title="Открыть файл"
    >
      {content}
    </button>
  ) : (
    <Link
      className="history-cover"
      to={`/${kind}?conversation=${conversation.id}`}
      aria-label={`Открыть работу ${conversation.name}`}
    >
      {content}
    </Link>
  );
}
