import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { getSession, api } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import type { IGnosisFile } from '../../lib/types';
export interface IDraftRecord<T> {
  version: 1;
  at: string;
  value: T;
}
function read<T>(key: string): IDraftRecord<T> | undefined {
  try {
    const data = JSON.parse(localStorage.getItem(key) || 'null');
    if (data?.version === 1 && typeof data.at === 'string' && data.value && typeof data.value === 'object')
      return data;
  } catch {
    /* Corrupted or unavailable local storage must not block the editor. */
  }
}
export function useDraft<T extends object>(
  scope: string,
  value: T,
  meaningful: boolean,
): { available: IDraftRecord<T> | undefined; status: string; changed: () => void; clear: () => void } {
  const auth = useAuth();
  const key = `genfactory.draft.v1.${auth.user?.id ?? 'guest'}.${scope}`;
  const [entry, setEntry] = useState(() => ({ key, available: auth.user ? read<T>(key) : undefined }));
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const context = useRef({ key, value, meaningful, dirty: false, sid: auth.session, userId: auth.user?.id });
  if (context.current.key !== key) {
    context.current = { key, value, meaningful, dirty: false, sid: auth.session, userId: auth.user?.id };
  } else {
    context.current.value = value;
    context.current.meaningful = meaningful;
  }
  const current = context.current;
  if (entry.key !== key) {
    setEntry({ key, available: auth.user ? read<T>(key) : undefined });
    setStatus('');
  }
  const serialize = JSON.stringify(value);
  const save = (ctx: typeof current) => {
    if (!ctx.dirty) return true;
    if (!ctx.userId || getSession() !== ctx.sid) return !ctx.meaningful;
    try {
      if (ctx.meaningful)
        localStorage.setItem(
          ctx.key,
          JSON.stringify({ version: 1, at: new Date().toISOString(), value: ctx.value }),
        );
      else localStorage.removeItem(ctx.key);
      if (context.current === ctx)
        setStatus(ctx.meaningful ? 'Черновик сохранён в этом браузере.' : 'Черновик очищен.');
      return true;
    } catch {
      if (context.current === ctx)
        setStatus(
          'Не удалось сохранить черновик в браузере. Не закрывайте страницу, пока не скопируете текст.',
        );
      return false;
    }
  };
  useEffect(() => {
    if (!current.dirty) return;
    const timer = setTimeout(() => save(current), 200);
    return () => clearTimeout(timer);
  }, [key, serialize, revision]);
  useEffect(() => {
    const flush = () => save(current);
    const beforeUpdate = (event: Event) => {
      if (!save(current)) event.preventDefault();
    };
    window.addEventListener('genfactory:before-update', beforeUpdate);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('genfactory:before-update', beforeUpdate);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      save(current);
    };
  }, [key]);
  return {
    available: entry.key === key ? entry.available : undefined,
    status,
    changed: () => {
      current.dirty = true;
      setEntry({ key, available: undefined });
      setRevision((n) => n + 1);
    },
    clear: () => {
      current.dirty = false;
      try {
        localStorage.removeItem(key);
        setEntry({ key, available: undefined });
        setStatus('');
      } catch {
        setStatus('Не удалось удалить сохранённый черновик.');
      }
    },
  };
}
export function DraftBar<T>({
  draft,
  onRestore,
  busy = false,
}: {
  draft: { available?: IDraftRecord<T>; status: string; clear: () => void };
  onRestore: (value: T) => void;
  busy?: boolean;
}): ReactElement {
  return (
    <div className="draft-bar" role="status">
      {draft.available ? (
        <>
          <span>Есть черновик от {new Date(draft.available.at).toLocaleString('ru-RU')}.</span>
          <button className="text-button" disabled={busy} onClick={() => onRestore(draft.available!.value)}>
            Восстановить черновик
          </button>
          <button className="text-button" disabled={busy} onClick={draft.clear}>
            Удалить черновик
          </button>
        </>
      ) : (
        <span>{draft.status || 'Черновики сохраняются в этом браузере после редактирования.'}</span>
      )}
    </div>
  );
}
export async function restoreDraftFiles(
  values: unknown,
  userId: number,
  sid: string,
  limit = 4,
): Promise<{ files: IGnosisFile[]; missing: number }> {
  if (!Array.isArray(values)) return { files: [] as IGnosisFile[], missing: 0 };
  const ids = [
    ...new Set(
      values
        .filter((f) => f && f.userId === userId && Number.isSafeInteger(f.id) && f.id > 0)
        .map((f) => f.id as number),
    ),
  ].slice(0, limit);
  const results = await Promise.allSettled(ids.map((id) => api.file(id, sid)));
  const files = results.flatMap((r) =>
    r.status === 'fulfilled' && r.value?.userId === userId ? [r.value] : [],
  );
  return { files, missing: ids.length - files.length };
}
