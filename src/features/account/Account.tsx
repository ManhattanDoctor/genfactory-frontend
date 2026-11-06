import './account.css';
import { BalanceHistory } from './BalanceHistory';
import { formatBalance } from '../../lib/money';
import { useState } from 'react';
import { Wallet, UserRound, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../../components/Modal';
export function Account() {
  const auth = useAuth();
  const [error, setError] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);
  return (
    <div className="page-content page-enter account-page">
      {auth.error && (
        <div className="account-card" role="alert">
          <p>Не удалось загрузить данные аккаунта.</p>
          <button className="button" onClick={auth.refresh} disabled={auth.loading}>
            <RefreshCw size={16} /> Повторить
          </button>
        </div>
      )}
      {auth.user ? (
        <div className="account-grid">
          <section className="account-card">
            <UserRound size={24} />
            <h2>{auth.user.preferences?.name || 'Ваш аккаунт'}</h2>
            <p className="muted">{auth.user.preferences?.email || `Аккаунт № ${auth.user.id}`}</p>
            <button className="button" onClick={() => setConfirmLogout(true)}>
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
            <p className="muted">Онлайн-пополнение пока недоступно.</p>
            <button className="button" onClick={auth.refresh}>
              <RefreshCw size={16} /> Обновить баланс
            </button>
          </section>
        </div>
      ) : (
        <div className="empty-state">
          <UserRound size={36} />
          <button className="button primary" onClick={() => void auth.signIn()}>
            Войти
          </button>
        </div>
      )}
      <BalanceHistory />
      {confirmLogout && auth.user && (
        <Modal title="Выйти из аккаунта?" onClose={() => setConfirmLogout(false)}>
          <div className="modal-actions">
            <button className="button" onClick={() => setConfirmLogout(false)}>
              Отмена
            </button>
            <button
              className="button primary"
              onClick={() => {
                setConfirmLogout(false);
                void auth
                  .signOut()
                  .catch(() =>
                    setError(
                      'Вы вышли из студии, но завершить единый вход не удалось. Сервер временно недоступен.',
                    ),
                  );
              }}
            >
              Выйти
            </button>
          </div>
        </Modal>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
