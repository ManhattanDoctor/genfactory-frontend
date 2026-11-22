import { useLayoutEffect, type RefObject } from 'react';

export function useActionMenuPosition(
  menu: RefObject<HTMLDetailsElement | null>,
  open: boolean,
  preferredWidth: number,
): void {
  useLayoutEffect(() => {
    if (!open) return;
    const panel = menu.current?.querySelector<HTMLElement>('[data-action-panel]');
    const trigger = menu.current?.querySelector('summary');
    if (!panel || !trigger) return;
    const style = getComputedStyle(panel);
    const gutter = parseFloat(style.getPropertyValue('--action-menu-gutter')) || 16;
    const inset = parseFloat(style.getPropertyValue('--action-menu-inset')) || 0;
    const fit = (): void => {
      const anchor = trigger.getBoundingClientRect();
      panel.style.width = `${Math.min(preferredWidth, innerWidth - 2 * gutter)}px`;
      const width = panel.getBoundingClientRect().width;
      const below = innerHeight - anchor.bottom - gutter - 6;
      const above = anchor.top - gutter - 6;
      const down = below >= Math.min(panel.scrollHeight + 2, 420) || below >= above;
      const height = Math.max(0, Math.min(420, down ? below : above));
      Object.assign(panel.style, {
        position: 'fixed',
        margin: '0',
        right: 'auto',
        bottom: 'auto',
        maxHeight: `${height}px`,
        left: `${Math.max(gutter, Math.min(anchor.right - width - inset, innerWidth - width - gutter))}px`,
        top: `${down ? anchor.bottom + 6 : Math.max(gutter, anchor.top - Math.min(panel.scrollHeight + 2, height) - 6)}px`,
      });
    };
    panel.setAttribute('popover', 'manual');
    panel.showPopover();
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(panel);
    window.addEventListener('resize', fit);
    window.addEventListener('scroll', fit, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
      window.removeEventListener('scroll', fit, true);
      if (panel.matches(':popover-open')) panel.hidePopover();
      panel.removeAttribute('popover');
      panel.removeAttribute('style');
    };
  }, [menu, open, preferredWidth]);
}
