import './modal-footer.css';
import { useEffect, useRef, useId, type ReactNode, type ReactElement } from 'react';
import { X } from 'lucide-react';
export function Dialog({
  open = true,
  onClose,
  children,
  swipeToClose = false,
  ...attributes
}: {
  open?: boolean;
  swipeToClose?: boolean;
  onClose: () => void;
  children: ReactNode;
  className: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const touch = useRef<{ x: number; y: number } | undefined>(undefined);
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.autofocus = !dialog.querySelector('[autofocus]');
    dialog.showModal();
    if (dialog.autofocus && document.activeElement !== dialog) dialog.focus({ preventScroll: true });
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      {...attributes}
      onTouchStart={(event) => {
        touch.current = undefined;
        if (!swipeToClose || event.touches.length !== 1 || event.currentTarget.scrollTop > 0) return;
        for (
          let node = event.target as HTMLElement;
          node && node !== event.currentTarget;
          node = node.parentElement!
        ) {
          if (node.scrollTop > 0) return;
        }
        const { clientX: x, clientY: y } = event.touches[0];
        touch.current = { x, y };
      }}
      onTouchCancel={() => {
        touch.current = undefined;
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        touch.current = undefined;
        if (!start || event.touches.length) return;
        const { clientX, clientY } = event.changedTouches[0];
        const distance = clientY - start.y;
        if (distance >= 48 && distance > Math.abs(clientX - start.x)) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  open = true,
  headerActions,
  hideHeader = false,
  className = '',
  swipeToClose = false,
}: {
  className?: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  open?: boolean;
  headerActions?: ReactNode;
  swipeToClose?: boolean;
  hideHeader?: boolean;
}): ReactElement {
  const titleId = useId();
  const closeButton = (
    <button
      type="button"
      className={hideHeader ? 'icon-button modal-close' : 'icon-button'}
      onClick={onClose}
      aria-label="Закрыть"
    >
      <X size={20} />
    </button>
  );
  return (
    <Dialog
      open={open}
      swipeToClose={swipeToClose}
      onClose={onClose}
      aria-labelledby={hideHeader ? undefined : titleId}
      aria-label={hideHeader ? title : undefined}
      className={`modal ${wide ? 'wide' : ''} ${className}`}
    >
      {hideHeader ? (
        closeButton
      ) : (
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <div className="modal-head-actions">
            {headerActions}
            {closeButton}
          </div>
        </div>
      )}
      {children}
    </Dialog>
  );
}

export function ModalFooter({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return <footer className={`modal-footer ${className}`}>{children}</footer>;
}
