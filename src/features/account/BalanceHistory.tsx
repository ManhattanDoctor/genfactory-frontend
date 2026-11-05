import { TransactionPreview } from './TransactionPreview';
import { ChevronDown } from 'lucide-react';
import { modelTitle } from '../catalog/presentation';
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
  const [expanded, setExpanded] = useState<number[]>([]);
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
      <div className="transaction-filters">
        <label className="setting-field">
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
          <ol className="transaction-list">
            {query.data.items.map((t) => {
              const link = conversationLink(t);
              const parts = breakdown(t);
              const expense = direction(t) === 'expense';
              return (
                <li key={t.id} className="transaction-row">
                  <div className="transaction-main">
                    <TransactionPreview key={t.id} transaction={t} />
                    <div>
                      <h3>{transactionTitle(t)}</h3>
                      <p className="small muted">
                        <time>{new Date(t.createdDate).toLocaleString('ru-RU')}</time> · №{t.id}
                      </p>
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
                  <div className="transaction-actions">
                    {link && (
                      <Link className="transaction-conversation" to={link}>
                        Беседа №{t.details!.source!.id}
                      </Link>
                    )}
                    <button
                      className="transaction-conversation transaction-toggle"
                      aria-expanded={expanded.includes(t.id)}
                      aria-controls={`transaction-detail-${t.id}`}
                      onClick={() =>
                        setExpanded((v) => (v.includes(t.id) ? v.filter((id) => id !== t.id) : [...v, t.id]))
                      }
                    >
                      Детали операции <ChevronDown size={14} />
                    </button>
                  </div>
                  <div
                    id={`transaction-detail-${t.id}`}
                    className="transaction-details"
                    hidden={!expanded.includes(t.id)}
                  >
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
                          <p className="small muted">Входит в общую сумму.</p>
                        </>
                      ) : (
                        <p className="small muted">
                          Разбивка для этой операции не сохранена или не подтверждена.
                        </p>
                      )}
                      <dl className="transaction-facts">
                        {t.details?.options?.model && (
                          <div>
                            <dt>
                              {t.details.model?.includes('CONVERSATION') ? 'Модель ассистента' : 'Модель'}
                            </dt>
                            <dd>
                              {modelTitle({
                                reference: {
                                  provider: t.details.model || '',
                                  model: t.details.options.model,
                                },
                                name: t.details.options.model,
                              })}
                            </dd>
                          </div>
                        )}
                        {t.details?.consumption?.model && (
                          <>
                            <div>
                              <dt>Входящие токены</dt>
                              <dd>{t.details.consumption.model.input?.toLocaleString('ru-RU') ?? '—'}</dd>
                            </div>
                            <div>
                              <dt>Исходящие токены</dt>
                              <dd>{t.details.consumption.model.output?.toLocaleString('ru-RU') ?? '—'}</dd>
                            </div>
                          </>
                        )}
                        {!link && t.details?.source && (
                          <div>
                            <dt>Источник</dt>
                            <dd>
                              {t.details.source.type === 'FILE'
                                ? 'Файл'
                                : t.details.source.type === 'AGENT_GRAPH_RUN'
                                  ? 'Запуск агента'
                                  : t.details.source.type}{' '}
                              №{t.details.source.id}
                            </dd>
                          </div>
                        )}
                        {t.activatedDate && (
                          <div>
                            <dt>Проведена</dt>
                            <dd>{new Date(t.activatedDate).toLocaleString('ru-RU')}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  </div>
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
