import { useAuth } from './AuthProvider';

export function SignInRequired({ title }: { title: string }) {
  const { loading, error, refresh, signIn, signingIn } = useAuth();
  return (
    <div className="empty-state page-enter">
      <h1 className="sr-only">{title}</h1>
      {loading ? (
        <p role="status">Загрузка…</p>
      ) : error ? (
        <>
          <p role="alert">Не удалось загрузить данные аккаунта.</p>
          <button type="button" className="button" onClick={() => void refresh()}>
            Повторить
          </button>
        </>
      ) : (
        <>
          <p>Войдите, чтобы открыть этот раздел.</p>
          <button type="button" className="button primary" onClick={() => void signIn()} disabled={signingIn}>
            Войти в аккаунт
          </button>
        </>
      )}
    </div>
  );
}
