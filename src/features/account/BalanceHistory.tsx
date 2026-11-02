import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { SelectControl } from '../../components/SelectControl';
import { breakdown, conversationLink, direction, transactionAmount, transactionTitle } from './transactions';
export function BalanceHistory() {
  const { user } = useAuth();
  return user ? <History key={user.id} userId={user.id} /> : null;
}
function History({ userId }: { userId: number }) {
  const auth = useAuth();
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState('all');
  const [currency, setCurrency] = useState('');
  const [since, setSince] = useState('');
  const [period, setPeriod] = useState('all');
  const query = useQuery({
    queryKey: ['transactions', userId, page, kind, currency, since],
    queryFn: async ({ signal }) => {
      const data = await api.transactions(userId, page, { direction: kind, currency, since }, signal);
      if (data.items.some((t) => t.userId !== userId || direction(t) === 'other'))
        throw new Error('Сервер вернул операции другого счёта. История не отображена.');
      return data;
    },
    retry: 1,
  });
  useEffect(() => {
    const refresh = () => void query.refetch();
    window.addEventListener('genfactory:generation-finished', refresh);
    return () => window.removeEventListener('genfactory:generation-finished', refresh);
  }, [userId, page, kind, currency, since]);
  return (
    <section id="balance-history" className="balance-history account-card">
      <div className="history-heading">
        <div>
          <h2>История баланса</h2>
          <p className="muted">Операции личного баланса gnosis, включая работу в других клиентах.</p>
        </div>
        <button
          className="button"
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
            auth.refresh();
          }}
        >
          Обновить историю
        </button>
      </div>
      <div className="transaction-filters">
        <label className="setting-field">
          <span>Операции</span>
          <SelectControl
            aria-label="Операции"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">Все операции</option>
            <option value="expense">Списания</option>
            <option value="income">Зачисления</option>
          </SelectControl>
        </label>
        <label className="setting-field">
          <span>Валюта</span>
          <SelectControl
            aria-label="Валюта"
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Все валюты</option>
            {[...new Set(['RUB', 'USD', ...Object.keys(auth.balances)])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectControl>
        </label>
        <label className="setting-field">
          <span>Период</span>
          <SelectControl
            aria-label="Период"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setSince(
                e.target.value === 'all'
                  ? ''
                  : new Date(Date.now() - Number(e.target.value) * 86400000).toISOString(),
              );
              setPage(0);
            }}
          >
            <option value="all">За всё время</option>
            <option value="7">Последние 7 дней</option>
            <option value="30">Последние 30 дней</option>
          </SelectControl>
        </label>
      </div>
      <p className="small muted">
        Работа ассистента может оплачиваться и без готового изображения. Запись о списании сама по себе не
        означает успешную генерацию.
      </p>
      {query.isPending ? (
        <p role="status">Загружаем операции…</p>
      ) : query.error ? (
        <div role="alert" className="inline-error">
          <p>Не удалось загрузить историю. {query.error.message}</p>
          <button className="button" onClick={() => void query.refetch()}>
            Повторить загрузку истории
          </button>
        </div>
      ) : !query.data?.items.length ? (
        <p className="transaction-empty">Операций по выбранным условиям пока нет.</p>
      ) : (
        <>
          <p className="small muted">Найдено операций: {query.data.total}</p>
          <ol className="transaction-list">
            {query.data.items.map((t) => {
              const link = conversationLink(t);
              const parts = breakdown(t);
              const expense = direction(t) === 'expense';
              return (
                <li key={t.id} className="transaction-row">
                  <div className="transaction-main">
                    <div>
                      <h3>{transactionTitle(t)}</h3>
                      <p className="small muted">
                        <time>{new Date(t.createdDate).toLocaleString('ru-RU')}</time> · №{t.id}
                      </p>
                      {t.details?.options?.model && (
                        <p className="transaction-model">{t.details.options.model}</p>
                      )}
                      {link ? (
                        <Link className="text-button" to={link}>
                          Беседа №{t.details!.source!.id}
                        </Link>
                      ) : t.details?.source ? (
                        <p className="small muted">
                          {t.details.source.type === 'FILE'
                            ? 'Файл'
                            : t.details.source.type === 'AGENT_GRAPH_RUN'
                              ? 'Запуск агента'
                              : t.details.source.type}
                          : {t.details.source.id}
                        </p>
                      ) : (
                        <p className="small muted">Связь с беседой не указана</p>
                      )}
                      {t.groupId && <p className="small muted">Группа №{t.groupId}</p>}
                    </div>
                    <div className={`transaction-amount ${expense ? 'expense' : 'income'}`}>
                      <strong>
                        {expense ? '−' : '+'}
                        {transactionAmount(t.amount, t.coinId)}
                      </strong>
                      <span>
                        {t.activatedDate ? (expense ? 'Списано' : 'Зачислено') : 'Ожидает проведения'}
                      </span>
                    </div>
                  </div>
                  <details className="transaction-details">
                    <summary>Детализация операции</summary>
                    <div className="details-content">
                      <div className="cost-line">
                        <span>Точная сумма {t.activatedDate ? 'операции' : 'к проведению'}</span>
                        <strong>{transactionAmount(t.amount, t.coinId, true)}</strong>
                      </div>
                      {parts ? (
                        <>
                          <div className="cost-breakdown">
                            {parts.map((part, index) => (
                              <div className="cost-line" key={index}>
                                <span>{part.label}</span>
                                <span>{transactionAmount(part.amount, t.coinId, true)}</span>
                              </div>
                            ))}
                          </div>
                          <p className="small muted">
                            Разбивка рассчитана из сохранённых расходов и курса этой операции. Она входит в
                            сумму выше, а не списывается дополнительно.
                          </p>
                        </>
                      ) : (
                        <p className="small muted">
                          Подтверждённая разбивка стоимости недоступна для этой записи.
                        </p>
                      )}
                      {t.details?.consumption?.model && (
                        <p className="small muted">
                          Токены ассистента: вход — {t.details.consumption.model.input ?? '—'}, выход —{' '}
                          {t.details.consumption.model.output ?? '—'}.
                        </p>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
          {query.data.pages > 1 && (
            <div className="pagination">
              <button className="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Предыдущая страница
              </button>
              <span>
                {page + 1} / {query.data.pages}
              </span>
              <button
                className="button"
                disabled={page + 1 >= query.data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Следующая страница
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
