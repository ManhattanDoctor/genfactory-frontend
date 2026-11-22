import { Plus } from 'lucide-react';

export function RequiredPhotoSlots({
  tiles = false,
  count,
  filled,
  disabled,
  onAdd,
}: {
  tiles?: boolean;
  count: number;
  filled: number;
  disabled: boolean;
  onAdd: () => void;
}) {
  if (filled >= count) return null;
  return (
    <div className="composer-template-photos" role="group" aria-label="Обязательные фото">
      {Array.from({ length: count - filled }, (_, index) => {
        const number = filled + index + 1;
        if (tiles)
          return (
            <div key={number} className="feed-photo-tile">
              <button
                type="button"
                disabled={disabled}
                onClick={onAdd}
                aria-label={`Добавить фото ${number}`}
              >
                +
              </button>
              <span>{count === 1 ? 'Фото' : `Фото ${number}`}</span>
            </div>
          );
        return (
          <button
            key={number}
            type="button"
            className="button"
            disabled={disabled}
            onClick={onAdd}
            aria-label={`Добавить фото ${number}`}
          >
            <Plus size={16} aria-hidden="true" /> Фото {number}
          </button>
        );
      })}
    </div>
  );
}
