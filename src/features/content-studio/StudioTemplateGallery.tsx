import type { ReactElement } from 'react';
import { Heart, Plus } from 'lucide-react';
import type { ITemplate } from './materials';
import { TemplateMedia } from './TemplateMedia';
interface Props {
  genre: string;
  setGenre: (value: string) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (value: boolean) => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  genres: string[];
  visible: ITemplate[];
  selectedTemplate?: string;
  setSelectedTemplate: (id: string | undefined) => void;
  busy: boolean;
  pick: (item: ITemplate) => Promise<void>;
}
export function StudioTemplateGallery({
  genre,
  setGenre,
  favoritesOnly,
  setFavoritesOnly,
  favorites,
  toggleFavorite,
  genres,
  visible,
  selectedTemplate,
  setSelectedTemplate,
  busy,
  pick,
}: Props): ReactElement {
  return (
    <div className="cw-templates-pane">
      <div className="cw-genres" role="group" aria-label="Жанры">
        <button
          type="button"
          className={`cw-genre ${!genre && !favoritesOnly ? 'is-on' : ''}`}
          onClick={() => {
            setGenre('');
            setFavoritesOnly(false);
          }}
        >
          Все
        </button>
        <button
          type="button"
          className={`cw-genre cw-genre-fav ${favoritesOnly ? 'is-on' : ''}`}
          aria-label="Избранные шаблоны"
          aria-pressed={favoritesOnly}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
        >
          <Heart size={16} />
        </button>
        {genres.map((g) => (
          <button
            key={g}
            type="button"
            className={`cw-genre ${genre === g ? 'is-on' : ''}`}
            onClick={() => setGenre(genre === g ? '' : g)}
          >
            {g}
          </button>
        ))}
      </div>
      <div className="cw-scroll" id="cw-gallery">
        {visible.map((item) => (
          <article
            className={`cw-card ds-template-card ${selectedTemplate === item.id ? 'is-picked' : ''}`}
            data-kind={item.kind === 'presentation' ? 'slides' : item.kind}
            key={item.id}
          >
            <div
              className="cw-card-media ds-template-media"
              role="button"
              tabIndex={0}
              aria-label={`Открыть шаблон: ${item.title}`}
              onClick={() => setSelectedTemplate(selectedTemplate === item.id ? undefined : item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter')
                  setSelectedTemplate(selectedTemplate === item.id ? undefined : item.id);
              }}
            >
              <TemplateMedia item={item} />
              <button
                type="button"
                className="cw-add ds-template-add"
                aria-label="Добавить"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  void pick(item);
                }}
              >
                <Plus className="template-add-icon" size={18} aria-hidden="true" />
                <span className="template-add-label">Добавить</span>
              </button>
              <button
                type="button"
                className={`cw-fav ${favorites.includes(item.id) ? 'is-on' : ''}`}
                aria-label={`В избранное: ${item.title}`}
                aria-pressed={favorites.includes(item.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(item.id);
                }}
              >
                <Heart size={18} fill={favorites.includes(item.id) ? 'currentColor' : 'none'} />
              </button>
              <span className="cw-card-label">
                <span>{item.genre}</span>
                <strong>{item.title}</strong>
              </span>
            </div>
          </article>
        ))}
        {!visible.length && (
          <p className="cw-gallery-empty">
            {favoritesOnly ? 'В избранном пока ничего нет.' : 'Таких шаблонов нет.'}
          </p>
        )}
      </div>
    </div>
  );
}
