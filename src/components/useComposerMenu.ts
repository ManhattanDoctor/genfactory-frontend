import { useLayoutEffect, type RefObject } from 'react';
/** Place mobile choices above the whole composer, including its text field. */
export function useComposerMenu(
  open: boolean,
  root: RefObject<HTMLElement | null>,
  scrollable: boolean = false,
): void {
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const menu = root.current.querySelector<HTMLElement>('[role="listbox"],.cw-model-menu');
    const form = root.current.closest('form');
    if (!menu || !form) return;
    const clear = (): void => {
      if (menu.hasAttribute('popover')) {
        if (menu.isConnected && menu.matches(':popover-open')) menu.hidePopover();
        menu.removeAttribute('popover');
      }
      for (const key of [
        'position',
        'bottom',
        'top',
        'left',
        'right',
        'width',
        'maxHeight',
        'zIndex',
        'margin',
      ] as const)
        menu.style[key] = '';
      delete menu.dataset.menuAbove;
    };
    const fit = (): void => {
      if (innerWidth > 720) {
        clear();
        return;
      }
      const anchor = root.current!.getBoundingClientRect(),
        composer = form.getBoundingClientRect();
      const width = Math.min(340, innerWidth - 32),
        left = Math.max(16, Math.min(anchor.left, innerWidth - width - 16));
      if (scrollable) {
        menu.setAttribute('popover', 'manual');
        if (!menu.matches(':popover-open')) menu.showPopover();
      }
      Object.assign(menu.style, {
        position: scrollable ? 'fixed' : 'absolute',
        bottom: `${scrollable ? innerHeight - composer.top + 10 : anchor.bottom - composer.top + 10}px`,
        top: 'auto',
        left: `${scrollable ? left : left - anchor.left}px`,
        right: 'auto',
        width: `${width}px`,
        maxHeight: `${Math.max(100, Math.min(420, composer.top - 80))}px`,
        zIndex: '100',
        ...(scrollable ? { margin: '0' } : {}),
      });
      menu.dataset.menuAbove = 'true';
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(form);
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    // Capture scrolling from any container inside the composer.
    form.addEventListener('scroll', fit, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
      form.removeEventListener('scroll', fit, true);
      clear();
    };
  }, [open, root, scrollable]);
}
