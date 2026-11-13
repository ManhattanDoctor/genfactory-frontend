import type { ReactElement } from 'react';
import './account.css';
import { BalanceHistory } from './BalanceHistory';
import { formatBalance, currencyLabel } from '../../lib/money';
import { useEffect, useState } from 'react';
import { Wallet, UserRound, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Modal, ModalFooter } from '../../components/Modal';
export function Account(): ReactElement {
  const auth = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!refreshed) return;
    const timer = setTimeout(() => setRefreshed(''), 4000);
    return () => clearTimeout(timer);
  }, [refreshed]);
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
                  <span>{currencyLabel(currency)}</span>
                </div>
              ))
            ) : (
              <p>Нет доступных балансов</p>
            )}
            <p className="muted">Онлайн-пополнение пока недоступно.</p>
            <button
              className="button"
              disabled={refreshing}
              aria-busy={refreshing}
              onClick={async () => {
                setRefreshing(true);
                setRefreshed('');
                try {
                  setRefreshed((await auth.refresh()) ? 'Баланс обновлён' : 'Не удалось обновить баланс');
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              <RefreshCw size={16} className={refreshing ? 'spin' : undefined} />{' '}
              {refreshing ? 'Обновляем…' : 'Обновить баланс'}
            </button>
            {refreshed && (
              <div className="account-refresh-notice" role="status">
                <span>{refreshed}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Закрыть уведомление"
                  onClick={() => setRefreshed('')}
                >
                  ×
                </button>
              </div>
            )}
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
          <ModalFooter className="modal-actions">
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
          </ModalFooter>
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
