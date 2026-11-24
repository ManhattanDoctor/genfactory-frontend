import { useId, useRef, type ReactNode } from 'react';

const shapes: Record<string, [string, number, number]> = {
  '1:1': ['Квадрат', 18, 18],
  '4:5': ['Портрет', 15, 19],
  '3:4': ['Вертикаль', 14, 19],
  '2:3': ['Выше', 13, 20],
  '9:16': ['Сторис', 11, 20],
  '5:4': ['Чуть шире', 19, 15],
  '4:3': ['Классика', 19, 14],
  '3:2': ['Фото', 20, 13],
  '16:9': ['Широкий экран', 22, 12],
  '21:9': ['Широкое кино', 24, 10],
};

export function AspectShape({ value }: { value: string }) {
  if (!/^\d+:\d+$/.test(value)) return null;
  const [x, y] = value.split(':').map(Number);
  const [, width, height] = shapes[value] || ['', (20 * x) / Math.max(x, y), (20 * y) / Math.max(x, y)];
  return (
    <span className="aspect-shape-slot" aria-hidden="true">
      <i style={{ width, height }} />
    </span>
  );
}

export function ImageAspectGrid({
  values,
  selected,
  disabled,
  onSelect,
}: {
  values: string[];
  selected: string;
  disabled: boolean;
  onSelect: (value: string) => void;
}) {
  const ordered = [
    ...Object.keys(shapes).filter((value) => values.includes(value)),
    ...values.filter((value) => !shapes[value]),
  ];
  return (
    <div className="image-aspect-grid" role="group" aria-label="Соотношение сторон">
      {ordered.map((value) => (
        <button
          key={value}
          type="button"
          aria-label={value}
          aria-pressed={selected === value}
          disabled={disabled}
          onClick={() => onSelect(value)}
        >
          <AspectShape value={value} />
          <span>
            <strong>{value}</strong>
            <small>{shapes[value]?.[0]}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

export function ImageAspectPicker({
  value,
  referenceRatio,
  disabled,
  label = 'Стороны',
  children,
}: {
  value: string;
  referenceRatio: boolean;
  disabled: boolean;
  label?: string;
  children: (close: () => void) => ReactNode;
}) {
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);
  return (
    <>
      <button
        type="button"
        className="cw-chip image-aspect-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        popoverTarget={id}
        disabled={disabled}
      >
        <AspectShape value={value} />
        {referenceRatio ? 'По исходному кадру' : value || 'Стороны'}
      </button>
      <div
        ref={popup}
        id={id}
        className="image-aspect-popup"
        popover="auto"
        role="dialog"
        aria-label="Стороны"
      >
        <div className="aspect-title">Какой кадр нужен</div>
        {children(() => popup.current?.hidePopover())}
      </div>
    </>
  );
}
