import type { ReactElement } from 'react';
import { useState } from 'react';
import { MessageSquare, Play, Plus } from 'lucide-react';
import type { IPaymentTransaction } from '../../lib/types';
import { direction } from './transactions';
import { Media, MediaPreview } from '../../components/MediaPreview';

export function TransactionPreview({
  transaction,
}: {
  transaction: IPaymentTransaction;
}): ReactElement | null {
  const [opened, setOpened] = useState(false);
  const files = (transaction.results || []).filter((file) => file.userId === transaction.userId);
  const file = files[0];
  if (!file) {
    const Icon = direction(transaction) === 'income' ? Plus : MessageSquare;
    return (
      <span className="transaction-icon" aria-hidden="true">
        <Icon size={20} strokeWidth={1.7} />
      </span>
    );
  }
  return (
    <>
      <button
        className="transaction-preview"
        aria-label={`Открыть результат: ${file.name}`}
        title={`Открыть результат: ${file.name}`}
        onClick={() => setOpened(true)}
      >
        <Media file={file} isPlaybackDisabled />
        {file.type === 'VIDEO' && <Play className="transaction-preview-play" size={16} fill="currentColor" />}
        {files.length > 1 && <span className="transaction-preview-count">+{files.length - 1}</span>}
      </button>
      {opened && <MediaPreview file={file} files={files} onClose={() => setOpened(false)} />}
    </>
  );
}
