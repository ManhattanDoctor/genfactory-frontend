import { ModelPickerList } from './ModelPickerList';
import { MODEL_SEARCH_MIN_COUNT } from './presentation';
import type { ReactElement } from 'react';
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
}): ReactElement {
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
        .includes(models.length >= MODEL_SEARCH_MIN_COUNT ? search.toLowerCase() : '') &&
      (filter === 'all' ||
        (filter === 'favorite' && prefs.value.favoriteModels.includes(key(m))) ||
        (filter === 'references' && supportsReferences(m)) ||
        (filter === 'new' && referenceMinimum(m) === 0)),
  );
  return (
    <Modal title="Выбрать модель" onClose={onClose} wide>
      {models.length >= MODEL_SEARCH_MIN_COUNT && (
        <input
          className="gf-model-search"
          aria-label="Поиск моделей"
          placeholder="Название модели"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
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
      {matches.length ? (
        <div className="composer-model-list" role="listbox" aria-label="Модели">
          <ModelPickerList
            showSearch={false}
            items={matches.map((m) => ({ id: key(m), title: modelTitle(m), summary: modelSummary(m) }))}
            selected={value}
            favorites={prefs.value.favoriteModels}
            onSelect={(id) => {
              const model = matches.find((m) => key(m) === id);
              if (model) {
                onSelect(model);
                onClose();
              }
            }}
            onFavorite={
              user
                ? (id) => prefs.update((p) => ({ ...p, favoriteModels: toggleItem(p.favoriteModels, id) }))
                : undefined
            }
          />
        </div>
      ) : (
        <p role="status">Подходящих моделей не найдено.</p>
      )}
      {prefs.error && <p role="alert">{prefs.error}</p>}
    </Modal>
  );
}
