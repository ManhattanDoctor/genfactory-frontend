import { useLayoutEffect, useRef, useState, type ReactElement } from 'react';

/** Keep cards under one parent so reordering never restarts their media. */
export function Masonry({
  children,
  columns,
  gap = 12,
}: {
  children: ReactElement[];
  columns: number;
  gap?: number;
}): ReactElement {
  const root = useRef<HTMLDivElement>(null);
  const assignments = useRef({ columns, items: new Map<string, number>() });
  const [layout, setLayout] = useState({
    height: 0,
    items: new Map<string, { column: number; top: number }>(),
  });
  const keys = children.map((child) => child.key).join('|');
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const previous =
      assignments.current.columns === columns ? assignments.current.items : new Map<string, number>();
    const assigned = new Map(
      children.map((child, index) => [String(child.key), previous.get(String(child.key)) ?? index % columns]),
    );
    assignments.current = { columns, items: assigned };
    const measure = () => {
      const heights = Array.from({ length: columns }, () => 0);
      const items = new Map<string, { column: number; top: number }>();
      Array.from(element.children).forEach((child) => {
        const key = (child as HTMLElement).dataset.masonryKey!;
        const column = assigned.get(key)!;
        const top = heights[column];
        heights[column] += child.getBoundingClientRect().height + gap;
        items.set(key, { column, top });
      });
      const height = Math.max(0, ...heights) - (items.size ? gap : 0);
      setLayout((previous) =>
        previous.height === height &&
        previous.items.size === items.size &&
        Array.from(items).every(
          ([key, item]) =>
            previous.items.get(key)?.top === item.top && previous.items.get(key)?.column === item.column,
        )
          ? previous
          : { height, items },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [columns, gap, keys]);
  return (
    <div
      ref={root}
      className="masonry-cards"
      data-columns={columns}
      style={{ position: 'relative', width: '100%', height: layout.height }}
    >
      {children.map((child, index) => (
        <div
          key={child.key}
          data-masonry-key={String(child.key)}
          style={{
            position: 'absolute',
            width: `calc((100% - ${(columns - 1) * gap}px) / ${columns})`,
            left: `calc(${((layout.items.get(String(child.key))?.column ?? index % columns) * 100) / columns}% + ${((layout.items.get(String(child.key))?.column ?? index % columns) * gap) / columns}px)`,
            top: layout.items.get(String(child.key))?.top || 0,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
