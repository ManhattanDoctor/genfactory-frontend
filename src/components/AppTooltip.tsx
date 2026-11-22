import { useEffect, useId } from 'react';
import './app-tooltip.css';

const selector = '[data-tooltip], :is(button, a, summary, [role="button"])[aria-label]';

function trigger(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const element = node.closest<HTMLElement>(selector);
  if (element?.dataset.tooltip || (element?.getAttribute('aria-label') && !element.innerText.trim()))
    return element;
  return null;
}

/** Use the same top layer as the active dialog so its hint stays visible and accessible. */
export function AppTooltip() {
  const id = useId();
  useEffect(() => {
    const tip = document.createElement('div');
    tip.id = id;
    tip.className = 'app-tooltip';
    tip.popover = 'manual';
    tip.setAttribute('role', 'tooltip');
    let anchor: HTMLElement | null = null;
    let timer: number | undefined;
    const hide = () => {
      window.clearTimeout(timer);
      if (anchor) {
        const ids = (anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== id);
        if (ids.length) anchor.setAttribute('aria-describedby', ids.join(' '));
        else anchor.removeAttribute('aria-describedby');
      }
      anchor = null;
      tip.remove();
    };
    const position = () => {
      if (!anchor?.isConnected || !anchor.getClientRects().length) return hide();
      if (!tip.isConnected) return;
      const r = anchor.getBoundingClientRect();
      const w = tip.offsetWidth,
        h = tip.offsetHeight;
      if (r.bottom < 0 || r.top > innerHeight) return hide();
      tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + (r.width - w) / 2)) + 'px';
      tip.style.top = Math.max(8, r.bottom + h + 14 <= innerHeight ? r.bottom + 6 : r.top - h - 6) + 'px';
    };
    const show = (target: HTMLElement | null, delay: number) => {
      if (anchor === target) return;
      hide();
      if (!target) return;
      anchor = target;
      timer = window.setTimeout(() => {
        if (!target.isConnected) return hide();
        tip.textContent = target.dataset.tooltip || target.getAttribute('aria-label');
        (target.closest('dialog[open]') || document.body).append(tip);
        tip.showPopover();
        const previous = target.getAttribute('aria-describedby');
        target.setAttribute('aria-describedby', previous ? previous + ' ' + id : id);
        position();
      }, delay);
    };
    const focused = () =>
      trigger(document.activeElement?.matches(':focus-visible') ? document.activeElement : null);
    const hover = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') show(trigger(event.target) || focused(), 250);
    };
    const leave = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') show(trigger(event.relatedTarget) || focused(), 250);
    };
    const focus = (event: FocusEvent) => show(trigger(event.target), 0);
    const blur = (event: FocusEvent) => show(trigger(event.relatedTarget), 0);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('pointerover', hover);
    document.addEventListener('pointerout', leave);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', blur);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('keydown', escape);
    document.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    return () => {
      hide();
      document.removeEventListener('pointerover', hover);
      document.removeEventListener('pointerout', leave);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', blur);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
    };
  }, [id]);
  return null;
}
