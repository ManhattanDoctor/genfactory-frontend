import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { canUseUpdateWorker, watchAppUpdate } from '../lib/app-update';
import { hasPendingWrites } from '../lib/api';
import type { IConversation, IPagination } from '../lib/types';

export function AppUpdateNotice() {
  const client = useQueryClient();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const updater = useRef<ReturnType<typeof watchAppUpdate> | undefined>(undefined);
  useEffect(() => {
    if (!canUseUpdateWorker(import.meta.env.PROD, location) || !('serviceWorker' in navigator)) return;
    const isBusy = () =>
      hasPendingWrites() ||
      client
        .getQueriesData<IPagination<IConversation>>({ queryKey: ['active-jobs'] })
        .some(([, data]) => data?.items?.some((item) => item.status === 'LOADING'));
    const synchronize = () => setBusy(isBusy());
    const unsubscribe = client.getQueryCache().subscribe(synchronize);
    window.addEventListener('genfactory:pending-writes', synchronize);
    synchronize();
    const reload = () => {
      if (isBusy()) {
        setBusy(true);
        return;
      }
      if (!window.dispatchEvent(new Event('genfactory:before-update', { cancelable: true }))) {
        setError('Не удалось сохранить черновик. Скопируйте текст перед обновлением.');
        return;
      }
      location.reload();
    };
    updater.current = watchAppUpdate(() => setAvailable(true), reload);
    return () => {
      unsubscribe();
      window.removeEventListener('genfactory:pending-writes', synchronize);
      updater.current?.dispose();
    };
  }, [client]);
  if (!available) return null;
  return (
    <aside className="update-notice" role="status" aria-label="Обновление приложения">
      <strong>Доступна новая версия</strong>
      <p className="small muted">
        {busy
          ? 'Обновление будет доступно после завершения текущей работы.'
          : 'Обновите страницу, когда будете готовы. Черновик будет сохранён.'}
      </p>
      {error && <p role="alert">{error}</p>}
      <button className="button primary" disabled={busy} onClick={() => updater.current?.apply()}>
        Обновить приложение
      </button>
    </aside>
  );
}
