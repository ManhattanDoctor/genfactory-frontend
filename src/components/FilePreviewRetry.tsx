import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../features/auth/AuthProvider';
import { scheduleRefresh } from '../features/realtime/queryRefresh';
import { api, getSession } from '../lib/api';
import type { IGnosisFile } from '../lib/types';

export function FilePreviewRetry({
  file,
  onNotice,
}: {
  file: IGnosisFile;
  onNotice: (message: string) => void;
}): ReactElement | null {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  if (user?.id !== file.userId) return null;
  async function retry(): Promise<void> {
    const sid = getSession();
    if (!sid || lock.current) return;
    lock.current = true;
    setBusy(true);
    onNotice('');
    try {
      const preview = await api.createPreview(file.id);
      if (!alive.current || getSession() !== sid) return;
      cache.setQueryData(['file-preview', file.userId, file.id], { ...file, preview });
      scheduleRefresh(cache, file.userId, sid, ['files']);
    } catch {
      if (alive.current && getSession() === sid)
        onNotice('Не удалось запустить создание превью. Попробуйте ещё раз.');
    } finally {
      lock.current = false;
      if (alive.current && getSession() === sid) setBusy(false);
    }
  }
  return (
    <button
      type="button"
      className="text-button"
      disabled={busy}
      aria-busy={busy}
      onClick={() => void retry()}
    >
      {busy ? 'Запускаем…' : 'Повторить создание превью'}
    </button>
  );
}
