import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileImage, Play, RefreshCw } from 'lucide-react';
import { api, safeMediaUrl } from '../../lib/api';
import type { IGnosisFile, IPaymentTransaction } from '../../lib/types';
import { MediaPreview } from '../../components/MediaPreview';

export function TransactionPreview({ transaction }: { transaction: IPaymentTransaction }) {
  const [opened, setOpened] = useState(false);
  const [failedImage, setFailedImage] = useState('');
  const source = transaction.details?.source;
  const conversationId = source?.type === 'CONVERSATION' ? Number(source.id) : undefined;
  const eligible = !!transaction.operationId && Number.isSafeInteger(conversationId) && conversationId! > 0;
  const result = useQuery({
    queryKey: ['transaction-results', transaction.userId, conversationId],
    enabled: eligible,
    staleTime: 60000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const files = new Map<number, IGnosisFile>();
      let page = 0,
        pages = 1;
      while (page < pages) {
        const response = await api.messages(conversationId!, page, signal);
        for (const message of response.items) {
          if (message.role !== 'ASSISTANT') continue;
          for (const file of message.files || []) {
            if (
              file.userId === transaction.userId &&
              file.origin?.kind === 'GENERATION' &&
              ['IMAGE', 'VIDEO'].includes(file.type)
            )
              files.set(file.id, file);
          }
        }
        pages = response.pages;
        page++;
      }
      return [...files.values()];
    },
  });
  if (!eligible) return null;
  const files = (result.data || []).filter((file) => file.origin?.operationId === transaction.operationId);
  const file = files[0];
  if (!file)
    return result.error ? (
      <button
        className="transaction-preview"
        aria-label="Повторить загрузку результата"
        onClick={() => void result.refetch()}
      >
        <RefreshCw size={18} />
      </button>
    ) : result.isPending ? (
      <div className="transaction-preview is-loading" aria-hidden="true" />
    ) : null;
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
        ) : (
          <FileImage size={22} />
        )}
        {file.type === 'VIDEO' && <Play className="transaction-preview-play" size={16} fill="currentColor" />}
        {files.length > 1 && <span className="transaction-preview-count">+{files.length - 1}</span>}
      </button>
      {opened && <MediaPreview file={file} files={files} onClose={() => setOpened(false)} />}
    </>
  );
}
