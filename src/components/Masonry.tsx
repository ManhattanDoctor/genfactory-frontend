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
}) {
  const root = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ height: 0, tops: [] as number[] });
  const keys = children.map((child) => child.key).join('|');
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const heights = Array.from({ length: columns }, () => 0);
      const tops = Array.from(element.children, (child, index) => {
        const column = index % columns;
        const top = heights[column];
        heights[column] += child.getBoundingClientRect().height + gap;
        return top;
      });
      const height = Math.max(0, ...heights) - (tops.length ? gap : 0);
      setLayout((previous) =>
        previous.height === height &&
        previous.tops.length === tops.length &&
        previous.tops.every((top, index) => top === tops[index])
          ? previous
          : { height, tops },
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
          style={{
            position: 'absolute',
            width: `calc((100% - ${(columns - 1) * gap}px) / ${columns})`,
            left: `calc(${((index % columns) * 100) / columns}% + ${((index % columns) * gap) / columns}px)`,
            top: layout.tops[index] || 0,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
