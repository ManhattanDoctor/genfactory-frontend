import type { ReactElement } from 'react';
import {
  Download,
  Pencil,
  Archive,
  ArchiveRestore,
  MessageCircle,
  AudioLines,
  MoreHorizontal,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { IConversation } from '../../lib/types';
import { connection } from './conversations';

/** The same action menu in History and Artifacts. */
export function ConversationActions({
  conversation: c,
  busy = false,
  onDownload,
  onRename,
  onArchive,
}: {
  conversation: Pick<IConversation, 'id' | 'name' | 'status' | 'isArchived' | 'tags'> &
    Partial<Pick<IConversation, 'options'>>;
  busy?: boolean;
  onDownload: () => void;
  onRename: () => void;
  onArchive: () => void;
}): ReactElement {
  return (
    <details
      className="history-actions"
      name="history-card-actions"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}
    >
      <summary aria-label={`Действия работы ${c.name}`} title="Действия работы">
        <MoreHorizontal size={18} />
      </summary>
      <div
        className="history-menu"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button, a'))
            event.currentTarget.closest('details')?.removeAttribute('open');
        }}
      >
        {c.options?.tools?.some((t) => ['TTS', 'STT'].includes(typeof t === 'string' ? t : t.uid)) && (
          <Link
            className="button"
            aria-label="Аудиостудия"
            title="Продолжить работу с аудио"
            to={`/audio?mode=${c.tags?.includes('stt') ? 'stt' : 'tts'}&conversation=${c.id}`}
          >
            <AudioLines size={16} aria-hidden="true" />
            Аудиостудия
          </Link>
        )}
        {!c.tags?.includes('content-studio') && !connection(c, 'image') && !connection(c, 'video') && (
          <Link className="button" aria-label="Открыть беседу" to={`/open?conversation=${c.id}`}>
            <MessageCircle size={16} aria-hidden="true" />
            Беседа
          </Link>
        )}
        {c.tags?.includes('content-studio') && (
          <Link className="button" aria-label="Обсудить работу" to={`/chat?conversation=${c.id}`}>
            <MessageCircle size={16} aria-hidden="true" />
            Беседа
          </Link>
        )}
        <button type="button" className="history-icon-button" disabled={busy} onClick={onDownload}>
          <Download size={16} />
          Скачать
        </button>
        <button
          className="history-icon-button"
          aria-label="Переименовать"
          title="Переименовать"
          disabled={busy || c.status === 'LOADING'}
          onClick={onRename}
        >
          <Pencil size={16} />
          Переименовать
        </button>
        <button
          className="history-icon-button"
          aria-label={!!c.isArchived ? 'Вернуть из архива' : 'В архив'}
          title={!!c.isArchived ? 'Вернуть из архива' : 'В архив'}
          disabled={busy}
          onClick={onArchive}
        >
          {!!c.isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          {!!c.isArchived ? 'Вернуть из архива' : 'В архив'}
        </button>
      </div>
    </details>
  );
}
