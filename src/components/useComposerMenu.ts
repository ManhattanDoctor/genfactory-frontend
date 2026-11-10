import { useLayoutEffect, type RefObject } from 'react';
/** Place mobile choices above the whole composer, including its text field. */
export function useComposerMenu(open: boolean, root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const menu = root.current.querySelector<HTMLElement>('[role="listbox"],.cw-model-menu');
    const form = root.current.closest('form');
    if (!menu || !form) return;
    const clear = () => {
      for (const key of [
        'position',
        'bottom',
        'top',
        'left',
        'right',
        'width',
        'maxHeight',
        'zIndex',
      ] as const)
        menu.style[key] = '';
      delete menu.dataset.menuAbove;
    };
    const fit = () => {
      if (innerWidth > 720) {
        clear();
        return;
      }
      const anchor = root.current!.getBoundingClientRect(),
        composer = form.getBoundingClientRect();
      const width = Math.min(340, innerWidth - 32),
        left = Math.max(16, Math.min(anchor.left, innerWidth - width - 16));
      Object.assign(menu.style, {
        position: 'absolute',
        bottom: `${anchor.bottom - composer.top + 10}px`,
        top: 'auto',
        left: `${left - anchor.left}px`,
        right: 'auto',
        width: `${width}px`,
        maxHeight: `${Math.max(100, Math.min(420, composer.top - 80))}px`,
        zIndex: '100',
      });
      menu.dataset.menuAbove = 'true';
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(form);
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
      clear();
    };
  }, [open, root]);
}
