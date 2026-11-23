import { MODEL_SEARCH_MIN_COUNT } from './presentation';
import { Fragment, useState } from 'react';
import { Box, Check, Heart, Info } from 'lucide-react';
import './model-picker-list.css';

const marks: [RegExp, string][] = [
  [/gemini|veo|nano[- ]banana/i, 'google-gemini'],
  [/google|imagen/i, 'google'],
  [/openai|gpt|sora/i, 'openai'],
  [/grok|x-ai|\bxai\b/i, 'xai-grok'],
  [/runway|\bgen[- ]?[34]\b/i, 'runway'],
  [/bytedance|seedance|seedream/i, 'bytedance'],
  [/alibaba|qwen|\bwan/i, 'alibaba'],
  [/flux|black[- ]forest/i, 'black-forest-labs-flux'],
  [/microsoft|mai-image/i, 'microsoft'],
  [/kling|kuaishou/i, 'kuaishou'],
  [/luma|dream machine/i, 'luma'],
  [/recraft/i, 'recraft'],
  [/minimax|hailuo/i, 'minimax'],
  [/meta-llama|\bllama|movie gen/i, 'meta'],
  [/anthropic|claude/i, 'anthropic'],
  [/moonshot|kimi/i, 'moonshot'],
  [/huggingface/i, 'huggingface'],
];

type Item = { id: string; title: string; summary?: string; tags?: string[] };

export function ModelPickerList({
  items,
  selected,
  favorites,
  onSelect,
  onFavorite,
  onInfo,
  onClose,
  showSearch = true,
}: {
  items: Item[];
  selected?: string;
  favorites?: string[];
  onSelect: (id: string) => void;
  onFavorite?: (id: string) => void;
  onInfo?: (id: string) => void;
  onClose?: () => void;
  showSearch?: boolean;
}) {
  const [search, setSearch] = useState('');
  const searchable = showSearch && items.length >= MODEL_SEARCH_MIN_COUNT;
  const query = searchable ? search.trim().toLowerCase() : '';
  const matches = items.filter(({ id, title, summary, tags }) =>
    [title, id, summary, ...(tags || [])].join(' ').toLowerCase().includes(query),
  );
  const firstFavorite = matches.find((item) => favorites?.includes(item.id))?.id;
  const firstOther = matches.find((item) => !favorites?.includes(item.id))?.id;
  return (
    <div className={onClose ? 'gf-model-list composer-model-list' : 'gf-model-list'}>
      <div className={onClose ? 'image-model-head' : undefined} hidden={!searchable && !onClose}>
        {searchable && (
          <input
            type="search"
            className="gf-model-search"
            aria-label="Поиск моделей"
            placeholder={onClose ? 'Найти модель' : 'Поиск моделей'}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        {onClose && (
          <button type="button" className="image-model-close" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        )}
      </div>
      {matches.map(({ id, title, summary, tags }) => {
        // The part before ":" identifies the adapter, which can serve multiple brands.
        const model = id.slice(id.indexOf(':') + 1);
        const mark = marks.find(([pattern]) => pattern.test(model + ' ' + title))?.[1];
        const favorite = favorites?.includes(id);
        return (
          <Fragment key={id}>
            {onClose && firstFavorite && (id === firstFavorite || id === firstOther) && (
              <div className="model-group-label">{id === firstFavorite ? 'Избранное' : 'Все модели'}</div>
            )}
            <div className="gf-model-row">
              <button
                type="button"
                role="option"
                aria-selected={selected === id}
                aria-label={title}
                title={title}
                className="gf-model-choice"
                onClick={() => onSelect(id)}
              >
                {mark ? (
                  <img src={'/media/model-logos/' + mark + '.svg'} width="26" height="26" alt="" />
                ) : (
                  <span aria-hidden="true" className="gf-model-placeholder">
                    <Box size={18} />
                  </span>
                )}
                <span className="gf-model-copy">
                  <span className="gf-model-heading">
                    <span className="gf-model-name" title={title}>
                      {title}
                    </span>
                  </span>
                  {summary && (
                    <small className="gf-model-summary" title={summary}>
                      {summary}
                    </small>
                  )}
                  <span className="gf-model-tags">
                    {' '}
                    {(tags ?? (/\b(fast|turbo|highspeed)\b/i.test(model) ? ['Быстро'] : [])).map((tag) => (
                      <span key={tag} className="compact-tag">
                        {tag}
                      </span>
                    ))}
                  </span>
                </span>
                {!onClose && (
                  <span aria-hidden="true" className="gf-model-check">
                    {selected === id && <Check size={12} />}
                  </span>
                )}
              </button>
              <div className="gf-model-actions">
                {onFavorite && (
                  <button
                    type="button"
                    aria-pressed={favorite}
                    aria-label={(favorite ? 'Убрать из избранных: ' : 'В избранные: ') + title}
                    title={(favorite ? 'Убрать из избранных: ' : 'В избранные: ') + title}
                    onClick={() => onFavorite(id)}
                  >
                    <Heart size={onClose ? 18 : 16} fill={favorite ? 'currentColor' : 'none'} />
                  </button>
                )}
                {onClose && (
                  <span aria-hidden="true" className="gf-model-check">
                    {selected === id && <Check size={12} />}
                  </span>
                )}
                {onInfo && (
                  <button
                    type="button"
                    aria-label={'О модели ' + title}
                    title={'О модели ' + title}
                    onClick={(event) => {
                      event.currentTarget.focus({ preventScroll: true });
                      onInfo(id);
                    }}
                  >
                    {onClose ? 'i' : <Info size={16} />}
                  </button>
                )}
              </div>
            </div>
          </Fragment>
        );
      })}
      {!matches.length && <p role="status">Модели не найдены.</p>}
    </div>
  );
}
