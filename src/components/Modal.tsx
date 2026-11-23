import './modal-footer.css';
import { useEffect, useRef, useId, type ReactNode, type ReactElement } from 'react';
import { X } from 'lucide-react';
export function Dialog({
  open = true,
  onClose,
  children,
  ...attributes
}: {
  open?: boolean;
  onClose: () => void;
  children: ReactNode;
  className: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      {...attributes}
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
}: {
  className?: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  open?: boolean;
  headerActions?: ReactNode;
  hideHeader?: boolean;
}): ReactElement {
  const titleId = useId();
  const closeButton = (
    <button
      type="button"
      className={hideHeader ? 'icon-button modal-close' : 'icon-button'}
      onClick={onClose}
      aria-label="Закрыть"
      title="Закрыть"
    >
      <X size={20} />
    </button>
  );
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={hideHeader ? undefined : titleId}
      aria-label={hideHeader ? title : undefined}
      className={`modal ${wide ? 'wide' : ''} ${className}`}
    >
      {hideHeader ? (
        closeButton
      ) : (
        <div className="modal-head">
          <h2 id={titleId} title={title}>
            {title}
          </h2>
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
