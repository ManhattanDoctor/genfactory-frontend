import { useState } from 'react';
import { ImageOff, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { safeMediaUrl } from '../../lib/api';
import type { IConversation } from '../../lib/types';
import { connection } from './conversations';

export function ConversationCover({
  conversation,
  onOpen,
  isStatic = false,
}: {
  conversation: IConversation;
  onOpen?: () => void;
  isStatic?: boolean;
}) {
  const [failed, setFailed] = useState<string>();
  const image = conversation.preview?.image;
  const src = image?.status === 'READY' ? safeMediaUrl(image.url) : undefined;
  const pending = image?.status === 'PENDING' || image?.status === 'PROCESSING';
  const video = !!conversation.preview?.video;
  const kind = video ? 'video' : connection(conversation, 'image') ? 'image' : 'chat';
  const content = (
    <>
      {src && failed !== src ? (
        <img src={src} alt={`Превью: ${conversation.name}`} loading="lazy" onError={() => setFailed(src)} />
      ) : (
        <span className="history-cover-placeholder">
          <ImageOff size={22} />
          <span>
            {pending
              ? 'Создаётся…'
              : image?.status === 'FAILED' || (!!src && failed === src)
                ? 'Недоступно'
                : 'Без превью'}
          </span>
        </span>
      )}
      {video && src && failed !== src && <Play className="history-cover-play" size={20} aria-hidden="true" />}
    </>
  );
  if (isStatic) return <div className="history-cover">{content}</div>;
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
