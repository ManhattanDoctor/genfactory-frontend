import type { ReactElement } from 'react';
import { Heart } from 'lucide-react';
import type { ITemplateCard } from './materials';
import { TemplateMedia } from './TemplateMedia';
interface Props {
  genre: string;
  setGenre: (value: string) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (value: boolean) => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  genres: string[];
  visible: ITemplateCard[];
  busy: boolean;
  pick: (item: ITemplateCard) => Promise<void>;
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
            className="cw-card ds-template-card"
            data-kind={item.kind === 'presentation' ? 'slides' : item.kind}
            key={item.id}
          >
            <div className="cw-card-media ds-template-media">
              <TemplateMedia item={item} />
              <button
                type="button"
                className="cw-template-open"
                aria-label={`Открыть шаблон: ${item.title}`}
                disabled={busy}
                onClick={(event) => {
                  event.currentTarget.focus({ preventScroll: true });
                  void pick(item);
                }}
              />
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
