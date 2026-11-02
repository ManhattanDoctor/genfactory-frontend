import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { templates } from './presetCatalog';
import { toggleItem, usePreferences } from './preferences';
import { useAuth } from '../auth/AuthProvider';
export function Templates() {
  const prefs = usePreferences();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('Все');
  const [search, setSearch] = useState('');
  const items = [...templates, ...prefs.value.presets];
  const visible = items.filter(
    (p) =>
      (filter === 'Все' ||
        (filter === 'Избранное'
          ? prefs.value.favoriteTemplates.includes(p.id)
          : filter === 'Мои'
            ? prefs.value.presets.some((x) => x.id === p.id)
            : p.kind === filter)) &&
      `${p.name} ${p.category} ${p.prompt}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="page-content">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">НАЧНИТЕ С ГОТОВОЙ ИДЕИ</span>
          <h1>Шаблоны</h1>
          <p>Выберите сценарий, добавьте свои детали и референсы.</p>
        </div>
      </div>
      <div className="library-toolbar">
        <div className="chips">
          {[
            ['Все', 'Все'],
            ['image', 'Изображения'],
            ['video', 'Видео'],
            ['Избранное', 'Избранное'],
            ['Мои', 'Мои'],
          ].map(([id, label]) => (
            <button
              className={`chip ${filter === id ? 'active' : ''}`}
              key={id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          aria-label="Поиск шаблонов"
          placeholder="Поиск шаблонов"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <p className="small muted">
        Свои шаблоны и избранное хранятся в этом браузере, отдельно для каждого аккаунта.
      </p>
      <div className="template-grid">
        {visible.map((p) => (
          <article className="account-card" key={p.id}>
            <span className="eyebrow">
              {p.kind === 'image' ? 'ИЗОБРАЖЕНИЕ' : 'ВИДЕО'} · {p.category}
            </span>
            <h2>{p.name}</h2>
            <p>{p.prompt}</p>
            <div className="workspace-actions">
              <button
                className="button primary"
                onClick={() =>
                  navigate(`/${p.kind}`, { state: { prompt: p.prompt, preset: p, userId: user?.id } })
                }
              >
                Использовать шаблон
              </button>
              <button
                className="button"
                disabled={!user}
                aria-label={`${prefs.value.favoriteTemplates.includes(p.id) ? 'Убрать из избранного' : 'В избранное'}: ${p.name}`}
                onClick={() =>
                  prefs.update((v) => ({ ...v, favoriteTemplates: toggleItem(v.favoriteTemplates, p.id) }))
                }
              >
                {prefs.value.favoriteTemplates.includes(p.id) ? '★' : '☆'}
              </button>
              {prefs.value.presets.some((x) => x.id === p.id) && (
                <button
                  className="text-button"
                  onClick={() =>
                    prefs.update((v) => ({
                      ...v,
                      presets: v.presets.filter((x) => x.id !== p.id),
                      favoriteTemplates: v.favoriteTemplates.filter((x) => x !== p.id),
                    }))
                  }
                >
                  Удалить шаблон
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <p className="empty-state">
          Подходящих шаблонов пока нет. Сохранить свой можно в редакторе изображения или видео.
        </p>
      )}
      {prefs.error && <p role="alert">{prefs.error}</p>}
    </div>
  );
}
