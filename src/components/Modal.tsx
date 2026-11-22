import './modal-footer.css';
import { useEffect, useRef, useId, type ReactNode, type ReactElement } from 'react';
import { X } from 'lucide-react';
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  headerActions,
  hideHeader = false,
  className = '',
}: {
  className?: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  headerActions?: ReactNode;
  hideHeader?: boolean;
}): ReactElement {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={hideHeader ? undefined : titleId}
      aria-label={hideHeader ? title : undefined}
      className={`modal ${wide ? 'wide' : ''} ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {hideHeader ? (
        <button type="button" className="icon-button modal-close" onClick={onClose} aria-label="Закрыть">
          <X size={20} />
        </button>
      ) : (
        <div className="modal-head">
          <h2 id={titleId} data-tooltip={title}>
            {title}
          </h2>
          <div className="modal-head-actions">
            {headerActions}
            <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
              <X size={20} />
            </button>
          </div>
        </div>
      )}
      {children}
    </dialog>
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
