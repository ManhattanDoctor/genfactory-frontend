import { isAllowedProvider } from '../../lib/modelPolicy';
import { modelTitle, modelSummary } from './presentation';
import { useState } from 'react';
import { Modal } from '../../components/Modal';
import type { IModelDescription } from '../../lib/types';
import { referenceMinimum, supportsReferences } from './schema';
import { toggleItem, usePreferences } from '../workspace/preferences';
import { useAuth } from '../auth/AuthProvider';
import { favoritesFirst, modelKey as key } from './presentation';
export function ModelBrowser({
  models,
  value,
  onSelect,
  onClose,
}: {
  models: IModelDescription[];
  value: string;
  onSelect: (model: IModelDescription) => void;
  onClose: () => void;
}) {
  const prefs = usePreferences();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const matches = favoritesFirst(
    models
      .filter((model) => isAllowedProvider(model.reference.provider))
      .sort((a, b) => modelTitle(a).localeCompare(modelTitle(b), 'ru', { numeric: true })),
    prefs.value.favoriteModels,
    key,
  ).filter(
    (m) =>
      `${modelTitle(m)} ${m.reference.model} ${m.reference.provider}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'favorite' && prefs.value.favoriteModels.includes(key(m))) ||
        (filter === 'references' && supportsReferences(m)) ||
        (filter === 'new' && referenceMinimum(m) === 0)),
  );
  return (
    <Modal title="Выбрать модель" onClose={onClose} wide>
      <input
        aria-label="Поиск моделей"
        autoFocus
        placeholder="Название модели"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="chips model-filters">
        {[
          ['all', 'Все'],
          ['references', 'С исходным фото'],
          ['new', 'Без исходного фото'],
        ].map(([id, label]) => (
          <button key={id} className={`chip ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="model-browser-list">
        {matches.map((m) => (
          <article className="model-browser-card" key={key(m)}>
            <div>
              <h3>{modelTitle(m)}</h3>
              <p className="small">{modelSummary(m)}</p>
              <div className="workspace-actions">
                <button
                  className="button primary"
                  onClick={() => {
                    onSelect(m);
                    onClose();
                  }}
                >
                  {value === key(m) ? 'Выбрана' : 'Выбрать'}
                </button>
                <button
                  className="button"
                  disabled={!user}
                  aria-label={`${prefs.value.favoriteModels.includes(key(m)) ? 'Убрать из избранных' : 'В избранные'}: ${modelTitle(m)}`}
                  onClick={() =>
                    prefs.update((p) => ({ ...p, favoriteModels: toggleItem(p.favoriteModels, key(m)) }))
                  }
                >
                  {prefs.value.favoriteModels.includes(key(m)) ? '★' : '☆'}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!matches.length && <p role="status">Подходящих моделей не найдено.</p>}
      {prefs.error && <p role="alert">{prefs.error}</p>}
    </Modal>
  );
}
