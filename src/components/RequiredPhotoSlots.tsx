import { Plus } from 'lucide-react';

export function RequiredPhotoSlots({
  count,
  filled,
  disabled,
  onAdd,
}: {
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
