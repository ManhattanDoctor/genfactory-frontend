import { useState } from 'react';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { Modal } from './Modal';
import { useAuth } from '../features/auth/AuthProvider';
export function LoginDialog({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const login = async () => {
    setBusy(true);
    try {
      await auth.signIn();
    } catch {
      setError('Не удалось открыть вход. Проверьте подключение и попробуйте снова.');
      setBusy(false);
    }
  };
  return (
    <Modal title="Ваша следующая идея начинается здесь" onClose={onClose}>
      <p className="muted">Войдите с аккаунтом gnosis. Ваш баланс и библиотека уже будут под рукой.</p>
      <button className="button primary full" disabled={busy} onClick={() => void login()}>
        Войти в аккаунт <ArrowUpRight size={18} />
      </button>
      <p className="small muted login-note">
        <ShieldCheck size={16} /> Единый аккаунт. Без новой регистрации, если вы уже с нами.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {import.meta.env.DEV && (
        <details className="dev-login">
          <summary>Локальная разработка: токен gnosis</summary>
          <label>
            Токен текущей сессии
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button
            className="button"
            disabled={!token.trim()}
            onClick={() => {
              auth.acceptSession(token.trim());
              onClose();
            }}
          >
            Подключиться
          </button>
        </details>
      )}
    </Modal>
  );
}
