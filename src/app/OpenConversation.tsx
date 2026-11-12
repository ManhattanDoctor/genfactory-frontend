import { Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { conversationUrl } from '../lib/conversationUrl';
import { useAuth } from '../features/auth/AuthProvider';

export function OpenConversation() {
  const { user, loading, signIn } = useAuth();
  const [params] = useSearchParams();
  const raw = params.get('conversation') || '';
  const id = /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : undefined;
  const result = useQuery({
    queryKey: ['conversation', user?.id, id],
    enabled: !!user && !!id,
    retry: false,
    queryFn: ({ signal }) => api.conversation(id!, signal),
  });
  if (!id)
    return (
      <p className="page-content" role="alert">
        Некорректный адрес беседы.
      </p>
    );
  if (user && result.data) return <Navigate to={conversationUrl(result.data)} replace />;
  return (
    <div className="page-content">
      {loading || (user && result.isPending) ? (
        <p role="status">Открываем беседу…</p>
      ) : !user ? (
        <button className="button" onClick={() => void signIn()}>
          Войти
        </button>
      ) : (
        <div role="alert">
          <p>{result.error?.message || 'Беседа недоступна.'}</p>
          <button className="button" onClick={() => void result.refetch()}>
            Повторить
          </button>
        </div>
      )}
    </div>
  );
}
