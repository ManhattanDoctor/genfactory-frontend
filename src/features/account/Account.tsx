import { BalanceHistory } from './BalanceHistory';
import { formatBalance } from '../../lib/money';
import { useState } from 'react';
import { Wallet, UserRound, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { LoginDialog } from '../../components/LoginDialog';
export function Account() {
  const auth = useAuth();
  const [login, setLogin] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="page-content page-enter">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">ВАШЕ ПРОСТРАНСТВО</span>
          <h1>Аккаунт</h1>
          <p>Единый профиль и баланс gnosis.</p>
        </div>
      </div>
      {auth.user ? (
        <div className="account-grid">
          <section className="account-card">
            <UserRound size={24} />
            <h2>{auth.user.preferences?.name || 'Ваш аккаунт'}</h2>
            <p className="muted">{auth.user.preferences?.email || `Аккаунт № ${auth.user.id}`}</p>
            <button
              className="button"
              onClick={() => {
                void auth
                  .signOut()
                  .catch(() =>
                    setError(
                      'Вы вышли из студии, но завершить единый вход не удалось. Сервер временно недоступен.',
                    ),
                  );
              }}
            >
              <LogOut size={16} /> Выйти из студии
            </button>
          </section>
          <section className="account-card">
            <Wallet size={24} />
            <h2>Баланс</h2>
            {Object.entries(auth.balances).length ? (
              Object.entries(auth.balances).map(([currency, amount]) => (
                <div className="balance-row" key={currency}>
                  <strong>{formatBalance(amount, currency)}</strong>
                  <span>{currency}</span>
                </div>
              ))
            ) : (
              <p>Нет доступных балансов</p>
            )}
            <p className="muted">
              Генерации оплачиваются с этого баланса. Онлайн-пополнение в новой студии пока не подключено.
            </p>
            <button className="button" onClick={auth.refresh}>
              <RefreshCw size={16} /> Обновить баланс
            </button>
          </section>
        </div>
      ) : (
        <div className="empty-state">
          <UserRound size={36} />
          <h2>Один аккаунт для всех идей</h2>
          <p>Используйте существующий аккаунт gnosis.</p>
          <button className="button primary" onClick={() => setLogin(true)}>
            Войти
          </button>
        </div>
      )}
      <BalanceHistory />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {login && <LoginDialog onClose={() => setLogin(false)} />}
    </div>
  );
}
