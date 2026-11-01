import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from './AuthProvider';
export function AuthCallback() {
  const [error, setError] = useState('');
  const started = useRef(false);
  const auth = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const params = new URLSearchParams(location.search);
        const stored = JSON.parse(sessionStorage.getItem('genfactory.oauth') || 'null');
        sessionStorage.removeItem('genfactory.oauth');
        history.replaceState(null, '', '/auth/callback');
        if (!stored || params.get('state') !== stored.state || Date.now() - stored.createdAt > 10 * 60_000)
          throw new Error('Сессия входа истекла. Начните вход заново.');
        if (params.has('error') || !params.get('code'))
          throw new Error('Вход не завершён. Попробуйте ещё раз.');
        const result = await api.login(params.get('code')!, stored.redirectUri);
        auth.acceptSession(result.sid);
        if (result.idToken) sessionStorage.setItem('genfactory.idToken', result.idToken);
        navigate('/image', { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось войти');
      }
    })();
  }, [auth, navigate]);
  return (
    <div className="empty-state">
      <h1>{error ? 'Не удалось войти' : 'Открываем вашу студию'}</h1>
      <p>{error || 'Проверяем аккаунт…'}</p>
      {error && (
        <Link to="/" className="button primary">
          На главную
        </Link>
      )}
    </div>
  );
}
