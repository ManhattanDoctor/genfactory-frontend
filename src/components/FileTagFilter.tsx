import { SelectControl } from './SelectControl';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/AuthProvider';
export function FileTagFilter({
  tags,
  match,
  onChange,
  onMatch,
}: {
  tags: string[];
  match: 'all' | 'any';
  onChange: (tags: string[]) => void;
  onMatch: (match: 'all' | 'any') => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const suggestions = useQuery({
    queryKey: ['files', user?.id, 'tags', query, page],
    queryFn: () => api.fileTags(query, page),
    enabled: !!user && open,
  });
  useEffect(() => {
    if (suggestions.data && page > 0 && page >= suggestions.data.pages)
      setPage(Math.max(0, suggestions.data.pages - 1));
  }, [suggestions.data, page]);
  const toggle = (tag: string) =>
    onChange(tags.includes(tag) ? tags.filter((value) => value !== tag) : [...tags, tag]);
  return (
    <div className="file-tag-filter">
      {!!tags.length && (
        <div className="chips" aria-label="Выбранные теги">
          {tags.map((tag) => (
            <button
              type="button"
              className="chip active"
              key={tag}
              onClick={() => toggle(tag)}
              aria-label={`Убрать фильтр ${tag}`}
            >
              {tag} ×
            </button>
          ))}
          <button type="button" className="text-button" onClick={() => onChange([])}>
            Сбросить теги
          </button>
        </div>
      )}
      <details className="workspace-details" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>Фильтр по тегам{tags.length ? ` (${tags.length})` : ''}</summary>
        <div className="details-content file-form">
          <input
            aria-label="Найти тег"
            placeholder="Найти тег"
            maxLength={64}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <label className="setting-field">
            <span>Совпадение тегов</span>
            <SelectControl
              aria-label="Совпадение тегов"
              value={match}
              onChange={(event) => onMatch(event.target.value as 'all' | 'any')}
            >
              <option value="all">Все выбранные</option>
              <option value="any">Любой из выбранных</option>
            </SelectControl>
          </label>
          {suggestions.isLoading && <p role="status">Загружаем теги…</p>}
          {suggestions.error && (
            <p role="alert">
              Не удалось загрузить теги.{' '}
              <button type="button" className="text-button" onClick={() => void suggestions.refetch()}>
                Повторить
              </button>
            </p>
          )}
          <div className="chips">
            {suggestions.data?.items.map((item) => (
              <button
                type="button"
                className={`chip ${tags.includes(item.tag) ? 'active' : ''}`}
                aria-pressed={tags.includes(item.tag)}
                disabled={!tags.includes(item.tag) && tags.length >= 32}
                key={item.tag}
                onClick={() => toggle(item.tag)}
              >
                {item.tag} <span className="muted">{item.count}</span>
              </button>
            ))}
          </div>
          {suggestions.data && !suggestions.data.items.length && <p>Теги не найдены.</p>}
          {suggestions.data && suggestions.data.pages > 1 && (
            <div className="pagination">
              <button
                type="button"
                className="button"
                disabled={!page}
                onClick={() => setPage((value) => value - 1)}
              >
                Предыдущие теги
              </button>
              <span>
                {page + 1} / {suggestions.data.pages}
              </span>
              <button
                type="button"
                className="button"
                disabled={page + 1 >= suggestions.data.pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Следующие теги
              </button>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
