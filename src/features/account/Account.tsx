import type { ReactElement } from 'react';
import './account.css';
import { BalanceHistory } from './BalanceHistory';
import { formatBalance, currencyLabel } from '../../lib/money';
import { useEffect, useState } from 'react';
import { Plus, UserRound, RefreshCw, LogOut } from 'lucide-react';
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
  const [topup, setTopup] = useState(false);
  const [amount, setAmount] = useState('500');
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
          <section className="account-card profile-card">
            <div className="profile-row">
              <div className="avatar">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <circle cx="12" cy="9" r="3.2" />
                  <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
                </svg>
              </div>
              <div>
                <h2>{auth.user.preferences?.name || 'Ваш аккаунт'}</h2>
                <p className="muted">{auth.user.preferences?.email || `Аккаунт № ${auth.user.id}`}</p>
              </div>
            </div>
            <p className="gf-hint">GF - единицы студии. Стоимость кадра и ролика видна до отправки.</p>
            <button className="button" onClick={() => setConfirmLogout(true)}>
              <LogOut size={16} /> Выйти из аккаунта
            </button>
          </section>
          <section className="account-card balance-card">
            <div className="balance-head">
              <div className="balance-label-row">
                <span className="wallet-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <rect x="3" y="6" width="18" height="13" rx="2" />
                    <path d="M3 10h18" />
                    <circle cx="16.5" cy="14.5" r="1.2" />
                  </svg>
                </span>
                <h2>Баланс</h2>
              </div>
              <button
                type="button"
                className="btn-plus"
                onClick={() => {
                  setAmount('500');
                  setTopup(true);
                }}
                aria-label="Пополнить баланс"
                data-tooltip="Пополнить баланс"
              >
                <Plus aria-hidden="true" />
              </button>
            </div>
            {Object.entries(auth.balances).length ? (
              Object.entries(auth.balances).map(([currency, amount]) => (
                <div className="balance-row" key={currency}>
                  <strong>{formatBalance(amount, currency)}</strong>
                  <span>{currencyLabel(currency)}</span>
                </div>
              ))
            ) : (
              <div className="balance-row">
                <strong>{formatBalance('0', 'RUB')}</strong>
                <span>{currencyLabel('RUB')}</span>
              </div>
            )}
            <p className="muted">Списания - только за успешные генерации. Пополнить можно кнопкой «+».</p>
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
      {topup && auth.user && (
        <Modal title="Пополнить баланс" className="account-topup" onClose={() => setTopup(false)}>
          <p className="topup-hint">
            Сумма зачислится на баланс после оплаты. Списания - только за успешные генерации.
          </p>
          <div className="amount-presets" role="group" aria-label="Быстрый выбор суммы">
            {[500, 1000, 3000, 5000].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={String(value) === amount}
                onClick={() => setAmount(String(value))}
              >
                {value.toLocaleString('ru-RU')} GF
              </button>
            ))}
          </div>
          <label className="topup-field">
            <span>Сумма, GF</span>
            <input
              type="number"
              min="100"
              inputMode="numeric"
              step="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <ModalFooter>
            <button className="button" onClick={() => setTopup(false)}>
              Отмена
            </button>
            <button className="button primary" data-tooltip="Онлайн-пополнение пока недоступно" disabled>
              Оплатить через ЮKassa
            </button>
          </ModalFooter>
        </Modal>
      )}
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
