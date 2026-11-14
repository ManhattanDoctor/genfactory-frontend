import { memo, useLayoutEffect, useRef, useState, type ReactElement, type RefObject } from 'react';

/** Stable slots preserve order and scroll geometry; long galleries mount nearby cards only. */
export function Masonry({
  children,
  columns,
  gap = 12,
  scrollRoot,
  estimateHeight,
}: {
  children: ReactElement[];
  columns: number;
  gap?: number;
  scrollRoot?: RefObject<HTMLElement | null>;
  estimateHeight?: (key: string, width: number) => number;
}): ReactElement {
  const root = useRef<HTMLDivElement>(null);
  const assignments = useRef({ columns, items: new Map<string, number>() });
  const sizes = useRef(new Map<string, { height: number; width: number }>());
  const estimate = useRef(estimateHeight);
  estimate.current = estimateHeight;
  const [visible, setVisible] = useState(new Set<string>());
  const [focused, setFocused] = useState<string>();
  const [layout, setLayout] = useState({
    height: 0,
    items: new Map<string, { column: number; top: number; height: number }>(),
  });
  const virtual = children.length >= 200;
  const keys = children.map((child) => child.key).join('|');
  const mounted = children.map(
    (child, index) =>
      !virtual ||
      visible.has(String(child.key)) ||
      focused === String(child.key) ||
      child.key === 'next-page' ||
      (!visible.size && index < columns * 6),
  );
  const mountedKeys = children
    .filter((_, index) => mounted[index])
    .map((child) => child.key)
    .join('|');

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const previous =
      assignments.current.columns === columns ? assignments.current.items : new Map<string, number>();
    const assigned = new Map(
      children.map((child, index) => [String(child.key), previous.get(String(child.key)) ?? index % columns]),
    );
    assignments.current = { columns, items: assigned };
    for (const key of sizes.current.keys()) if (!assigned.has(key)) sizes.current.delete(key);
    const measure = () => {
      const width = (element.clientWidth - (columns - 1) * gap) / columns;
      if (width <= 0) return;
      const heights = Array.from({ length: columns }, () => 0);
      const items = new Map<string, { column: number; top: number; height: number }>();
      for (const [key, column] of assigned) {
        const cached = sizes.current.get(key);
        const height = cached
          ? (cached.height * width) / cached.width
          : (estimate.current?.(key, width) ?? width * 0.75);
        const top = heights[column];
        heights[column] += height + gap;
        items.set(key, { column, top, height });
      }
      const height = Math.max(0, ...heights) - (items.size ? gap : 0);
      setLayout((previous) =>
        previous.height === height &&
        previous.items.size === items.size &&
        Array.from(items).every(
          ([key, item]) =>
            previous.items.get(key)?.top === item.top &&
            previous.items.get(key)?.column === item.column &&
            previous.items.get(key)?.height === item.height,
        )
          ? previous
          : { height, items },
      );
    };
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const child = entry.target as HTMLElement;
        const key = child.dataset.masonryKey;
        const size = entry.borderBoxSize[0];
        if (key && size && child.dataset.masonryMounted === 'true' && size.inlineSize > 0)
          sizes.current.set(key, { height: size.blockSize, width: size.inlineSize });
      }
      measure();
    });
    observer.observe(element);
    for (const child of element.children)
      if ((child as HTMLElement).dataset.masonryMounted === 'true') observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [columns, gap, keys, mountedKeys]);

  useLayoutEffect(() => {
    if (!virtual || !root.current) return;
    const currentKeys = new Set(children.map((child) => String(child.key)));
    setVisible((previous) => {
      const next = new Set([...previous].filter((key) => currentKeys.has(key)));
      return next.size === previous.size ? previous : next;
    });
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const key = (entry.target as HTMLElement).dataset.masonryKey!;
            if (entry.isIntersecting) next.add(key);
            else next.delete(key);
          }
          return next.size === previous.size && [...next].every((key) => previous.has(key)) ? previous : next;
        });
      },
      { root: scrollRoot?.current, rootMargin: '800px 0px' },
    );
    for (const child of root.current.children) observer.observe(child);
    return () => observer.disconnect();
  }, [virtual, keys, scrollRoot]);

  return (
    <div
      ref={root}
      className="masonry-cards"
      data-columns={columns}
      style={{ position: 'relative', width: '100%', height: layout.height }}
    >
      {children.map((child, index) => {
        const item = layout.items.get(String(child.key));
        const column = item?.column ?? index % columns;
        return (
          <MasonrySlot
            key={child.key}
            itemKey={String(child.key)}
            columns={columns}
            gap={gap}
            column={column}
            top={item?.top || 0}
            height={item?.height}
            mounted={mounted[index]}
            onFocus={setFocused}
          >
            {child}
          </MasonrySlot>
        );
      })}
    </div>
  );
}

const MasonrySlot = memo(function MasonrySlot({
  itemKey,
  columns,
  gap,
  column,
  top,
  height,
  mounted,
  onFocus,
  children,
}: {
  itemKey: string;
  columns: number;
  gap: number;
  column: number;
  top: number;
  height?: number;
  mounted: boolean;
  onFocus: (key: string) => void;
  children: ReactElement;
}): ReactElement {
  return (
    <div
      data-masonry-key={itemKey}
      data-masonry-mounted={mounted}
      onFocusCapture={() => onFocus(itemKey)}
      style={{
        position: 'absolute',
        width: `calc((100% - ${(columns - 1) * gap}px) / ${columns})`,
        left: `calc(${(column * 100) / columns}% + ${(column * gap) / columns}px)`,
        top,
        height: mounted ? undefined : height,
      }}
    >
      {mounted ? children : null}
    </div>
  );
});
