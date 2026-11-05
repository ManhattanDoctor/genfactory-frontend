import { useState } from 'react';
import { File as FileIcon, FileImage, Play } from 'lucide-react';
import { safeMediaUrl } from '../../lib/api';
import type { IPaymentTransaction } from '../../lib/types';
import { MediaPreview } from '../../components/MediaPreview';

export function TransactionPreview({ transaction }: { transaction: IPaymentTransaction }) {
  const [opened, setOpened] = useState(false);
  const [failedImage, setFailedImage] = useState('');
  const files = (transaction.results || []).filter((file) => file.userId === transaction.userId);
  const file = files[0];
  if (!file) return null;
  const thumbnail =
    file.preview?.image?.status === 'READY'
      ? safeMediaUrl(file.preview.image.url)
      : file.type === 'IMAGE'
        ? safeMediaUrl(file.path)
        : undefined;
  return (
    <>
      <button
        className="transaction-preview"
        aria-label={`Открыть результат: ${file.name}`}
        onClick={() => setOpened(true)}
      >
        {thumbnail && failedImage !== thumbnail ? (
          <img src={thumbnail} alt="" loading="lazy" onError={() => setFailedImage(thumbnail)} />
        ) : ['IMAGE', 'VIDEO'].includes(file.type) ? (
          <FileImage size={22} />
        ) : (
          <FileIcon size={22} />
        )}
        {file.type === 'VIDEO' && <Play className="transaction-preview-play" size={16} fill="currentColor" />}
        {files.length > 1 && <span className="transaction-preview-count">+{files.length - 1}</span>}
      </button>
      {opened && <MediaPreview file={file} files={files} onClose={() => setOpened(false)} />}
    </>
  );
}
